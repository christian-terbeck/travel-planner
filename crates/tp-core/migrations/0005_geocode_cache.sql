-- Answers of the online address search, so the same text is asked only once.
-- `query` is the normalised search text in lower case; `results` is a JSON array of places.
CREATE TABLE geocode_cache (
    service    TEXT NOT NULL,
    query      TEXT NOT NULL,
    language   TEXT NOT NULL,
    results    TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (service, query, language)
);
