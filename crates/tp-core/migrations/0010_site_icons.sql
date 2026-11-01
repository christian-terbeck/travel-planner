-- Icons fetched from provider websites (optional). `data_uri` is NULL for a site without a usable
-- icon, which is asked again after a while.
CREATE TABLE site_icons (
    site       TEXT PRIMARY KEY,
    data_uri   TEXT,
    fetched_at TEXT NOT NULL
);
