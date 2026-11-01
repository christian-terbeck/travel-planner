-- Loyalty and frequent flyer programmes per traveler, offered when booking with that provider.
CREATE TABLE loyalty_memberships (
  id          TEXT PRIMARY KEY,
  traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  program     TEXT NOT NULL,     -- e.g. "Miles & More"
  provider    TEXT,              -- airline, chain or company it belongs to, for matching bookings
  number      TEXT NOT NULL,
  tier        TEXT,              -- status level, e.g. "Frequent Traveller"
  notes       TEXT
);
CREATE INDEX loyalty_memberships_traveler ON loyalty_memberships(traveler_id);
