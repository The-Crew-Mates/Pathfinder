"""Run: python -m scripts.demo. All addresses, clock changes and notifications are simulated."""

import re
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class DemoClock:
    def __init__(self):
        self.now = datetime(2026, 10, 24, 10, 0, tzinfo=UTC).timestamp()

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds

    def after(self, seconds):
        return datetime.fromtimestamp(self.now + seconds, UTC).isoformat()


def run():
    print("WHEN GPS FAILS — BACKEND DEMO")
    print("Simulated clock and private demo inbox. NO REAL MESSAGES ARE SENT.\n")
    with TemporaryDirectory(prefix="gps-fails-demo-") as folder:
        clock = DemoClock()
        app = create_app(
            Settings(db_path=str(Path(folder) / "demo.sqlite3"), run_worker=False), clock
        )
        with TestClient(app) as client:

            def request(method, path, expected=200, **kwargs):
                result = client.request(method, path, **kwargs)
                if result.status_code != expected:
                    raise RuntimeError(f"{method} {path}: {result.status_code} {result.text}")
                return result.json()

            request(
                "POST",
                "/v1/auth/register",
                expected=201,
                json={
                    "name": "Wasay",
                    "email": "hiker@example.com",
                    "password": "hackathon-demo-password",
                },
            )
            auth = request(
                "POST",
                "/v1/auth/login",
                json={"email": "hiker@example.com", "password": "hackathon-demo-password"},
            )
            headers = {"Authorization": f"Bearer {auth['access_token']}"}
            contact = request(
                "POST",
                "/v1/contacts",
                expected=201,
                headers=headers,
                json={"name": "Emergency contact", "email": "friend@example.com"},
            )
            app.state.worker.tick()
            inbox = request("GET", "/v1/demo/mail", headers=headers)
            token = re.search(r"#token=([^\s]+)", inbox[0]["body"]).group(1)
            request("POST", "/v1/contacts/confirm", json={"token": token})
            print("1. Account created. Emergency contact accepted the invitation.")

            def start(title, key):
                trip = request(
                    "POST",
                    "/v1/trips",
                    expected=201,
                    headers={**headers, "Idempotency-Key": key},
                    json={
                        "title": title,
                        "expected_return_at": clock.after(3600),
                        "grace_minutes": 15,
                        "contact_ids": [contact["id"]],
                        "route": {
                            "type": "LineString",
                            "coordinates": [[23.760, 61.500], [23.770, 61.510], [23.780, 61.515]],
                        },
                        "notes": "Illustrative Tampere-area route; not a validated hiking path.",
                    },
                )
                return request("POST", f"/v1/trips/{trip['id']}/start", headers=headers)

            trip = start("Demo: overdue lakeside walk", "demo-overdue-trip-001")
            print(f"2. Trip plan uploaded and active. Alert due at {trip['alert_due_at']}.")
            request(
                "POST",
                f"/v1/trips/{trip['id']}/check-ins",
                expected=201,
                headers=headers,
                json={
                    "event_id": "landmark-checkin-001",
                    "kind": "progress",
                    "position": {"latitude": 61.51, "longitude": 23.77, "source": "manual"},
                    "note": "At the marked bridge.",
                },
            )
            print("3. Manual position recorded. No GPS is used by this safety feature.")
            clock.advance(4500)
            app.state.worker.tick()
            alerts = request("GET", "/v1/notifications", headers=headers)
            alert = next(n for n in alerts if n["kind"] == "overdue")
            print(f"4. No return check-in by deadline + grace: overdue alert {alert['status']}.")
            inbox = request("GET", "/v1/demo/mail", headers=headers)
            message = next(m for m in inbox if "Missed return" in m["subject"])
            print("\n----- SIMULATED ALERT TO EMERGENCY CONTACT -----")
            print(message["body"])
            print("----- END ALERT -----\n")

            request(
                "POST",
                f"/v1/trips/{trip['id']}/check-ins",
                expected=201,
                headers=headers,
                json={
                    "event_id": "late-offline-return-001",
                    "kind": "returned",
                    "recorded_at": "2026-10-24T10:59:00Z",
                    "note": "Returned earlier; internet just reconnected.",
                },
            )
            app.state.worker.tick()
            closed = request("GET", f"/v1/trips/{trip['id']}", headers=headers)
            notices = request("GET", "/v1/notifications", headers=headers)
            assert closed["status"] == "completed"
            assert any(n["kind"] == "resolved" and n["status"] == "simulated" for n in notices)
            print("5. Late offline return synced. Trip completed; follow-up alert simulated.")

            second = start("Demo: return before alert dispatch", "demo-cancel-pending-001")
            clock.advance(4500)
            app.state.worker.scan()  # Queue an alert, but do not send it yet.
            request(
                "POST",
                f"/v1/trips/{second['id']}/check-ins",
                expected=201,
                headers=headers,
                json={"event_id": "return-before-dispatch-001", "kind": "returned"},
            )
            app.state.worker.tick()
            notices = request("GET", "/v1/notifications", headers=headers)
            assert any(
                n["trip_id"] == second["id"]
                and n["kind"] == "overdue"
                and n["status"] == "cancelled"
                for n in notices
            )
            print("6. Second trip: return reached server before dispatch; queued alert cancelled.")
            assert request("GET", "/health/ready")["status"] == "ready"
            print("\nPASS: overdue, offline sync, follow-up, cancellation, and worker health.")
            print("This proves the safety workflow, not GPS-free positioning accuracy.")


if __name__ == "__main__":
    run()
