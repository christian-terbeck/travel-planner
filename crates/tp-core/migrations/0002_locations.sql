-- Optional coordinates (WGS 84) for the map and distance estimates.
ALTER TABLE accommodation_details ADD COLUMN lat REAL;
ALTER TABLE accommodation_details ADD COLUMN lon REAL;
ALTER TABLE activity_details ADD COLUMN lat REAL;
ALTER TABLE activity_details ADD COLUMN lon REAL;
