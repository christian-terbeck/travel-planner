-- Minimum time to change between two journeys: same means of transport (e.g. flight to flight at
-- one airport) and a change of means or airport (e.g. flight to train).
ALTER TABLE trips ADD COLUMN connection_buffer_min INTEGER NOT NULL DEFAULT 45;
ALTER TABLE trips ADD COLUMN mode_change_buffer_min INTEGER NOT NULL DEFAULT 90;
