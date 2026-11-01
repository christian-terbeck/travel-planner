-- Travel documents per traveler (no numbers, only what is needed to warn about validity).
CREATE TABLE traveler_documents (
  id          TEXT PRIMARY KEY,
  traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  label       TEXT,
  expires_on  TEXT,
  notes       TEXT
);
CREATE INDEX traveler_documents_traveler ON traveler_documents(traveler_id);
