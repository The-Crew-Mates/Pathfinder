import time
from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app


def test_background_scheduler_sends_without_tick_api_calls(rig):
    user, _, _ = rig.overdue()
    # New server process shape, same durable DB. It must discover the overdue trip on startup.
    cfg = replace(rig.app.state.settings, run_worker=True, poll_seconds=0.02)
    app = create_app(cfg, rig.clock)
    with TestClient(app) as client:
        until = time.monotonic() + 3
        while time.monotonic() < until:
            notices = client.get("/v1/notifications", headers=user).json()
            if any(n["kind"] == "overdue" and n["status"] == "simulated" for n in notices):
                break
            time.sleep(0.01)
        else:
            raise AssertionError("Background scheduler did not dispatch the overdue alert")
    assert not app.state.worker.thread.is_alive()
