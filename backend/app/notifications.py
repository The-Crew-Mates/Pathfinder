import logging
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage

from app.config import Settings
from app.db import Database
from app.security import new_token
from app.service import alert_body, enqueue

logger = logging.getLogger(__name__)


class DemoTransport:
    """A private, durable demo inbox. This transport never sends a real email."""

    def __init__(self, db, clock):
        self.db, self.clock = db, clock

    def send(self, notification):
        with self.db.transaction() as conn:
            conn.execute(
                """INSERT OR IGNORE INTO demo_mail
                (notification_id,recipient,subject,body,created_at) VALUES (?,?,?,?,?)""",
                (
                    notification["id"],
                    notification["recipient"],
                    notification["subject"],
                    notification["body"],
                    self.clock(),
                ),
            )
        return "simulated"


class SMTPTransport:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send(self, notification):
        cfg = self.settings
        message = EmailMessage()
        message["From"] = cfg.smtp_from
        message["To"] = notification["recipient"]
        message["Subject"] = notification["subject"]
        # Stable across retries. SMTP does not guarantee recipient deduplication.
        message["Message-ID"] = f"<{notification['id']}@gps-fails.local>"
        message.set_content(notification["body"])
        context = ssl.create_default_context()
        if cfg.smtp_tls == "ssl":
            client = smtplib.SMTP_SSL(
                cfg.smtp_host, cfg.smtp_port, timeout=cfg.smtp_timeout, context=context
            )
        else:
            client = smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=cfg.smtp_timeout)
        try:
            with client:
                if cfg.smtp_tls == "starttls":
                    client.ehlo()
                    client.starttls(context=context)
                    client.ehlo()
                if cfg.smtp_user:
                    client.login(cfg.smtp_user, cfg.smtp_password)
                refused = client.send_message(message)
                if refused:
                    raise smtplib.SMTPRecipientsRefused(refused)
        except smtplib.SMTPResponseException:
            raise
        return "accepted"  # The SMTP server accepted it. Inbox delivery is not confirmed.


class AlertWorker:
    def __init__(self, db: Database, settings: Settings, clock=time.time, transport=None):
        self.db, self.settings, self.clock = db, settings, clock
        self.transport = transport or (
            DemoTransport(db, clock)
            if settings.delivery_mode == "demo"
            else SMTPTransport(settings)
        )
        self.stop_event = threading.Event()
        self.thread = None

    def heartbeat(self):
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO worker_state VALUES (1,?) "
                "ON CONFLICT(id) DO UPDATE SET last_tick=excluded.last_tick",
                (self.clock(),),
            )

    def scan(self):
        now = self.clock()
        with self.db.transaction() as conn:
            # Selecting unqueued trip/contact pairs avoids starving later trips on repeat scans.
            pairs = conn.execute(
                """SELECT t.id,tc.contact_id,tc.email FROM trips t
                   JOIN trip_contacts tc ON tc.trip_id=t.id
                   LEFT JOIN notifications n ON n.trip_id=t.id AND n.contact_id=tc.contact_id
                       AND n.kind='overdue'
                   WHERE t.status='active' AND t.return_at+t.grace_seconds<=? AND n.id IS NULL
                   ORDER BY t.return_at,t.id LIMIT 100""",
                (now,),
            ).fetchall()
            for pair in pairs:
                trip = conn.execute("SELECT * FROM trips WHERE id=?", (pair["id"],)).fetchone()
                user = conn.execute("SELECT * FROM users WHERE id=?", (trip["user_id"],)).fetchone()
                enqueue(
                    conn,
                    user_id=user["id"],
                    trip_id=trip["id"],
                    contact_id=pair["contact_id"],
                    kind="overdue",
                    recipient=pair["email"],
                    body=alert_body(conn, trip, user),
                    now=now,
                )
        return len(pairs)

    def claim(self):
        now = self.clock()
        with self.db.transaction() as conn:
            # A crash leaves a lease, never an in-memory-only job. Reclaim after expiry.
            conn.execute(
                """UPDATE notifications SET
                status=CASE WHEN attempts>=? THEN 'failed' ELSE 'pending' END,
                available_at=?,lease_token=NULL,lease_until=NULL,updated_at=?,
                last_error='WorkerLeaseExpired'
                WHERE status='sending' AND lease_until<=?""",
                (self.settings.max_attempts, now, now, now),
            )
            row = conn.execute(
                """SELECT * FROM notifications
                WHERE status='pending' AND available_at<=? ORDER BY created_at,id LIMIT 1""",
                (now,),
            ).fetchone()
            if not row:
                return None
            token = new_token()
            conn.execute(
                """UPDATE notifications SET status='sending',attempts=attempts+1,
                lease_token=?,lease_until=?,updated_at=? WHERE id=?""",
                (token, now + self.settings.lease_seconds, now, row["id"]),
            )
            return dict(
                conn.execute("SELECT * FROM notifications WHERE id=?", (row["id"],)).fetchone()
            )

    def deliver(self, job):
        now = self.clock()
        # Recheck ownership of the lease and trip state immediately before external I/O.
        with self.db.transaction() as conn:
            current = conn.execute(
                "SELECT * FROM notifications WHERE id=?", (job["id"],)
            ).fetchone()
            if (
                not current
                or current["status"] != "sending"
                or current["lease_token"] != job["lease_token"]
                or current["lease_until"] <= now
            ):
                return False
            if job["kind"] == "overdue":
                trip = conn.execute("SELECT * FROM trips WHERE id=?", (job["trip_id"],)).fetchone()
                if trip["status"] != "active" or trip["return_at"] + trip["grace_seconds"] > now:
                    conn.execute(
                        "UPDATE notifications SET status='cancelled',updated_at=?,"
                        "lease_token=NULL,lease_until=NULL WHERE id=?",
                        (now, job["id"]),
                    )
                    return False
        try:
            result = self.transport.send(job)
            if result not in {"simulated", "accepted"}:
                raise RuntimeError("Unsupported transport receipt")
        except Exception as exc:
            now = self.clock()
            failed = job["attempts"] >= self.settings.max_attempts
            delay = min(self.settings.retry_base_seconds * 2 ** (job["attempts"] - 1), 300)
            with self.db.transaction() as conn:
                conn.execute(
                    """UPDATE notifications SET status=?,available_at=?,updated_at=?,
                    last_error=?,lease_token=NULL,lease_until=NULL
                    WHERE id=? AND status='sending' AND lease_token=?""",
                    (
                        "failed" if failed else "pending",
                        now + delay,
                        now,
                        type(exc).__name__,
                        job["id"],
                        job["lease_token"],
                    ),
                )
            logger.warning(
                "Notification attempt failed: id=%s error=%s terminal=%s",
                job["id"],
                type(exc).__name__,
                failed,
            )
            return False
        with self.db.transaction() as conn:
            conn.execute(
                """UPDATE notifications SET status=?,updated_at=?,last_error=NULL,
                lease_token=NULL,lease_until=NULL
                WHERE id=? AND status='sending' AND lease_token=?""",
                (result, self.clock(), job["id"], job["lease_token"]),
            )
        return True

    def tick(self, max_messages=20):
        queued = self.scan()
        self.heartbeat()
        processed = 0
        for _ in range(max_messages):
            if self.stop_event.is_set():
                break
            job = self.claim()
            if not job:
                break
            self.deliver(job)
            processed += 1
            self.heartbeat()
        return {"queued": queued, "processed": processed}

    def run(self):
        while not self.stop_event.is_set():
            try:
                self.tick()
            except Exception as exc:
                logger.error("Worker tick failed: %s", type(exc).__name__)
            self.stop_event.wait(self.settings.poll_seconds)

    def start(self):
        self.thread = threading.Thread(target=self.run, name="safety-alerts", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)
        # Unfinished sends keep their lease and are recovered on the next worker run.


def main():
    cfg = Settings.from_env()
    cfg.validate()
    cfg.prepare_directory()
    db = Database(cfg.db_path)
    db.initialize(cfg.delivery_mode)
    logging.basicConfig(level=logging.INFO)
    worker = AlertWorker(db, cfg)
    try:
        worker.run()
    except KeyboardInterrupt:
        worker.stop()


if __name__ == "__main__":
    main()
