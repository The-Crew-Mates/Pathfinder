from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from app.notifications import AlertWorker, DemoTransport


class UnavailableTransport:
    def send(self, notification):
        raise ConnectionError("Simulated email service outage; not a real send")


def test_overdue_boundary_grace_period_and_deduplication(rig):
    user = rig.user()
    cid = rig.contact(user)
    rig.trip(user, cid)
    rig.clock.advance(4499)
    rig.app.state.worker.tick()
    assert rig.notifications(user, "overdue") == []
    rig.clock.advance(1)
    rig.app.state.worker.tick()
    rig.app.state.worker.tick()
    notices = rig.notifications(user, "overdue")
    assert len(notices) == 1
    assert notices[0]["status"] == "simulated"
    assert notices[0]["attempts"] == 1


def test_planned_or_cancelled_trips_do_not_alert(rig):
    user = rig.user()
    cid = rig.contact(user)
    rig.trip(user, cid, start=False)
    active = rig.trip(user, cid, key="second-request-01")
    assert rig.client.post(f"/v1/trips/{active['id']}/cancel", headers=user).status_code == 200
    rig.clock.advance(4500)
    rig.app.state.worker.tick()
    assert rig.notifications(user, "overdue") == []


def test_returned_checkin_cancels_queued_alert(rig):
    user, _, trip = rig.overdue()
    rig.app.state.worker.scan()
    assert rig.notifications(user, "overdue")[0]["status"] == "pending"
    assert rig.returned(user, trip["id"]).status_code == 201
    rig.app.state.worker.tick()
    assert rig.notifications(user, "overdue")[0]["status"] == "cancelled"
    assert rig.notifications(user, "resolved") == []
    assert rig.client.get(f"/v1/trips/{trip['id']}", headers=user).json()["status"] == "completed"


def test_late_offline_return_sends_followup_if_alert_already_sent(rig):
    user, _, trip = rig.overdue()
    rig.app.state.worker.tick()
    assert rig.returned(user, trip["id"], recorded_at="2026-10-24T10:59:00Z").status_code == 201
    rig.app.state.worker.tick()
    assert rig.notifications(user, "overdue")[0]["status"] == "simulated"
    assert rig.notifications(user, "resolved")[0]["status"] == "simulated"
    mail = rig.client.get("/v1/demo/mail", headers=user).json()
    resolution = next(m for m in mail if "Trip closed" in m["subject"])
    assert "not independently confirmed safety" in resolution["body"]
    assert "2026-10-24T10:59:00+00:00" in resolution["body"]
    assert "2026-10-24T11:15:00+00:00" in resolution["body"]


def test_claimed_alert_cancelled_before_send_is_suppressed(rig):
    user, _, trip = rig.overdue()
    worker = rig.app.state.worker
    worker.scan()
    claimed = worker.claim()
    assert claimed["kind"] == "overdue"
    assert rig.returned(user, trip["id"]).status_code == 201
    assert worker.deliver(claimed) is False
    worker.tick()
    assert rig.notifications(user, "overdue")[0]["status"] == "cancelled"
    assert rig.notifications(user, "resolved")[0]["status"] == "simulated"


def test_return_during_inflight_send_queues_resolution(rig):
    user, _, trip = rig.overdue()
    demo = DemoTransport(rig.app.state.db, rig.clock)

    class InFlight:
        def send(self, notification):
            if notification["kind"] == "overdue":
                assert rig.returned(user, trip["id"]).status_code == 201
            return demo.send(notification)

    worker = AlertWorker(rig.app.state.db, rig.app.state.settings, rig.clock, InFlight())
    worker.tick()
    # A send past its final state check can arrive; the follow-up handles that race.
    mail = rig.client.get("/v1/demo/mail", headers=user).json()
    assert any("Missed return" in m["subject"] for m in mail)
    assert any("Trip closed" in m["subject"] for m in mail)
    assert rig.notifications(user, "resolved")[0]["status"] == "simulated"


def test_failed_send_retries_after_backoff_and_survives_restart(rig):
    user, _, _ = rig.overdue()
    worker = AlertWorker(
        rig.app.state.db, rig.app.state.settings, rig.clock, UnavailableTransport()
    )
    worker.tick()
    notice = rig.notifications(user, "overdue")[0]
    assert notice["status"] == "pending"
    assert notice["last_error"] == "ConnectionError"
    worker.tick()
    assert rig.notifications(user, "overdue")[0]["attempts"] == 1
    rig.clock.advance(5)
    restarted = create_app(rig.app.state.settings, rig.clock)
    with TestClient(restarted):
        restarted.state.worker.tick()
    notice = rig.notifications(user, "overdue")[0]
    assert notice["status"] == "simulated"
    assert notice["attempts"] == 2


def test_crashed_worker_lease_recovers_without_duplicate_demo_message(rig):
    user, _, _ = rig.overdue()
    worker = rig.app.state.worker
    worker.scan()
    job = worker.claim()
    # Simulate external acceptance followed by a crash before the status commit.
    worker.transport.send(job)
    assert rig.notifications(user, "overdue")[0]["status"] == "sending"
    assert worker.claim() is None
    rig.clock.advance(rig.app.state.settings.lease_seconds)
    restarted = AlertWorker(rig.app.state.db, rig.app.state.settings, rig.clock)
    restarted.tick()
    assert rig.notifications(user, "overdue")[0]["status"] == "simulated"
    assert rig.notifications(user, "overdue")[0]["attempts"] == 2
    mail = rig.client.get("/v1/demo/mail", headers=user).json()
    assert sum("Missed return" in m["subject"] for m in mail) == 1
    assert worker.deliver(job) is False  # Old lease must not be usable after recovery.


def test_concurrent_workers_do_not_claim_same_message(rig):
    user, _, _ = rig.overdue()
    rig.app.state.worker.scan()
    workers = [AlertWorker(rig.app.state.db, rig.app.state.settings, rig.clock) for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = list(pool.map(lambda worker: worker.claim(), workers))
    assert sum(job is not None for job in jobs) == 1
    assert rig.notifications(user, "overdue")[0]["attempts"] == 1


def test_terminal_delivery_failure_degrades_readiness(rig):
    user, _, _ = rig.overdue()
    cfg = replace(rig.app.state.settings, max_attempts=2)
    worker = AlertWorker(rig.app.state.db, cfg, rig.clock, UnavailableTransport())
    worker.tick()
    rig.clock.advance(5)
    worker.tick()
    notice = rig.notifications(user, "overdue")[0]
    assert notice["status"] == "failed"
    assert notice["attempts"] == 2
    ready = rig.client.get("/health/ready")
    assert ready.status_code == 503
    assert ready.json()["failed_notifications"] == 1


def test_readiness_detects_stopped_worker_and_explicit_demo_mode(rig):
    assert rig.client.get("/health/ready").status_code == 503
    rig.app.state.worker.tick()
    ready = rig.client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["real_email_enabled"] is False
    rig.clock.advance(60)
    assert rig.client.get("/health/ready").status_code == 503


def test_progress_checkin_does_not_suppress_overdue_alert(rig):
    user, _, trip = rig.overdue()
    response = rig.client.post(
        f"/v1/trips/{trip['id']}/check-ins",
        headers=user,
        json={"event_id": "late-progress-1", "kind": "progress"},
    )
    assert response.status_code == 201
    rig.app.state.worker.tick()
    assert rig.notifications(user, "overdue")[0]["status"] == "simulated"


def test_alert_is_sent_to_each_selected_contact(rig):
    user = rig.user()
    first = rig.contact(user)
    second = rig.contact(user, email="second@example.com")
    rig.trip(user, first, contact_ids=[first, second])
    rig.clock.advance(4500)
    rig.app.state.worker.tick()
    alerts = rig.notifications(user, "overdue")
    assert {a["contact_id"] for a in alerts} == {first, second}
    assert all(a["status"] == "simulated" for a in alerts)
