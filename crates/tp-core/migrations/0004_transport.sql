-- Ground and sea transport (train, bus, ferry, transfer) reuses the segment table of flights:
-- `mode` is NULL for flights; places are free text with optional coordinates (WGS 84).
ALTER TABLE flight_segments ADD COLUMN mode TEXT;
ALTER TABLE flight_segments ADD COLUMN from_place TEXT;
ALTER TABLE flight_segments ADD COLUMN to_place TEXT;
ALTER TABLE flight_segments ADD COLUMN from_lat REAL;
ALTER TABLE flight_segments ADD COLUMN from_lon REAL;
ALTER TABLE flight_segments ADD COLUMN to_lat REAL;
ALTER TABLE flight_segments ADD COLUMN to_lon REAL;
