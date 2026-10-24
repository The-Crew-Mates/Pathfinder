import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings
from app.db import Database
from app.models import (
    CheckIn,
    Consent,
    ContactCreate,
    Login,
    Register,
    ReturnTimeUpdate,
    TripCreate,
)
from app.notifications import AlertWorker
from app.security import digest
from app.service import Service, ServiceError, iso

bearer = HTTPBearer(auto_error=False)


def create_app(settings=None, clock=time.time, transport=None):
    cfg = settings or Settings.from_env()
    cfg.validate()
    cfg.prepare_directory()
    db = Database(cfg.db_path)
    service = Service(db, cfg, clock)
    worker = AlertWorker(db, cfg, clock, transport)

    @asynccontextmanager
    async def lifespan(app):
        db.initialize(cfg.delivery_mode)
        if cfg.run_worker:
            worker.start()
        try:
            yield
        finally:
            worker.stop()

    app = FastAPI(
        title="When GPS Fails — Safety Backend",
        version="0.1.0",
        lifespan=lifespan,
        description=(
            "Accounts, consent-based emergency contacts, trip plans, and durable overdue "
            "email alerts. Planned routes and reported positions are not verified location. "
            "Demo delivery sends no real email. This is a hackathon prototype."
        ),
    )
    app.state.db, app.state.service, app.state.worker = db, service, worker
    app.state.settings = cfg
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.cors_origins),
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.exception_handler(ServiceError)
    async def service_error(request, exc):
        headers = {"Retry-After": "60"} if exc.status == 429 else {}
        if exc.status == 401:
            headers["WWW-Authenticate"] = "Bearer"
        return JSONResponse({"detail": exc.detail}, status_code=exc.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # FastAPI's default validation output echoes inputs (including passwords and tokens).
        errors = [{"loc": e["loc"], "type": e["type"], "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    def current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
        if not credentials:
            raise ServiceError(401, "Bearer token required")
        return service.authenticate(credentials.credentials)

    User = Annotated[dict, Depends(current_user)]
    PageLimit = Annotated[int, Query(ge=1, le=100)]
    PageOffset = Annotated[int, Query(ge=0, le=100000)]

    def rate(request, action, maximum=20):
        # Do not trust spoofable X-Forwarded-For. Configure a trusted proxy at deployment.
        address = request.client.host if request.client else "unknown"
        service.limit(digest(f"{action}:{address}"), maximum)

    @app.get("/", tags=["info"])
    def root():
        return {
            "project": "When GPS Fails",
            "docs": "/docs",
            "delivery_mode": cfg.delivery_mode,
            "scope": "Users, trip plans, check-ins, and overdue email alerts",
            "prototype": True,
            "real_email_enabled": cfg.delivery_mode == "smtp",
        }

    @app.get("/health/live", tags=["health"])
    def live():
        return {"status": "alive"}

    @app.get("/health/ready", tags=["health"])
    def ready():
        now = clock()
        with db.read() as conn:
            state = conn.execute("SELECT last_tick FROM worker_state WHERE id=1").fetchone()
            failed = conn.execute(
                "SELECT count(*) FROM notifications WHERE status='failed'"
            ).fetchone()[0]
            oldest = conn.execute(
                "SELECT MIN(available_at) FROM notifications WHERE status='pending'"
            ).fetchone()[0]
        heartbeat_age = now - state[0] if state else None
        worker_ok = heartbeat_age is not None and heartbeat_age < max(60, cfg.poll_seconds * 3)
        backlog_ok = oldest is None or now - oldest < 300
        okay = worker_ok and failed == 0 and backlog_ok
        return JSONResponse(
            {
                "status": "ready" if okay else "degraded",
                "delivery_mode": cfg.delivery_mode,
                "real_email_enabled": cfg.delivery_mode == "smtp",
                "worker_last_tick": iso(state[0]) if state else None,
                "failed_notifications": failed,
                "backlog_ok": backlog_ok,
            },
            status_code=200 if okay else 503,
        )

    @app.post("/v1/auth/register", status_code=201, tags=["auth"])
    def register(data: Register, request: Request):
        rate(request, "register", 10)
        return service.register(data)

    @app.post("/v1/auth/login", tags=["auth"])
    def login(data: Login, request: Request):
        rate(request, "login", 20)
        return service.login(str(data.email), data.password)

    @app.post("/v1/auth/logout", status_code=204, tags=["auth"])
    def logout(user: User, credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)]):
        service.logout(credentials.credentials)
        return Response(status_code=204)

    @app.get("/v1/users/me", tags=["users"])
    def me(user: User):
        return user

    @app.post("/v1/contacts", status_code=201, tags=["contacts"])
    def create_contact(data: ContactCreate, user: User):
        service.limit(digest(f"invite:{user['id']}"), maximum=5, window=3600)
        return service.create_contact(user, data)

    @app.get("/v1/contacts", tags=["contacts"])
    def contacts(user: User):
        return service.contacts(user)

    @app.post("/v1/contacts/confirm", tags=["contacts"])
    def confirm_contact(data: Consent, request: Request):
        rate(request, "consent", 30)
        return service.confirm_contact(data.token)

    @app.post("/v1/contacts/{contact_id}/reinvite", tags=["contacts"])
    def reinvite_contact(contact_id: str, user: User):
        service.limit(digest(f"invite:{user['id']}"), maximum=5, window=3600)
        return service.reinvite_contact(user, contact_id)

    @app.get("/contact-consent", response_class=HTMLResponse, include_in_schema=False)
    def consent_page():
        return Path(__file__).with_name("consent.html").read_text()

    @app.post("/v1/trips", status_code=201, tags=["trips"])
    def create_trip(
        data: TripCreate,
        user: User,
        idempotency_key: Annotated[str, Header(min_length=8, max_length=128)],
    ):
        return service.create_trip(user, data, idempotency_key)

    @app.get("/v1/trips", tags=["trips"])
    def trips(user: User, limit: PageLimit = 50, offset: PageOffset = 0):
        return service.trips(user, limit, offset)

    @app.get("/v1/trips/{trip_id}", tags=["trips"])
    def trip(trip_id: str, user: User):
        return service.trip(user, trip_id)

    @app.post("/v1/trips/{trip_id}/start", tags=["trips"])
    def start_trip(trip_id: str, user: User):
        return service.start_trip(user, trip_id)

    @app.patch("/v1/trips/{trip_id}/return-time", tags=["trips"])
    def return_time(trip_id: str, data: ReturnTimeUpdate, user: User):
        return service.update_return_time(user, trip_id, data.expected_return_at)

    @app.post("/v1/trips/{trip_id}/cancel", tags=["trips"])
    def cancel_trip(trip_id: str, user: User):
        return service.cancel_trip(user, trip_id)

    @app.post("/v1/trips/{trip_id}/check-ins", status_code=201, tags=["check-ins"])
    def check_in(trip_id: str, data: CheckIn, user: User):
        return service.check_in(user, trip_id, data)

    @app.get("/v1/trips/{trip_id}/check-ins", tags=["check-ins"])
    def checkins(trip_id: str, user: User, limit: PageLimit = 50, offset: PageOffset = 0):
        return service.checkins(user, trip_id, limit, offset)

    @app.get("/v1/notifications", tags=["notifications"])
    def notifications(user: User, limit: PageLimit = 50, offset: PageOffset = 0):
        return service.notifications(user, limit, offset)

    @app.get("/v1/demo/mail", tags=["demo"])
    def demo_mail(user: User):
        """Owner-only simulated inbox. Disabled in SMTP mode. Contains private consent links."""
        return service.demo_mail(user)

    return app


app = create_app()
