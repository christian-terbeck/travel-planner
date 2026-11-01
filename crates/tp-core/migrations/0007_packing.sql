-- Packing list per trip, optionally per traveler, and reusable lists to start one from.
CREATE TABLE packing_items (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  traveler_id TEXT REFERENCES travelers(id) ON DELETE SET NULL,
  category    TEXT,
  title       TEXT NOT NULL,
  quantity    INTEGER,
  packed      INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX packing_items_trip ON packing_items(trip_id);

CREATE TABLE packing_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- JSON array of {"category": string|null, "title": string, "quantity": int|null}
  items      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
