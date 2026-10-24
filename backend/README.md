# When GPS Fails — Backend 1

Runnable Python API for **hikers, emergency contacts, trip plans, and missed return check-ins**.
This is the safety backend component of the hackathon project. GPS-free positioning,
offline maps, sensor fusion, and the main app interface belong to the navigation/frontend work.

**Default: demo mode. No real messages are sent.** Notifications appear in an authenticated
simulated inbox. A TLS-protected SMTP adapter is included for integration with your own email service.

## Run locally

Requires Python 3.11+; verified with Python 3.12.

```bash
cd gps-fails-backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m uvicorn app.main:app --reload
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`.
Use `python -m ...` commands so they also work when console scripts are not on PATH.

- Interactive API: <http://localhost:8000/docs>
- API schema: <http://localhost:8000/openapi.json>; an exported copy is in `openapi.json`.
- Server health: <http://localhost:8000/health/ready>
- Default database: `data/safety.sqlite3`; retain this directory between restarts.

`.env.example` documents settings. Outside Docker Compose, export environment variables in your
shell; the application does not load `.env` automatically. For development dependency resolution,
`python -m pip install -e '.[dev]'` is an alternative to the tested dependency lock.

## Prove the flow in under a minute

```bash
python -m scripts.demo
python -m pytest -q
python -m ruff check app tests scripts
```

The demo uses a temporary database and a simulated clock. It does not alter a running server or
send email. It registers a hiker, confirms a contact, starts a trip, records a manual position,
crosses the return deadline plus grace period, and shows a simulated overdue email. A late offline
return triggers a follow-up. A second case shows an unsent alert cancelled by a return check-in.
The coordinates illustrate a route format; they are not a validated hiking path.

Tests exercise account isolation, password/session handling, consent expiry, input validation,
timezone conversion, explicit deadline changes, duplicate HTTP retries, grace-period boundaries,
worker contention, restarts, expired leases, email retry exhaustion, return/send races, and health.
The SMTP test uses a mock server object; live email delivery has not been verified.

## API integration

Use `/docs` to execute requests. Register, log in, then paste the `access_token` into the
**Authorize** dialog. All account-owned endpoints require `Authorization: Bearer <token>`.

| Action | Endpoint | Key behavior |
|---|---|---|
| Register / log in | `POST /v1/auth/register`, `POST /v1/auth/login` | Argon2 password hashing; 24-hour opaque sessions |
| Log out / profile | `POST /v1/auth/logout`, `GET /v1/users/me` | Logout revokes the session |
| Add / list contacts | `POST /v1/contacts`, `GET /v1/contacts` | Up to five contacts; invitation queued |
| Consent | `POST /v1/contacts/confirm` | Private token, 24-hour expiry |
| Reissue expired invite | `POST /v1/contacts/{id}/reinvite` | Replaces the old consent token |
| Create / list / inspect trip | `POST /v1/trips`, `GET /v1/trips`, `GET /v1/trips/{id}` | Creates a **planned** trip; requires `Idempotency-Key` |
| Start trip | `POST /v1/trips/{id}/start` | Requires all contacts to consent and a future deadline |
| Change deadline | `PATCH /v1/trips/{id}/return-time` | Explicit; unavailable once active trip is overdue |
| Progress / returned | `POST /v1/trips/{id}/check-ins` | Stable `event_id` makes offline/retry uploads idempotent |
| Check-in history | `GET /v1/trips/{id}/check-ins` | Device observation time and server receipt time |
| Cancel trip | `POST /v1/trips/{id}/cancel` | Stops future overdue retries; follow-up if possibly sent |
| Alert status | `GET /v1/notifications` | Owner-only metadata; no contact consent tokens |
| Demo inbox | `GET /v1/demo/mail` | Owner-only; disabled in SMTP mode |

Trip, check-in-history, and notification lists support `?limit=50&offset=0` (maximum limit 100).
`examples/frontend.ts` provides a framework-neutral API client.

In demo mode, run the server and retrieve the invitation from `/v1/demo/mail`. Open its private
`/contact-consent#token=...` link and explicitly agree, or POST the token to the consent endpoint.
The owner can inspect simulated consent links **only in demo mode**. With SMTP configured, only
the contact's email contains that link. Tokens use URL fragments to avoid access-log query strings.

Trip JSON (`Idempotency-Key: <one UUID generated for this intended trip>`):

```json
{
  "title": "Afternoon lakeside walk",
  "route": {
    "type": "LineString",
    "coordinates": [[23.760, 61.500], [23.770, 61.510]]
  },
  "expected_return_at": "2026-10-25T11:00:00+02:00",
  "grace_minutes": 15,
  "contact_ids": ["replace-with-your-contact-id"],
  "notes": "Blue jacket; meeting point agreed with my contact."
}
```

Set the return time to a future instant for your actual demo. GeoJSON coordinates are
**[longitude, latitude]**, WGS84. Datetimes require a timezone and are returned in UTC.
The same idempotency key and payload return the existing trip; different data with that key gives 409.

Returned check-in:

```json
{
  "event_id": "a-stable-client-generated-UUID",
  "kind": "returned",
  "note": "Back at the agreed meeting point."
}
```

Optional `recorded_at` preserves the observation time when an event was recorded offline.
It must be during the active trip, allowing up to 60 seconds of future clock skew. `received_at`
is always server-assigned. To replay a request, preserve its full payload and `event_id`.

## Alert rules and reliability

1. Upload the route and return time; the server responds with the stored plan.
2. Start the trip online. Only an active trip is monitored. One active trip per account.
3. The server queues one overdue email per selected contact when **server time >= expected return + grace**.
4. Progress check-ins record activity and reported positions. They do **not** change the deadline.
5. A `returned` check-in marks the trip completed and cancels pending overdue retries.
6. If an overdue email was accepted, simulated, or possibly in transit, trip closure queues a follow-up.

Durable SQLite tables hold the trip, check-ins, and notification outbox. Overdue-job creation and
trip transitions use `BEGIN IMMEDIATE` transactions; database uniqueness prevents duplicate
overdue jobs. Workers claim jobs with a lease and fencing token, then perform email I/O outside
the transaction. A crash leaves a recoverable job; an expired lease becomes eligible again after
120 seconds. Failed attempts retry after 5, 10, 20, 40, 80, 160, and 300 seconds, up to eight attempts.
Polling every two seconds is the default, not a guaranteed delivery latency.

Notification status meanings:

| Status | Meaning |
|---|---|
| `pending` | Waiting for a first attempt or retry |
| `sending` | A worker holds a lease; an external send may be in progress |
| `simulated` | Written to the private demo inbox; no real email sent |
| `accepted` | SMTP server accepted the message; inbox delivery/read status unknown |
| `failed` | Retry limit exhausted; operator action needed |
| `cancelled` | Future attempts stopped; an already in-flight email cannot be recalled |

**Real SMTP is at least once.** A crash after SMTP acceptance but before the database update can
cause a duplicate email on retry. Stable Message-ID values help trace messages but do not guarantee
recipient deduplication. Resolution messages can arrive out of order; both identify the trip.
The demo inbox deduplicates by notification ID.

`/health/ready` returns 503 for a missing/stale worker heartbeat, exhausted notifications, or a
pending job more than five minutes behind its scheduled attempt. It returns the delivery mode
explicitly. Monitor readiness and notification failures with an external service: this endpoint
alone does not page an operator, confirm SMTP availability, or prove a recipient received email.
Terminal failures are visible but have no public retry endpoint; operator recovery is future work.

## Real email integration

Set `DELIVERY_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional matching
`SMTP_USER`/`SMTP_PASSWORD`, and an **HTTPS** `PUBLIC_BASE_URL` accessible to contacts.
`SMTP_TLS=starttls` uses port 587 by convention; use `ssl` with the provider's SSL port if required.
TLS certificate validation is enabled. Keep credentials in environment secrets.
Use a **fresh `DB_PATH`** when changing from demo to SMTP. A database is bound to its original
delivery mode so contacts self-confirmed through the simulated inbox cannot become real recipients.
With Docker Compose, also use a fresh named volume/project when changing delivery modes.

For a dedicated worker, set `RUN_WORKER=false` for the API, then run
`python -m app.notifications` with the same environment and database path. This prototype supports
multiple workers on a **single host/local filesystem** using database claims. Use a persistent
local disk; do not place this SQLite WAL database on a network filesystem.

Docker alternative: `docker compose up --build`. The named data volume survives container
restarts; `docker compose down -v` destroys it. Docker packaging is supplied but was not run in
the development environment, which did not have Docker installed.

## Boundaries to explain to the judges

- This component is a **return-time safety net**, not the GPS-free positioning solution. It has
  no measured navigation accuracy. The plan comes from map/manual entry; positions come from
  optional user/landmark reports or explicitly untrusted GPS reports. They are never verified fixes.
- The phone needs internet to upload/start the trip and to sync a return. Once a trip is active,
  the server can alert without receiving further phone messages. An offline return can still
  generate a false alarm until it syncs. The frontend must show **“Returned — waiting to sync”**.
- A missed check-in does not prove danger, and a reported return does not prove safety. Email
  can be delayed, blocked, duplicated, or unread. Emergency services are not contacted automatically.
- Server outages, disk failure, clock errors, provider outages, and an unavailable contact can
  defeat or delay the alert. Backups, clock synchronization, uptime monitoring, and a fallback
  contact/channel are necessary before operational use.
- Accounts currently lack email ownership verification, password recovery, recipient revocation,
  retention/deletion controls, and production abuse protection. Authentication rate limits are
  basic IP-based limits; deployments behind proxies must configure trusted forwarding correctly.
- For a real service: use managed authentication, PostgreSQL and migrations, monitored workers,
  a provider with idempotency and signed delivery/bounce callbacks, validated SMS/push fallbacks,
  tested backups, secret management, privacy controls, and user trials with consent.

**Pitch line:** “If GPS fails and the phone goes silent, the return plan already on our server
can still tell a trusted person that a check-in is overdue.” Combine this with the team's
navigation demo to address the challenge's positioning requirement.

Technical references: [FastAPI security](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/),
[FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/),
[SQLite transactions](https://www.sqlite.org/lang_transaction.html),
[Python SMTP semantics](https://docs.python.org/3/library/smtplib.html).

