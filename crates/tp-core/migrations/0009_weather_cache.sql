-- Answers of the optional weather service. `key` names source, rounded coordinates and dates;
-- `days` is a JSON array of daily values.
CREATE TABLE weather_cache (
    key        TEXT PRIMARY KEY,
    days       TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
