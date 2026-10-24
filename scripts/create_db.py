"""Create pathfinder.db by running the migration in db/schema.sql.

Usage:
    python3 scripts/create_db.py           # create a new database
    python3 scripts/create_db.py --reset   # delete the old one and start over
"""

import argparse
import sqlite3
import sys

from database import DB_PATH, SCHEMA_PATH


def main():
    parser = argparse.ArgumentParser(description="Create the Pathfinder trail database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete the existing database first (everything in it is lost)",
    )
    args = parser.parse_args()

    # The schema uses STRICT tables (SQLite 3.37+) and JSON checks (3.38+).
    # Python brings its own SQLite, so check it is new enough.
    if sqlite3.sqlite_version_info < (3, 38, 0):
        sys.exit(
            f"Your Python uses SQLite {sqlite3.sqlite_version}, but 3.38 or newer is needed.\n"
            "Install a newer Python from python.org."
        )

    # Refuse to overwrite an existing database unless asked, so nobody
    # loses data by running this twice.
    if DB_PATH.exists():
        if not args.reset:
            sys.exit(
                f"{DB_PATH.name} already exists (it's committed to git, so you usually\n"
                "don't need to create it). To delete it and start over, which restarts\n"
                "every trail's version at 1, run:\n"
                "  python3 scripts/create_db.py --reset"
            )
        DB_PATH.unlink()
        print(f"Deleted old {DB_PATH.name}")

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.close()
    print(f"Created {DB_PATH.name} (tables: trails, landmarks)")
    print("Next, add the sample trails:  python3 scripts/seed.py")


if __name__ == "__main__":
    main()
