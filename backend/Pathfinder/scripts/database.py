"""Shared helper for opening the Pathfinder database.

Every script imports from here, so the file locations and connection
settings live in one place.
"""

import sqlite3
import sys
from pathlib import Path

# Paths are worked out from where this file lives, so the scripts find the
# database no matter which folder you run them from.
ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "pathfinder.db"
SCHEMA_PATH = ROOT / "db" / "schema.sql"


def connect():
    """Open pathfinder.db and return the connection."""
    # sqlite3.connect() would quietly create an empty database if the file
    # is missing, which leads to confusing "no such table" errors later.
    if not DB_PATH.exists():
        sys.exit("No database yet. Create it first:\n  python3 scripts/create_db.py")

    conn = sqlite3.connect(DB_PATH)
    # SQLite ignores REFERENCES (landmarks.trail_id must point to a real
    # trail) unless this is switched on, and it resets for every connection.
    conn.execute("PRAGMA foreign_keys = ON")
    # Lets us read columns by name, like row["name"], instead of row[2].
    conn.row_factory = sqlite3.Row
    return conn
