from app.security import digest


def test_account_password_and_session_are_not_stored_as_plaintext(rig):
    headers = rig.user()
    token = headers["Authorization"].split()[1]
    me = rig.client.get("/v1/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["name"] == "Wasay"
    assert "password" not in me.text
    with rig.app.state.db.read() as conn:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
        session = conn.execute("SELECT token_hash FROM sessions").fetchone()[0]
    assert stored.startswith("$argon2id$")
    assert "a-long-example-password" not in stored
    assert session == digest(token)


def test_logout_revokes_session_and_expiry_is_enforced(rig):
    first = rig.user()
    second = rig.client.post(
        "/v1/auth/login", json={"email": "hiker@example.com", "password": "a-long-example-password"}
    ).json()["access_token"]
    assert rig.client.post("/v1/auth/logout", headers=first).status_code == 204
    assert rig.client.get("/v1/users/me", headers=first).status_code == 401
    rig.clock.advance(86400)
    assert (
        rig.client.get("/v1/users/me", headers={"Authorization": f"Bearer {second}"}).status_code
        == 401
    )


def test_auth_errors_do_not_disclose_if_email_exists(rig):
    rig.user()
    responses = [
        rig.client.post("/v1/auth/login", json={"email": email, "password": "wrong"})
        for email in ("hiker@example.com", "missing@example.com")
    ]
    assert all(r.status_code == 401 for r in responses)
    assert responses[0].json() == responses[1].json()
    assert rig.client.get("/v1/trips").status_code == 401


def test_invalid_password_never_echoed_in_validation_error(rig):
    response = rig.client.post(
        "/v1/auth/register",
        json={"name": "Wasay", "email": "hiker@example.com", "password": "secret"},
    )
    assert response.status_code == 422
    assert "secret" not in response.text
    assert "input" not in response.text


def test_login_rate_limit_is_durable(rig):
    for _ in range(20):
        response = rig.client.post(
            "/v1/auth/login", json={"email": "missing@example.com", "password": "wrong"}
        )
        assert response.status_code == 401
    response = rig.client.post(
        "/v1/auth/login", json={"email": "missing@example.com", "password": "wrong"}
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
    rig.clock.advance(60)
    assert (
        rig.client.post(
            "/v1/auth/login", json={"email": "missing@example.com", "password": "wrong"}
        ).status_code
        == 401
    )


def test_password_spaces_are_significant(rig):
    response = rig.client.post(
        "/v1/auth/register",
        json={"name": "Wasay", "email": "hiker@example.com", "password": "  twelve-characters  "},
    )
    assert response.status_code == 201
    assert (
        rig.client.post(
            "/v1/auth/login", json={"email": "hiker@example.com", "password": "twelve-characters"}
        ).status_code
        == 401
    )
    assert (
        rig.client.post(
            "/v1/auth/login",
            json={"email": "hiker@example.com", "password": "  twelve-characters  "},
        ).status_code
        == 200
    )
