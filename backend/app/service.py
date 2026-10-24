import json
import sqlite3
from datetime import UTC, datetime

from app.config import Settings
from app.db import Database
from app.models import CheckIn, ContactCreate, Register, TripCreate
from app.security import DUMMY_HASH, digest, new_id, new_token, passwords, verify_password


class ServiceError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def iso(timestamp):
    return None if timestamp is None else datetime.fromtimestamp(timestamp, UTC).isoformat()


def fingerprint(model):
    return digest(json.dumps(model.model_dump(mode="json"), sort_keys=True))


def enqueue(conn, *, user_id, contact_id, kind, recipient, body, now, trip_id=None):
    message_id = new_id()
    subjects = {
        "invitation": "[GPS Fails] Confirm emergency contact consent",
        "overdue": "[GPS Fails] Missed return check-in — please follow up",
        "resolved": "[GPS Fails] Trip closed — follow-up to check-in alert",
    }
    conn.execute(
        """INSERT OR IGNORE INTO notifications
        (id,user_id,trip_id,contact_id,kind,recipient,subject,body,status,
         available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)""",
        (
            message_id,
            user_id,
            trip_id,
            contact_id,
            kind,
            recipient,
            subjects[kind],
            body,
            now,
            now,
            now,
        ),
    )
    return message_id


def alert_body(conn, trip, user, *, closed=False):
    last = conn.execute(
        "SELECT * FROM checkins WHERE trip_id=? ORDER BY recorded_at DESC,received_at DESC LIMIT 1",
        (trip["id"],),
    ).fetchone()
    lines = [
        f"Hiker: {user['name']} ({user['email']})",
        f"Trip: {trip['title']}",
        f"Trip ID: {trip['id']}",
        f"Expected return (UTC): {iso(trip['return_at'])}",
        f"Grace period: {trip['grace_seconds'] // 60} minutes",
    ]
    if closed:
        lines += [
            f"The hiker marked this trip {trip['status']} at {iso(trip['ended_at'])}.",
            "This is the hiker's report, not independently confirmed safety.",
            "An earlier overdue notice may already be in transit. Please check with the hiker.",
        ]
    else:
        lines += [
            "No returned check-in reached our server before the return deadline plus grace period.",
            "This can mean a late return, a flat battery, or no internet. "
            "It does not prove danger.",
            "Try contacting the hiker. If you believe someone is in danger, "
            "contact local emergency",
            "services and share this plan. This app has not contacted rescue services.",
        ]
    lines += [
        "Planned route [longitude, latitude]; NOT a live or verified location:",
        trip["route_json"],
        f"Trip notes: {trip['notes'] or '(none)'}",
    ]
    if last:
        lines += [
            f"Last reported check-in: {last['kind']}",
            f"Device-reported observation time (UTC): {iso(last['recorded_at'])}",
            f"Server receipt time (UTC): {iso(last['received_at'])}",
            f"Reported position (unverified): {last['position_json'] or '(not supplied)'}",
            f"Check-in note: {last['note'] or '(none)'}",
        ]
    else:
        lines.append("No position/check-in has been reported to this server.")
    return "\n".join(lines)


class Service:
    def __init__(self, db: Database, settings: Settings, clock):
        self.db, self.settings, self.clock = db, settings, clock

    def limit(self, key, maximum=20, window=60):
        now = self.clock()
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM rate_limits WHERE expires_at<=?", (now,))
            row = conn.execute("SELECT count FROM rate_limits WHERE key=?", (key,)).fetchone()
            if row and row["count"] >= maximum:
                raise ServiceError(429, "Too many requests; try again later")
            conn.execute(
                """INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)
                   ON CONFLICT(key) DO UPDATE SET count=count+1""",
                (key, now + window),
            )

    def register(self, data: Register):
        now, uid = self.clock(), new_id()
        hashed = passwords.hash(data.password)
        try:
            with self.db.transaction() as conn:
                conn.execute(
                    "INSERT INTO users VALUES (?,?,?,?,?)",
                    (uid, str(data.email).lower(), data.name, hashed, now),
                )
        except sqlite3.IntegrityError as exc:
            raise ServiceError(409, "An account with this email already exists") from exc
        return {"id": uid, "name": data.name, "email": str(data.email).lower()}

    def login(self, email, password):
        with self.db.read() as conn:
            row = conn.execute("SELECT * FROM users WHERE email=?", (email.lower(),)).fetchone()
        valid = verify_password(password, row["password_hash"] if row else DUMMY_HASH)
        if not row or not valid:
            raise ServiceError(401, "Invalid email or password")
        token, now = new_token(), self.clock()
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
            conn.execute(
                "INSERT INTO sessions VALUES (?,?,?)",
                (digest(token), row["id"], now + self.settings.session_seconds),
            )
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_at": iso(now + self.settings.session_seconds),
        }

    def authenticate(self, token):
        with self.db.read() as conn:
            row = conn.execute(
                """SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.user_id=u.id
                   WHERE s.token_hash=? AND s.expires_at>?""",
                (digest(token), self.clock()),
            ).fetchone()
        if not row:
            raise ServiceError(401, "Invalid or expired session")
        return dict(row)

    def logout(self, token):
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash=?", (digest(token),))

    def create_contact(self, user, data: ContactCreate):
        cid, token, now = new_id(), new_token(), self.clock()
        email = str(data.email).lower()
        with self.db.transaction() as conn:
            if (
                conn.execute(
                    "SELECT count(*) FROM contacts WHERE user_id=?", (user["id"],)
                ).fetchone()[0]
                >= 5
            ):
                raise ServiceError(409, "At most five emergency contacts are supported")
            try:
                conn.execute(
                    "INSERT INTO contacts VALUES (?,?,?,?,?,?,NULL,?)",
                    (cid, user["id"], data.name, email, digest(token), now + 86400, now),
                )
            except sqlite3.IntegrityError as exc:
                raise ServiceError(409, "This contact already exists") from exc
            self._invite(conn, user, cid, email, token, now)
        return {
            "id": cid,
            "name": data.name,
            "email": email,
            "verified": False,
            "consent_expires_at": iso(now + 86400),
        }

    def _invite(self, conn, user, cid, email, token, now):
        link = f"{self.settings.public_base_url}/contact-consent#token={token}"
        body = (
            f"{user['name']} ({user['email']}) asks you to be "
            "an emergency contact for hiking trips.\n"
            "Only agree if you know this person and are willing to follow up on missed check-ins.\n"
            "The app cannot confirm someone's safety or dispatch rescue services.\n"
            f"Open this link and choose 'I agree' within 24 hours:\n{link}\n"
            "If you did not expect this invitation, ignore it. "
            "No trip can start using this contact\n"
            "until consent is confirmed. Do not forward this private link."
        )
        enqueue(
            conn,
            user_id=user["id"],
            contact_id=cid,
            kind="invitation",
            recipient=email,
            body=body,
            now=now,
        )

    def reinvite_contact(self, user, cid):
        now, token = self.clock(), new_token()
        with self.db.transaction() as conn:
            contact = conn.execute(
                "SELECT * FROM contacts WHERE id=? AND user_id=?", (cid, user["id"])
            ).fetchone()
            if not contact:
                raise ServiceError(404, "Contact not found")
            if contact["verified_at"] is not None:
                raise ServiceError(409, "Contact already confirmed")
            if contact["created_at"] + 60 > now:
                raise ServiceError(429, "Wait at least 60 seconds before requesting another link")
            conn.execute(
                "UPDATE contacts SET consent_hash=?,consent_expires_at=?,created_at=? WHERE id=?",
                (digest(token), now + 86400, now, cid),
            )
            conn.execute(
                "UPDATE notifications SET status='cancelled',updated_at=? "
                "WHERE contact_id=? AND kind='invitation' AND status IN ('pending','sending')",
                (now, cid),
            )
            self._invite(conn, user, cid, contact["email"], token, now)
        return {"status": "invitation_queued", "consent_expires_at": iso(now + 86400)}

    def confirm_contact(self, token):
        now = self.clock()
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM contacts WHERE consent_hash=?", (digest(token),)
            ).fetchone()
            if not row or row["consent_expires_at"] <= now:
                raise ServiceError(400, "Invalid or expired consent link")
            if row["verified_at"] is None:
                conn.execute("UPDATE contacts SET verified_at=? WHERE id=?", (now, row["id"]))
        return {"status": "confirmed"}

    def contacts(self, user):
        with self.db.read() as conn:
            rows = conn.execute(
                "SELECT * FROM contacts WHERE user_id=? ORDER BY created_at", (user["id"],)
            ).fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "email": r["email"],
                "verified": r["verified_at"] is not None,
                "consent_expires_at": iso(r["consent_expires_at"]),
            }
            for r in rows
        ]

    def _owned_trip(self, conn, user, tid):
        row = conn.execute(
            "SELECT * FROM trips WHERE id=? AND user_id=?", (tid, user["id"])
        ).fetchone()
        if not row:
            raise ServiceError(404, "Trip not found")
        return row

    def _serialize_trip(self, conn, row):
        contacts = conn.execute(
            "SELECT contact_id,name,email FROM trip_contacts WHERE trip_id=?", (row["id"],)
        ).fetchall()
        due = row["return_at"] + row["grace_seconds"]
        status = row["status"]
        monitor = (
            "awaiting_start"
            if status == "planned"
            else "closed"
            if status in {"completed", "cancelled"}
            else "overdue"
            if self.clock() >= due
            else "watching"
        )
        return {
            "id": row["id"],
            "title": row["title"],
            "notes": row["notes"],
            "route": json.loads(row["route_json"]),
            "status": status,
            "monitoring": monitor,
            "expected_return_at": iso(row["return_at"]),
            "grace_minutes": row["grace_seconds"] // 60,
            "alert_due_at": iso(due),
            "created_at": iso(row["created_at"]),
            "started_at": iso(row["started_at"]),
            "ended_at": iso(row["ended_at"]),
            "contacts": [dict(r) for r in contacts],
        }

    def create_trip(self, user, data: TripCreate, key: str):
        now, tid, hashed = self.clock(), new_id(), fingerprint(data)
        with self.db.transaction() as conn:
            existing = conn.execute(
                "SELECT * FROM trips WHERE user_id=? AND request_key=?", (user["id"], key)
            ).fetchone()
            if existing:
                if existing["request_hash"] != hashed:
                    raise ServiceError(409, "Idempotency key was used with different trip data")
                return self._serialize_trip(conn, existing)
            if data.expected_return_at.timestamp() <= now:
                raise ServiceError(422, "Expected return time must be in the future")
            contacts = []
            for cid in data.contact_ids:
                row = conn.execute(
                    "SELECT * FROM contacts WHERE id=? AND user_id=?", (cid, user["id"])
                ).fetchone()
                if not row:
                    raise ServiceError(404, "Contact not found")
                contacts.append(row)
            conn.execute(
                """INSERT INTO trips
                (id,user_id,title,route_json,notes,return_at,grace_seconds,status,created_at,
                 request_key,request_hash) VALUES (?,?,?,?,?,?,?,'planned',?,?,?)""",
                (
                    tid,
                    user["id"],
                    data.title,
                    data.route.model_dump_json(),
                    data.notes,
                    data.expected_return_at.timestamp(),
                    data.grace_minutes * 60,
                    now,
                    key,
                    hashed,
                ),
            )
            for c in contacts:
                conn.execute(
                    "INSERT INTO trip_contacts VALUES (?,?,?,?)",
                    (tid, c["id"], c["name"], c["email"]),
                )
            return self._serialize_trip(conn, self._owned_trip(conn, user, tid))

    def trips(self, user, limit=50, offset=0):
        with self.db.read() as conn:
            rows = conn.execute(
                "SELECT * FROM trips WHERE user_id=? "
                "ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                (user["id"], limit, offset),
            ).fetchall()
            return [self._serialize_trip(conn, r) for r in rows]

    def trip(self, user, tid):
        with self.db.read() as conn:
            return self._serialize_trip(conn, self._owned_trip(conn, user, tid))

    def start_trip(self, user, tid):
        now = self.clock()
        with self.db.transaction() as conn:
            row = self._owned_trip(conn, user, tid)
            if row["status"] == "active":
                return self._serialize_trip(conn, row)
            if row["status"] != "planned":
                raise ServiceError(409, "Only a planned trip can start")
            if row["return_at"] <= now:
                raise ServiceError(409, "Update the expected return time before starting")
            unverified = conn.execute(
                """SELECT 1 FROM trip_contacts tc JOIN contacts c ON c.id=tc.contact_id
                   WHERE tc.trip_id=? AND c.verified_at IS NULL LIMIT 1""",
                (tid,),
            ).fetchone()
            if unverified:
                raise ServiceError(409, "All selected emergency contacts must confirm consent")
            try:
                conn.execute("UPDATE trips SET status='active',started_at=? WHERE id=?", (now, tid))
            except sqlite3.IntegrityError as exc:
                raise ServiceError(409, "Finish or cancel your existing active trip first") from exc
            return self._serialize_trip(conn, self._owned_trip(conn, user, tid))

    def update_return_time(self, user, tid, expected_return_at):
        now = self.clock()
        with self.db.transaction() as conn:
            row = self._owned_trip(conn, user, tid)
            if row["status"] not in {"planned", "active"}:
                raise ServiceError(409, "Closed trips cannot be changed")
            if row["status"] == "active" and row["return_at"] + row["grace_seconds"] <= now:
                raise ServiceError(
                    409, "An overdue trip cannot extend its deadline; check in returned"
                )
            if expected_return_at.timestamp() <= now:
                raise ServiceError(422, "Expected return time must be in the future")
            conn.execute(
                "UPDATE trips SET return_at=? WHERE id=?", (expected_return_at.timestamp(), tid)
            )
            return self._serialize_trip(conn, self._owned_trip(conn, user, tid))

    def _close_trip(self, conn, user, tid, status, now):
        # Queue a follow-up for accepted notices AND possibly in-flight sends.
        possibly_sent = conn.execute(
            """SELECT * FROM notifications WHERE trip_id=? AND kind='overdue'
               AND status IN ('sending','accepted','simulated')""",
            (tid,),
        ).fetchall()
        conn.execute("UPDATE trips SET status=?,ended_at=? WHERE id=?", (status, now, tid))
        conn.execute(
            """UPDATE notifications SET status='cancelled',updated_at=?,
                      lease_token=NULL,lease_until=NULL WHERE trip_id=? AND kind='overdue'
                      AND status IN ('pending','sending','failed')""",
            (now, tid),
        )
        row = self._owned_trip(conn, user, tid)
        for notification in possibly_sent:
            enqueue(
                conn,
                user_id=user["id"],
                trip_id=tid,
                contact_id=notification["contact_id"],
                kind="resolved",
                recipient=notification["recipient"],
                body=alert_body(conn, row, user, closed=True),
                now=now,
            )

    def cancel_trip(self, user, tid):
        now = self.clock()
        with self.db.transaction() as conn:
            row = self._owned_trip(conn, user, tid)
            if row["status"] == "cancelled":
                return self._serialize_trip(conn, row)
            if row["status"] == "completed":
                raise ServiceError(409, "A completed trip cannot be cancelled")
            self._close_trip(conn, user, tid, "cancelled", now)
            return self._serialize_trip(conn, self._owned_trip(conn, user, tid))

    def check_in(self, user, tid, data: CheckIn):
        now, hashed = self.clock(), fingerprint(data)
        with self.db.transaction() as conn:
            trip = self._owned_trip(conn, user, tid)
            existing = conn.execute(
                "SELECT * FROM checkins WHERE trip_id=? AND event_id=?", (tid, data.event_id)
            ).fetchone()
            if existing:
                if existing["request_hash"] != hashed:
                    raise ServiceError(409, "Event id was used with different check-in data")
                return self._serialize_checkin(existing)
            if trip["status"] != "active":
                raise ServiceError(409, "Check-ins require an active trip")
            recorded = data.recorded_at.timestamp() if data.recorded_at else now
            if recorded > now + 60 or recorded < trip["started_at"]:
                raise ServiceError(
                    422, "Observation time must be during this trip, not in the future"
                )
            check_id = new_id()
            conn.execute(
                """INSERT INTO checkins
                         (id,trip_id,event_id,request_hash,kind,note,position_json,
                          recorded_at,received_at) VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    check_id,
                    tid,
                    data.event_id,
                    hashed,
                    data.kind,
                    data.note,
                    data.position.model_dump_json() if data.position else None,
                    recorded,
                    now,
                ),
            )
            if data.kind == "returned":
                self._close_trip(conn, user, tid, "completed", now)
            row = conn.execute("SELECT * FROM checkins WHERE id=?", (check_id,)).fetchone()
            return self._serialize_checkin(row)

    def _serialize_checkin(self, row):
        return {
            "id": row["id"],
            "event_id": row["event_id"],
            "kind": row["kind"],
            "note": row["note"],
            "position": json.loads(row["position_json"]) if row["position_json"] else None,
            "recorded_at": iso(row["recorded_at"]),
            "received_at": iso(row["received_at"]),
        }

    def checkins(self, user, tid, limit=50, offset=0):
        with self.db.read() as conn:
            self._owned_trip(conn, user, tid)
            rows = conn.execute(
                "SELECT * FROM checkins WHERE trip_id=? "
                "ORDER BY received_at DESC,id DESC LIMIT ? OFFSET ?",
                (tid, limit, offset),
            ).fetchall()
            return [self._serialize_checkin(r) for r in rows]

    def notifications(self, user, limit=50, offset=0):
        with self.db.read() as conn:
            rows = conn.execute(
                "SELECT * FROM notifications WHERE user_id=? "
                "ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
                (user["id"], limit, offset),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "trip_id": r["trip_id"],
                "contact_id": r["contact_id"],
                "kind": r["kind"],
                "status": r["status"],
                "attempts": r["attempts"],
                "next_attempt_at": iso(r["available_at"]) if r["status"] == "pending" else None,
                "last_error": r["last_error"],
                "created_at": iso(r["created_at"]),
                "updated_at": iso(r["updated_at"]),
            }
            for r in rows
        ]

    def demo_mail(self, user):
        if self.settings.delivery_mode != "demo":
            raise ServiceError(404, "Not found")
        with self.db.read() as conn:
            rows = conn.execute(
                """SELECT m.* FROM demo_mail m JOIN notifications n
                ON n.id=m.notification_id WHERE n.user_id=? ORDER BY m.created_at DESC LIMIT 100""",
                (user["id"],),
            ).fetchall()
        return [{**dict(r), "created_at": iso(r["created_at"])} for r in rows]
