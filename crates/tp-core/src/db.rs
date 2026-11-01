//! Connection setup and schema migrations (tracked with `PRAGMA user_version`).

use std::path::Path;

use rusqlite::Connection;

use crate::error::CoreResult;

/// Ordered migrations; index + 1 is the schema version they lead to. Never edit a released one.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_locations.sql"),
    include_str!("../migrations/0003_road_routes.sql"),
    include_str!("../migrations/0004_transport.sql"),
    include_str!("../migrations/0005_geocode_cache.sql"),
    include_str!("../migrations/0006_target_price.sql"),
    include_str!("../migrations/0007_packing.sql"),
    include_str!("../migrations/0008_traveler_documents.sql"),
    include_str!("../migrations/0009_weather_cache.sql"),
    include_str!("../migrations/0010_site_icons.sql"),
    include_str!("../migrations/0011_journal.sql"),
    include_str!("../migrations/0012_settlements.sql"),
    include_str!("../migrations/0013_connection_buffers.sql"),
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

pub fn open(path: &Path) -> CoreResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    prepare(conn)
}

pub fn open_in_memory() -> CoreResult<Connection> {
    prepare(Connection::open_in_memory()?)
}

fn prepare(mut conn: Connection) -> CoreResult<Connection> {
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    migrate_existing(&mut conn)?;
    Ok(conn)
}

pub fn schema_version(conn: &Connection) -> CoreResult<i64> {
    Ok(conn.pragma_query_value(None, "user_version", |r| r.get(0))?)
}

/// Brings an open database (e.g. one just restored from a backup) to the latest schema.
pub fn migrate_existing(conn: &mut Connection) -> CoreResult<()> {
    let current = schema_version(conn)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_fresh_database_to_latest_version() {
        let conn = open_in_memory().unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let fk: bool = conn.pragma_query_value(None, "foreign_keys", |r| r.get(0)).unwrap();
        assert!(fk);
    }

    #[test]
    fn upgrading_keeps_existing_rows() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.execute_batch(
            "INSERT INTO trips (id, title, currency, created_at, updated_at) VALUES ('t', 'Old', 'EUR', 'x', 'x');
             INSERT INTO slots (id, trip_id, kind, title, created_at) VALUES ('s', 't', 'accommodation', 'Stay', 'x');
             INSERT INTO options (id, slot_id, title, currency, created_at, updated_at) VALUES ('o', 's', 'Hotel', 'EUR', 'x', 'x');
             INSERT INTO accommodation_details (option_id, check_in) VALUES ('o', '2027-06-10');",
        )
        .unwrap();
        migrate_existing(&mut conn).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let (check_in, lat): (String, Option<f64>) = conn
            .query_row("SELECT check_in, lat FROM accommodation_details WHERE option_id = 'o'", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(check_in, "2027-06-10");
        assert_eq!(lat, None);
    }

    #[test]
    fn reopening_does_not_rerun_migrations() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.sqlite");
        drop(open(&path).unwrap());
        let conn = open(&path).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
    }
}
