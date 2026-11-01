-- Travel journal: one entry per day of a trip; photos are documents linked to an entry.
CREATE TABLE journal_entries (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,      -- local date YYYY-MM-DD
  title      TEXT,
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX journal_entries_day ON journal_entries(trip_id, day);

-- Deleting an entry keeps its photos as documents of the trip.
ALTER TABLE documents ADD COLUMN journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL;
