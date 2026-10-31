-- Road routes fetched from the online route service, so each leg is asked for only once.
-- `service` is the base URL that answered; coordinates are rounded to 5 decimals (~1 m).
-- A leg the service could not route is stored with NULL distance.
CREATE TABLE road_routes (
    service    TEXT NOT NULL,
    from_lat   REAL NOT NULL,
    from_lon   REAL NOT NULL,
    to_lat     REAL NOT NULL,
    to_lon     REAL NOT NULL,
    distance_m REAL,
    duration_s REAL,
    path       TEXT NOT NULL DEFAULT '[]',
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (service, from_lat, from_lon, to_lat, to_lon)
);
