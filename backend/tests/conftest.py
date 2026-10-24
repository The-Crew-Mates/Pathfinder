import re
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class Clock:
    def __init__(self):
        self.value = datetime(2026, 10, 24, 10, 0, tzinfo=UTC).timestamp()

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds

    def iso(self, delta=0):
        return datetime.fromtimestamp(self.value + delta, UTC).isoformat()


@dataclass
class Rig:
    client: TestClient
    app: object
    clock: Clock

    def user(self, email="hiker@example.com", name="Wasay"):
        data = {"email": email, "name": name, "password": "a-long-example-password"}
        response = self.client.post("/v1/auth/register", json=data)
        assert response.status_code == 201, response.text
        login = self.client.post("/v1/auth/login", json={k: data[k] for k in ("email", "password")})
        assert login.status_code == 200, login.text
        token = login.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def contact(self, headers, verified=True, email="friend@example.com"):
        response = self.client.post(
            "/v1/contacts", headers=headers, json={"name": "Friend", "email": email}
        )
        assert response.status_code == 201, response.text
        cid = response.json()["id"]
        if verified:
            self.app.state.worker.tick()
            token = self.consent_token(headers)
            confirm = self.client.post("/v1/contacts/confirm", json={"token": token})
            assert confirm.status_code == 200, confirm.text
        return cid

    def consent_token(self, headers):
        mail = self.client.get("/v1/demo/mail", headers=headers).json()
        invitations = [m for m in mail if "#token=" in m["body"]]
        assert invitations
        return re.search(r"#token=([^\s]+)", invitations[-1]["body"]).group(1)

    def payload(self, cid, **overrides):
        return {
            "title": "Tampere lakeside walk",
            "route": {"type": "LineString", "coordinates": [[23.76, 61.50], [23.77, 61.51]]},
            "expected_return_at": self.clock.iso(3600),
            "grace_minutes": 15,
            "contact_ids": [cid],
            **overrides,
        }

    def trip(self, headers, cid, start=True, key="demo-trip-request", **overrides):
        response = self.client.post(
            "/v1/trips",
            json=self.payload(cid, **overrides),
            headers={**headers, "Idempotency-Key": key},
        )
        assert response.status_code == 201, response.text
        trip = response.json()
        if start:
            response = self.client.post(f"/v1/trips/{trip['id']}/start", headers=headers)
            assert response.status_code == 200, response.text
            trip = response.json()
        return trip

    def overdue(self, headers=None, cid=None, **overrides):
        headers = headers or self.user()
        cid = cid or self.contact(headers)
        trip = self.trip(headers, cid, **overrides)
        self.clock.advance(4500)
        return headers, cid, trip

    def notifications(self, headers, kind=None):
        response = self.client.get("/v1/notifications", headers=headers)
        assert response.status_code == 200, response.text
        return [r for r in response.json() if kind is None or r["kind"] == kind]

    def returned(self, headers, tid, **overrides):
        return self.client.post(
            f"/v1/trips/{tid}/check-ins",
            headers=headers,
            json={"event_id": "return-event-001", "kind": "returned", **overrides},
        )


@pytest.fixture
def rig(tmp_path):
    cfg = Settings(db_path=str(tmp_path / "test.sqlite3"), run_worker=False)
    clock = Clock()
    app = create_app(cfg, clock)
    with TestClient(app) as client:
        yield Rig(client, app, clock)
