-- Money passed between travelers to even out shared costs ("Anna paid Ben 43 €"). Changes the
-- balances between them, not the cost of the trip.
CREATE TABLE settlements (
  id               TEXT PRIMARY KEY,
  trip_id          TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  to_traveler_id   TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  amount_minor     INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  paid_on          TEXT NOT NULL,
  notes            TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX settlements_trip ON settlements(trip_id);
