//! Generic mapping between row structs and their tables. Column names are the struct's field
//! names, which are fixed at compile time, so building SQL from them is safe.

use rusqlite::types::Value;
use rusqlite::{Connection, params_from_iter};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::error::{CoreError, CoreResult};
use crate::model::*;

pub trait Row: Serialize + DeserializeOwned {
    const TABLE: &'static str;
    /// Primary key columns.
    const KEY: &'static [&'static str] = &["id"];
}

macro_rules! rows {
    ($($ty:ty => $table:literal $(key $($k:literal),+)?;)+) => {
        $(impl Row for $ty {
            const TABLE: &'static str = $table;
            $(const KEY: &'static [&'static str] = &[$($k),+];)?
        })+
    };
}

rows! {
    Trip => "trips";
    Traveler => "travelers";
    TravelerDocument => "traveler_documents";
    Station => "stations";
    Slot => "slots";
    PlanOption => "options";
    FlightSegment => "flight_segments";
    AccommodationDetails => "accommodation_details" key "option_id";
    RentalCarDetails => "rental_car_details" key "option_id";
    ActivityDetails => "activity_details" key "option_id";
    OptionFee => "option_fees";
    CancellationPolicy => "cancellation_policies";
    Booking => "bookings";
    Payment => "payments";
    Expense => "expenses";
    CostShare => "cost_shares";
    Scenario => "scenarios";
    ScenarioSelection => "scenario_selections" key "scenario_id", "slot_id";
    PriceObservation => "price_observations";
    Task => "tasks";
    PackingItem => "packing_items";
    PackingTemplate => "packing_templates";
    DismissedWarning => "dismissed_warnings" key "trip_id", "key";
    OpenNight => "open_nights" key "trip_id", "night";
    Document => "documents";
    JournalEntry => "journal_entries";
    Note => "notes";
    ExchangeRate => "exchange_rates";
    ChangeLogEntry => "change_log";
}

fn columns<T: Row>(row: &T) -> CoreResult<Vec<(String, Value)>> {
    let serde_json::Value::Object(map) = serde_json::to_value(row)? else {
        return Err(CoreError::invalid(T::TABLE, "row must serialize to an object"));
    };
    Ok(map.into_iter().map(|(k, v)| (k, to_sql(v))).collect())
}

fn to_sql(v: serde_json::Value) -> Value {
    use serde_json::Value as J;
    match v {
        J::Null => Value::Null,
        J::Bool(b) => Value::Integer(b as i64),
        J::Number(n) => n.as_i64().map(Value::Integer).unwrap_or_else(|| Value::Real(n.as_f64().unwrap_or(0.0))),
        J::String(s) => Value::Text(s),
        other => Value::Text(other.to_string()),
    }
}

/// Inserts the row, or updates every column except the key and `created_at` if it exists.
pub fn upsert<T: Row>(conn: &Connection, row: &T) -> CoreResult<()> {
    let cols = columns(row)?;
    let names: Vec<&str> = cols.iter().map(|(k, _)| k.as_str()).collect();
    let placeholders = vec!["?"; cols.len()].join(", ");
    let updates: Vec<String> = names
        .iter()
        .filter(|c| !T::KEY.contains(c) && **c != "created_at")
        .map(|c| format!("{c} = excluded.{c}"))
        .collect();
    let conflict = if updates.is_empty() {
        "DO NOTHING".to_string()
    } else {
        format!("DO UPDATE SET {}", updates.join(", "))
    };
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({placeholders}) ON CONFLICT ({}) {conflict}",
        T::TABLE,
        names.join(", "),
        T::KEY.join(", ")
    );
    conn.execute(&sql, params_from_iter(cols.into_iter().map(|(_, v)| v)))?;
    Ok(())
}

/// Inserts a row that must not exist yet.
pub fn insert<T: Row>(conn: &Connection, row: &T) -> CoreResult<()> {
    let cols = columns(row)?;
    let names: Vec<&str> = cols.iter().map(|(k, _)| k.as_str()).collect();
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        T::TABLE,
        names.join(", "),
        vec!["?"; cols.len()].join(", ")
    );
    conn.execute(&sql, params_from_iter(cols.into_iter().map(|(_, v)| v)))?;
    Ok(())
}

/// Rows matching `filter` (an SQL condition with `?` placeholders), in rowid order unless the
/// filter brings its own ORDER BY.
pub fn select<T: Row>(conn: &Connection, filter: &str, params: &[&dyn rusqlite::ToSql]) -> CoreResult<Vec<T>> {
    let sql = format!("SELECT * FROM {} WHERE {filter}", T::TABLE);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query(params)?;
    let mut out = Vec::new();
    for row in serde_rusqlite::from_rows::<T>(rows) {
        out.push(row?);
    }
    Ok(out)
}

pub fn get<T: Row>(conn: &Connection, id: &str) -> CoreResult<T> {
    select::<T>(conn, "id = ?", &[&id])?
        .into_iter()
        .next()
        .ok_or_else(|| CoreError::NotFound(format!("{} {id}", T::TABLE)))
}

pub fn find<T: Row>(conn: &Connection, id: &str) -> CoreResult<Option<T>> {
    Ok(select::<T>(conn, "id = ?", &[&id])?.into_iter().next())
}

pub fn delete_by<T: Row>(conn: &Connection, filter: &str, params: &[&dyn rusqlite::ToSql]) -> CoreResult<usize> {
    Ok(conn.execute(&format!("DELETE FROM {} WHERE {filter}", T::TABLE), params)?)
}
