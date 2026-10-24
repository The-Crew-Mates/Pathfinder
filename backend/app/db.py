import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Database:
    def __init__(self, path: str):
        self.path = path

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA synchronous=FULL")
        return connection

    def initialize(self, delivery_mode):
        with self.read() as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version not in {0, 1}:
                raise RuntimeError("Unsupported database schema version")
            conn.executescript(Path(__file__).with_name("schema.sql").read_text())
        with self.transaction() as conn:
            existing = conn.execute(
                "SELECT value FROM runtime_settings WHERE key='delivery_mode'"
            ).fetchone()
            if existing and existing[0] != delivery_mode:
                raise RuntimeError(
                    "Delivery mode differs from this database. "
                    "Use a fresh DB_PATH so real contacts confirm through email."
                )
            conn.execute(
                "INSERT OR IGNORE INTO runtime_settings(key,value) VALUES ('delivery_mode',?)",
                (delivery_mode,),
            )

    @contextmanager
    def read(self):
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def transaction(self):
        with self.read() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
