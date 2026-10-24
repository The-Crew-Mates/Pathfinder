-- Pathfinder trail database (SQLite)
--
-- This is the migration: it creates both tables plus the rules (checks and
-- triggers) that keep the data clean. Run it with:
--     python3 scripts/create_db.py
--
-- STRICT makes SQLite reject values of the wrong type. Without it, SQLite
-- would happily store the text 'abc' in a number column.

CREATE TABLE trails (
    id          INTEGER PRIMARY KEY,           -- auto-numbered: 1, 2, 3, ...
    slug        TEXT    NOT NULL UNIQUE,       -- stable short name, e.g. 'haukankierros'
    name        TEXT    NOT NULL,
    region      TEXT    NOT NULL,
    difficulty  TEXT    NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'hard')),
    length_km   REAL    NOT NULL CHECK (length_km > 0),

    -- JSON list of points in walking order: [{"lat": 60.304, "lon": 24.517}, ...]
    -- A point may also have "ele" (elevation in metres) when the source has it.
    -- SQLite has no list type, so lists are stored as JSON text.
    route       TEXT    NOT NULL CHECK (json_valid(route) AND json_array_length(route) >= 2),

    -- JSON list of strings: ["Slippery when wet", ...]
    warnings    TEXT    NOT NULL DEFAULT '[]'
                        CHECK (json_valid(warnings) AND json_type(warnings) = 'array'),

    -- Defaults to 'placeholder', so data only counts as real if someone says so.
    data_source TEXT    NOT NULL DEFAULT 'placeholder'
                        CHECK (data_source IN ('placeholder', 'lipas', 'osm', 'manual')),

    -- Where an imported trail came from, e.g. 'lipas:527088'. Lets a re-import
    -- find and update the same trail instead of adding a copy. NULL for
    -- trails that weren't imported (like the placeholder ones).
    source_id   TEXT    UNIQUE,
    -- A "fingerprint" of the imported data. If it hasn't changed on the next
    -- import, the trail is left alone and keeps its version.
    source_hash TEXT,

    -- Goes up by 1 whenever the trail or one of its landmarks changes (see triggers below).
    version     INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE TABLE landmarks (
    id          INTEGER PRIMARY KEY,
    -- Must point to a real trail. Deleting a trail deletes its landmarks too.
    trail_id    INTEGER NOT NULL REFERENCES trails (id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL
                        CHECK (type IN ('shelter', 'hut', 'viewpoint', 'junction', 'water', 'parking', 'other')),
    lat         REAL    NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon         REAL    NOT NULL CHECK (lon BETWEEN -180 AND 180),
    description TEXT
) STRICT;

-- Makes "all landmarks for trail X" fast, even with thousands of landmarks.
CREATE INDEX landmarks_trail_id_idx ON landmarks (trail_id);


-- ---------------------------------------------------------------------------
-- Triggers: small bits of SQL the database runs automatically.
-- They keep trails.version up to date, so the app can tell when a saved
-- bundle is outdated.
-- ---------------------------------------------------------------------------

-- Editing a trail bumps its version.
-- The WHEN check skips updates that already change the version themselves
-- (like the ones the landmark triggers below make), so nothing is counted twice.
CREATE TRIGGER trail_edited
AFTER UPDATE ON trails
WHEN NEW.version = OLD.version
BEGIN
    UPDATE trails
    SET version = OLD.version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = NEW.id;
END;

-- Adding, editing or deleting a landmark bumps its trail's version too:
-- a new water point means saved bundles of that trail are out of date.
CREATE TRIGGER landmark_added
AFTER INSERT ON landmarks
BEGIN
    UPDATE trails
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = NEW.trail_id;
END;

CREATE TRIGGER landmark_edited
AFTER UPDATE ON landmarks
BEGIN
    -- Both ids, in case the landmark was moved from one trail to another.
    UPDATE trails
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id IN (OLD.trail_id, NEW.trail_id);
END;

CREATE TRIGGER landmark_deleted
AFTER DELETE ON landmarks
BEGIN
    UPDATE trails
    SET version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE id = OLD.trail_id;
END;
