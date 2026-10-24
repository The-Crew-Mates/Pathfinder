PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    consent_hash TEXT NOT NULL UNIQUE,
    consent_expires_at REAL NOT NULL,
    verified_at REAL,
    created_at REAL NOT NULL,
    UNIQUE(user_id, email)
);
CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    route_json TEXT NOT NULL,
    notes TEXT NOT NULL,
    return_at REAL NOT NULL,
    grace_seconds INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('planned','active','completed','cancelled')),
    created_at REAL NOT NULL,
    started_at REAL,
    ended_at REAL,
    request_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    UNIQUE(user_id, request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_trip ON trips(user_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS overdue_trips ON trips(status, return_at);
CREATE TABLE IF NOT EXISTS trip_contacts (
    trip_id TEXT NOT NULL REFERENCES trips(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    PRIMARY KEY(trip_id, contact_id)
);
CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id),
    event_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('progress','returned')),
    note TEXT NOT NULL,
    position_json TEXT,
    recorded_at REAL NOT NULL,
    received_at REAL NOT NULL,
    UNIQUE(trip_id, event_id)
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    trip_id TEXT REFERENCES trips(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    kind TEXT NOT NULL CHECK(kind IN ('invitation','overdue','resolved')),
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN
        ('pending','sending','accepted','simulated','failed','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at REAL NOT NULL,
    lease_token TEXT,
    lease_until REAL,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    last_error TEXT,
    UNIQUE(trip_id, contact_id, kind)
);
CREATE INDEX IF NOT EXISTS pending_notifications ON notifications(status, available_at);
CREATE TABLE IF NOT EXISTS demo_mail (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id),
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS worker_state (
    id INTEGER PRIMARY KEY CHECK(id=1),
    last_tick REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
PRAGMA user_version=1;

