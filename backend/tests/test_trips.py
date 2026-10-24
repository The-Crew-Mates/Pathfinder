import pytest


def test_contact_must_consent_before_trip_starts(rig):
    user = rig.user()
    cid = rig.contact(user, verified=False)
    trip = rig.trip(user, cid, start=False)
    assert rig.client.post(f"/v1/trips/{trip['id']}/start", headers=user).status_code == 409
    rig.app.state.worker.tick()
    token = rig.consent_token(user)
    assert rig.client.post("/v1/contacts/confirm", json={"token": token}).status_code == 200
    assert rig.client.post(f"/v1/trips/{trip['id']}/start", headers=user).status_code == 200


def test_expired_contact_invitation_can_be_reissued(rig):
    user = rig.user()
    cid = rig.contact(user, verified=False)
    rig.app.state.worker.tick()
    old_token = rig.consent_token(user)
    rig.clock.advance(86400)
    assert rig.client.post("/v1/contacts/confirm", json={"token": old_token}).status_code == 400
    login = rig.client.post(
        "/v1/auth/login", json={"email": "hiker@example.com", "password": "a-long-example-password"}
    )
    user = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert rig.client.post(f"/v1/contacts/{cid}/reinvite", headers=user).status_code == 200
    rig.app.state.worker.tick()
    mail = rig.client.get("/v1/demo/mail", headers=user).json()
    new_token = next(
        m["body"].split("#token=")[1].split()[0] for m in mail if old_token not in m["body"]
    )
    assert rig.client.post("/v1/contacts/confirm", json={"token": old_token}).status_code == 400
    assert rig.client.post("/v1/contacts/confirm", json={"token": new_token}).status_code == 200


def test_trip_retry_is_idempotent_even_after_original_deadline(rig):
    user = rig.user()
    cid = rig.contact(user)
    payload = rig.payload(cid)
    headers = {**user, "Idempotency-Key": "same-create-request"}
    first = rig.client.post("/v1/trips", json=payload, headers=headers)
    rig.clock.advance(5000)
    second = rig.client.post("/v1/trips", json=payload, headers=headers)
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    changed = rig.client.post("/v1/trips", json={**payload, "title": "Changed"}, headers=headers)
    assert changed.status_code == 409


@pytest.mark.parametrize(
    "change",
    [
        {"expected_return_at": "2026-10-24T13:00:00"},
        {"expected_return_at": "2020-01-01T00:00:00Z"},
        {"route": {"type": "LineString", "coordinates": [[23, 91], [24, 61]]}},
        {"route": {"type": "LineString", "coordinates": [[23, 61]]}},
        {"grace_minutes": -1},
        {"grace_minutes": True},
        {"grace_minutes": 121},
        {"status": "active"},
    ],
)
def test_invalid_trip_data_is_rejected(rig, change):
    user = rig.user()
    cid = rig.contact(user)
    result = rig.client.post(
        "/v1/trips",
        json=rig.payload(cid, **change),
        headers={**user, "Idempotency-Key": "invalid-trip-request"},
    )
    assert result.status_code == 422, result.text


def test_accounts_cannot_read_or_mutate_each_others_trips(rig):
    owner = rig.user()
    cid = rig.contact(owner)
    trip = rig.trip(owner, cid)
    other = rig.user("other@example.com")
    tid = trip["id"]
    requests = [
        ("GET", f"/v1/trips/{tid}", None),
        ("POST", f"/v1/trips/{tid}/start", None),
        ("POST", f"/v1/trips/{tid}/cancel", None),
        ("GET", f"/v1/trips/{tid}/check-ins", None),
        ("POST", f"/v1/trips/{tid}/check-ins", {"kind": "returned", "event_id": "foreign-001"}),
        ("PATCH", f"/v1/trips/{tid}/return-time", {"expected_return_at": rig.clock.iso(7200)}),
        ("POST", f"/v1/contacts/{cid}/reinvite", None),
    ]
    for method, path, body in requests:
        assert rig.client.request(method, path, headers=other, json=body).status_code == 404
    assert rig.client.get("/v1/contacts", headers=other).json() == []
    assert rig.client.get("/v1/trips", headers=other).json() == []
    assert rig.client.get("/v1/notifications", headers=other).json() == []
    assert rig.client.get("/v1/demo/mail", headers=other).json() == []
    assert (
        rig.client.post(
            "/v1/trips",
            json=rig.payload(cid),
            headers={**other, "Idempotency-Key": "foreign-request"},
        ).status_code
        == 404
    )


def test_one_active_trip_and_terminal_states(rig):
    user = rig.user()
    cid = rig.contact(user)
    first = rig.trip(user, cid)
    other = rig.trip(user, cid, key="second-trip-request", start=False)
    assert rig.client.post(f"/v1/trips/{other['id']}/start", headers=user).status_code == 409
    assert rig.returned(user, first["id"]).status_code == 201
    assert rig.client.post(f"/v1/trips/{first['id']}/start", headers=user).status_code == 409
    assert rig.client.post(f"/v1/trips/{other['id']}/start", headers=user).status_code == 200


def test_progress_does_not_extend_deadline_and_deadline_update_is_explicit(rig):
    user = rig.user()
    cid = rig.contact(user)
    trip = rig.trip(user, cid)
    path = f"/v1/trips/{trip['id']}"
    rig.clock.advance(1800)
    data = {
        "event_id": "progress-001",
        "kind": "progress",
        "position": {"latitude": 61.5, "longitude": 23.76, "source": "landmark"},
    }
    assert rig.client.post(path + "/check-ins", headers=user, json=data).status_code == 201
    assert rig.client.get(path, headers=user).json()["alert_due_at"] == trip["alert_due_at"]
    changed = rig.client.patch(
        path + "/return-time", headers=user, json={"expected_return_at": rig.clock.iso(7200)}
    )
    assert changed.status_code == 200
    rig.clock.advance(8100)
    assert (
        rig.client.patch(
            path + "/return-time", headers=user, json={"expected_return_at": rig.clock.iso(7200)}
        ).status_code
        == 409
    )


def test_checkin_retries_are_idempotent_and_conflicting_payload_is_rejected(rig):
    user, cid, trip = rig.overdue()
    first = rig.returned(user, trip["id"])
    second = rig.returned(user, trip["id"])
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert rig.returned(user, trip["id"], note="changed").status_code == 409
    assert len(rig.client.get(f"/v1/trips/{trip['id']}/check-ins", headers=user).json()) == 1


def test_timezones_normalize_to_utc_and_untrusted_position_is_labelled(rig):
    user = rig.user()
    cid = rig.contact(user)
    trip = rig.trip(user, cid, expected_return_at="2026-10-24T14:00:00+03:00")
    assert trip["expected_return_at"] == "2026-10-24T11:00:00+00:00"
    body = {
        "kind": "progress",
        "event_id": "gps-reading-01",
        "position": {"latitude": 61.50, "longitude": 23.76, "source": "gps_untrusted"},
    }
    assert (
        rig.client.post(f"/v1/trips/{trip['id']}/check-ins", headers=user, json=body).status_code
        == 201
    )
    rig.clock.advance(4500)
    rig.app.state.worker.tick()
    mail = rig.client.get("/v1/demo/mail", headers=user).json()
    alert = next(m for m in mail if "Missed return" in m["subject"])
    assert "NOT a live or verified location" in alert["body"]
    assert '"source":"gps_untrusted"' in alert["body"]
    assert "not contacted rescue" in alert["body"]
