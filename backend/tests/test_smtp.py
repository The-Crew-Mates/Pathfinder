import smtplib
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.notifications import SMTPTransport


def smtp_settings(**kwargs):
    return Settings(
        delivery_mode="smtp",
        public_base_url="https://example.org",
        smtp_host="smtp.example.org",
        smtp_from="alerts@example.org",
        **kwargs,
    )


def test_real_email_configuration_requires_encryption_and_https():
    with pytest.raises(ValueError):
        Settings(delivery_mode="smtp").validate()
    with pytest.raises(ValueError):
        replace(smtp_settings(), smtp_tls="none").validate()
    with pytest.raises(ValueError):
        replace(smtp_settings(), public_base_url="http://example.org").validate()
    smtp_settings().validate()


def test_smtp_acceptance_is_not_reported_as_inbox_delivery(monkeypatch):
    calls = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            calls.append("connect")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            calls.append("ehlo")

        def starttls(self, **kwargs):
            calls.append("tls")

        def login(self, *args):
            calls.append("login")

        def send_message(self, message):
            assert message["To"] == "friend@example.com"
            assert message["Message-ID"] == "<stable-id@gps-fails.local>"
            calls.append("send")
            return {}

    monkeypatch.setattr(smtplib, "SMTP", SMTP)
    transport = SMTPTransport(smtp_settings(smtp_user="user", smtp_password="password"))
    assert (
        transport.send(
            {
                "id": "stable-id",
                "recipient": "friend@example.com",
                "subject": "Test",
                "body": "Test",
            }
        )
        == "accepted"
    )
    assert calls == ["connect", "ehlo", "tls", "ehlo", "login", "send"]


def test_simulated_inbox_is_inaccessible_in_smtp_mode(tmp_path):
    app = create_app(
        replace(smtp_settings(), db_path=str(tmp_path / "smtp.sqlite3"), run_worker=False)
    )
    with TestClient(app) as client:
        assert (
            client.post(
                "/v1/auth/register",
                json={
                    "name": "SMTP User",
                    "email": "hiker@example.com",
                    "password": "a-long-example-password",
                },
            ).status_code
            == 201
        )
        token = client.post(
            "/v1/auth/login",
            json={"email": "hiker@example.com", "password": "a-long-example-password"},
        ).json()["access_token"]
        user = {"Authorization": f"Bearer {token}"}
        assert client.get("/v1/demo/mail", headers=user).status_code == 404


def test_demo_database_cannot_be_reused_for_real_contact_alerts(rig):
    user = rig.user()
    rig.contact(user)
    cfg = replace(smtp_settings(), db_path=rig.app.state.settings.db_path, run_worker=False)
    with pytest.raises(RuntimeError, match="fresh DB_PATH"):
        with TestClient(create_app(cfg)):
            pass


def test_database_permissions_are_private(tmp_path):
    path = tmp_path / "data" / "private.sqlite3"
    cfg = Settings(db_path=str(path), run_worker=False)
    with TestClient(create_app(cfg)):
        assert path.stat().st_mode & 0o777 == 0o600
