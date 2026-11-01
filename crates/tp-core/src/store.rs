//! The persistence service: every change the UI can make, each in one transaction, with the
//! business rules that must hold no matter which screen (or import) triggers them.

use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::db;
use crate::documents;
use crate::error::{CoreError, CoreResult};
use crate::model::*;
use crate::table::{self, Row};
use crate::trash::{self, Trash};
use crate::validate::Validate;

pub type Clock = Box<dyn Fn() -> String + Send>;

pub struct Store {
    pub(crate) conn: Connection,
    pub(crate) data_dir: PathBuf,
    clock: Clock,
    pub(crate) trash: Trash,
}

/// Rows that are saved as they are (after validation and ownership checks).
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(tag = "type", content = "row", rename_all = "snake_case")]
#[ts(export)]
pub enum Entity {
    Trip(Trip),
    Traveler(Traveler),
    Station(Station),
    Slot(Slot),
    Payment(Payment),
    Expense(Expense),
    CostShare(CostShare),
    Task(Task),
    Note(Note),
    DismissedWarning(DismissedWarning),
    OpenNight(OpenNight),
    ExchangeRate(ExchangeRate),
    PriceObservation(PriceObservation),
}

#[derive(Debug, Clone, Copy, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum EntityKind {
    Trip,
    Traveler,
    Station,
    Slot,
    Option,
    Booking,
    Payment,
    Expense,
    CostShare,
    Scenario,
    Task,
    Note,
    Document,
    DismissedWarning,
    OpenNight,
    ExchangeRate,
    PriceObservation,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct BookingInput {
    pub booking: Booking,
    /// Cancellation terms as booked (usually pre-filled from the option's policy).
    pub policy: Option<CancellationPolicy>,
    /// Flight segments covered by this booking; empty means all segments not yet booked.
    pub segment_ids: Vec<String>,
    pub payments: Vec<Payment>,
    /// Booking without a prior alternative: the option is created in the same transaction.
    pub new_option: Option<OptionBundle>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CancelInput {
    pub booking_id: String,
    pub requested_at: Option<String>,
    pub cancelled_at: String,
    pub refund_final_minor: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct AppInfo {
    pub data_dir: String,
    pub schema_version: i64,
    pub settings: Vec<(String, String)>,
    pub exchange_rates: Vec<ExchangeRate>,
}

pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

pub fn utc_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

impl Store {
    pub fn open(data_dir: &Path) -> CoreResult<Self> {
        std::fs::create_dir_all(documents::dir(data_dir))?;
        let conn = db::open(&data_dir.join("travel-planner.sqlite"))?;
        let store = Self { conn, data_dir: data_dir.to_path_buf(), clock: Box::new(utc_now), trash: Trash::default() };
        // Files of deletions that could have been undone in the last session.
        store.remove_orphan_files()?;
        Ok(store)
    }

    /// In-memory database with a fixed clock, for tests.
    pub fn for_tests(data_dir: &Path, now: &'static str) -> CoreResult<Self> {
        std::fs::create_dir_all(documents::dir(data_dir))?;
        Ok(Self { conn: db::open_in_memory()?, data_dir: data_dir.to_path_buf(), clock: Box::new(move || now.to_string()), trash: Trash::default() })
    }

    #[cfg(test)]
    pub(crate) fn set_now(&mut self, now: &'static str) {
        self.clock = Box::new(move || now.to_string());
    }

    pub fn now(&self) -> String {
        (self.clock)()
    }

    pub fn app_info(&self) -> CoreResult<AppInfo> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let settings = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<Result<_, _>>()?;
        Ok(AppInfo {
            data_dir: self.data_dir.display().to_string(),
            schema_version: db::schema_version(&self.conn)?,
            settings,
            exchange_rates: table::select(&self.conn, "1 ORDER BY as_of DESC", &[])?,
        })
    }

    pub fn setting(&self, key: &str) -> CoreResult<Option<String>> {
        Ok(self.conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()?)
    }

    pub fn set_setting(&self, key: &str, value: Option<&str>) -> CoreResult<()> {
        if key.is_empty() || key.len() > 64 || value.is_some_and(|v| v.len() > 10_000) {
            return Err(CoreError::invalid("key", "invalid setting"));
        }
        match value {
            Some(v) => self.conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (key, v),
            )?,
            None => self.conn.execute("DELETE FROM settings WHERE key = ?1", [key])?,
        };
        Ok(())
    }

    // ---- Reading ------------------------------------------------------------------------

    pub fn trip_graphs(&self) -> CoreResult<Vec<TripGraph>> {
        let trips: Vec<Trip> = table::select(&self.conn, "1 ORDER BY created_at", &[])?;
        trips.into_iter().map(|t| load_graph(&self.conn, t)).collect()
    }

    pub fn trip_graph(&self, trip_id: &str) -> CoreResult<TripGraph> {
        load_graph(&self.conn, table::get(&self.conn, trip_id)?)
    }

    // ---- Simple rows --------------------------------------------------------------------

    pub fn save(&mut self, entity: Entity) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let trip_id = match entity {
            Entity::Trip(mut t) => {
                t.updated_at = now.clone();
                t.validate()?;
                table::upsert(&tx, &t)?;
                t.id
            }
            Entity::Traveler(t) => {
                t.validate()?;
                table::upsert(&tx, &t)?;
                t.trip_id
            }
            Entity::Station(s) => {
                s.validate()?;
                table::upsert(&tx, &s)?;
                s.trip_id
            }
            Entity::Slot(s) => {
                s.validate()?;
                if let Some(st) = &s.station_id {
                    same_trip(&s.trip_id, trip_of(&tx, "station", st)?, "station_id")?;
                }
                if let Some(old) = table::find::<Slot>(&tx, &s.id)?
                    && old.kind != s.kind
                    && has_options(&tx, &s.id)?
                {
                    return Err(CoreError::rule("slot_kind_locked", "the kind of a slot with options cannot change"));
                }
                table::upsert(&tx, &s)?;
                s.trip_id
            }
            Entity::Payment(p) => {
                p.validate()?;
                let trip = trip_of(&tx, "booking", &p.booking_id)?;
                if let Some(t) = &p.traveler_id {
                    same_trip(&trip, trip_of(&tx, "traveler", t)?, "traveler_id")?;
                }
                table::upsert(&tx, &p)?;
                trip
            }
            Entity::Expense(e) => {
                e.validate()?;
                if let Some(b) = &e.booking_id {
                    same_trip(&e.trip_id, trip_of(&tx, "booking", b)?, "booking_id")?;
                }
                if let Some(t) = &e.paid_by {
                    same_trip(&e.trip_id, trip_of(&tx, "traveler", t)?, "paid_by")?;
                }
                table::upsert(&tx, &e)?;
                e.trip_id
            }
            Entity::CostShare(c) => {
                c.validate()?;
                let trip = match (&c.booking_id, &c.expense_id) {
                    (Some(b), _) => trip_of(&tx, "booking", b)?,
                    (_, Some(e)) => trip_of(&tx, "expense", e)?,
                    _ => unreachable!("validated"),
                };
                same_trip(&trip, trip_of(&tx, "traveler", &c.traveler_id)?, "traveler_id")?;
                table::upsert(&tx, &c)?;
                trip
            }
            Entity::Task(t) => {
                t.validate()?;
                if let Some(o) = &t.option_id {
                    same_trip(&t.trip_id, trip_of(&tx, "option", o)?, "option_id")?;
                }
                table::upsert(&tx, &t)?;
                t.trip_id
            }
            Entity::Note(mut n) => {
                n.updated_at = now.clone();
                n.validate()?;
                if let Some(o) = &n.option_id {
                    same_trip(&n.trip_id, trip_of(&tx, "option", o)?, "option_id")?;
                }
                table::upsert(&tx, &n)?;
                n.trip_id
            }
            Entity::DismissedWarning(d) => {
                d.validate()?;
                table::upsert(&tx, &d)?;
                d.trip_id
            }
            Entity::OpenNight(n) => {
                n.validate()?;
                table::upsert(&tx, &n)?;
                n.trip_id
            }
            Entity::ExchangeRate(r) => {
                r.validate()?;
                table::upsert(&tx, &r)?;
                return Ok(tx.commit()?);
            }
            Entity::PriceObservation(o) => {
                // Observations are history: they are added, never edited.
                o.validate()?;
                if table::find::<PriceObservation>(&tx, &o.id)?.is_some() {
                    return Err(CoreError::rule("observation_immutable", "price observations cannot be changed"));
                }
                let trip = trip_of(&tx, "option", &o.option_id)?;
                table::insert(&tx, &o)?;
                trip
            }
        };
        touch(&tx, &trip_id, &now)?;
        Ok(tx.commit()?)
    }

    /// Deletes a row and returns an ID to undo it with (see [`Store::undo_delete`]). `keys` are
    /// the primary key values (two for composite keys).
    pub fn delete(&mut self, kind: EntityKind, keys: &[String]) -> CoreResult<String> {
        let key = keys.first().ok_or_else(|| CoreError::invalid("keys", "missing"))?.as_str();
        let second = || keys.get(1).map(String::as_str).ok_or_else(|| CoreError::invalid("keys", "missing"));
        let now = self.now();
        let tx = self.conn.transaction()?;
        let text = |v: &str| rusqlite::types::Value::Text(v.to_string());
        let (table, filter, params) = match kind {
            EntityKind::DismissedWarning => ("dismissed_warnings", "trip_id = ? AND key = ?", vec![text(key), text(second()?)]),
            EntityKind::OpenNight => ("open_nights", "trip_id = ? AND night = ?", vec![text(key), text(second()?)]),
            other => (table_of(other), "id = ?", vec![text(key)]),
        };
        let mut captured = trash::capture(&tx, table, filter, &params)?;
        let trip = match kind {
            EntityKind::Trip => {
                // Bookings protect their options from accidental deletion, so a trip removes them first.
                tx.execute(
                    "DELETE FROM bookings WHERE option_id IN
                       (SELECT o.id FROM options o JOIN slots s ON s.id = o.slot_id WHERE s.trip_id = ?1)",
                    [key],
                )?;
                if table::delete_by::<Trip>(&tx, "id = ?", &[&key])? == 0 {
                    return Err(CoreError::NotFound(format!("trip {key}")));
                }
                None
            }
            EntityKind::Option => {
                let trip = trip_of(&tx, "option", key)?;
                if count(&tx, "SELECT COUNT(*) FROM bookings WHERE option_id = ?1", key)? > 0 {
                    return Err(CoreError::rule("option_has_bookings", "booked options can be archived, not deleted"));
                }
                table::delete_by::<PlanOption>(&tx, "id = ?", &[&key])?;
                Some(trip)
            }
            EntityKind::Slot => {
                let trip = trip_of(&tx, "slot", key)?;
                let booked = count(
                    &tx,
                    "SELECT COUNT(*) FROM bookings b JOIN options o ON o.id = b.option_id WHERE o.slot_id = ?1",
                    key,
                )?;
                if booked > 0 {
                    return Err(CoreError::rule("slot_has_bookings", "a slot with bookings cannot be deleted"));
                }
                table::delete_by::<Slot>(&tx, "id = ?", &[&key])?;
                Some(trip)
            }
            EntityKind::Booking => {
                // Removes a booking entered by mistake. Cancellations keep the booking instead.
                let booking: Booking = table::get(&tx, key)?;
                let trip = trip_of(&tx, "booking", key)?;
                captured.keep_changed(&tx, "options", &booking.option_id)?;
                tx.execute("UPDATE flight_segments SET booking_id = NULL WHERE booking_id = ?1", [key])?;
                table::delete_by::<Booking>(&tx, "id = ?", &[&key])?;
                refresh_option_status(&tx, &trip, &booking.option_id, &now)?;
                Some(trip)
            }
            EntityKind::Document => Some(del::<Document>(&tx, "document", key)?),
            EntityKind::Traveler => Some(del::<Traveler>(&tx, "traveler", key)?),
            EntityKind::Station => Some(del::<Station>(&tx, "station", key)?),
            EntityKind::Payment => Some(del::<Payment>(&tx, "payment", key)?),
            EntityKind::Expense => Some(del::<Expense>(&tx, "expense", key)?),
            EntityKind::CostShare => Some(del::<CostShare>(&tx, "cost_share", key)?),
            EntityKind::Scenario => Some(del::<Scenario>(&tx, "scenario", key)?),
            EntityKind::Task => Some(del::<Task>(&tx, "task", key)?),
            EntityKind::Note => Some(del::<Note>(&tx, "note", key)?),
            EntityKind::PriceObservation => Some(del::<PriceObservation>(&tx, "observation", key)?),
            EntityKind::DismissedWarning => {
                table::delete_by::<DismissedWarning>(&tx, "trip_id = ? AND key = ?", &[&key, &second()?])?;
                Some(key.to_string())
            }
            EntityKind::OpenNight => {
                table::delete_by::<OpenNight>(&tx, "trip_id = ? AND night = ?", &[&key, &second()?])?;
                Some(key.to_string())
            }
            EntityKind::ExchangeRate => {
                table::delete_by::<ExchangeRate>(&tx, "id = ?", &[&key])?;
                None
            }
        };
        if let Some(t) = &trip {
            touch(&tx, t, &now)?;
        }
        tx.commit()?;
        captured.trip = trip;
        let id = self.trash.push(captured);
        self.remove_orphan_files()?;
        Ok(id)
    }

    // ---- Options ------------------------------------------------------------------------

    /// Saves an option with all its parts. A booked option only changes with `confirm_booked_edit`,
    /// and every change of a booked option's price or status is written to the change log.
    pub fn save_option(&mut self, bundle: OptionBundle, confirm_booked_edit: bool) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        save_option_tx(&tx, bundle, confirm_booked_edit, &now)?;
        Ok(tx.commit()?)
    }

    /// Copies an option with its details, fees and policy (not its bookings or price history).
    pub fn duplicate_option(&mut self, option_id: &str, title: &str) -> CoreResult<String> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let mut b = load_bundle(&tx, option_id)?;
        let new = new_id();
        b.option.id = new.clone();
        b.option.title = title.to_string();
        b.option.decision = Decision::None;
        b.option.created_at = now.clone();
        b.option.updated_at = now.clone();
        if matches!(b.option.status, OptionStatus::Booked | OptionStatus::Cancelled | OptionStatus::Completed) {
            b.option.status = OptionStatus::Planned;
        }
        for s in &mut b.segments {
            s.id = new_id();
            s.option_id = new.clone();
            s.booking_id = None;
        }
        if let Some(a) = &mut b.accommodation {
            a.option_id = new.clone();
        }
        if let Some(r) = &mut b.rental_car {
            r.option_id = new.clone();
        }
        if let Some(a) = &mut b.activity {
            a.option_id = new.clone();
        }
        for f in &mut b.fees {
            f.id = new_id();
            f.option_id = new.clone();
        }
        if let Some(p) = &mut b.policy {
            p.id = new_id();
            p.option_id = Some(new.clone());
        }
        save_option_tx(&tx, b, false, &now)?;
        tx.commit()?;
        Ok(new)
    }

    // ---- Bookings -----------------------------------------------------------------------

    /// Turns an option into a confirmed booking: snapshot of the plan, booked price and terms,
    /// covered segments, payments, and the option's status, all in one transaction.
    pub fn create_booking(&mut self, input: BookingInput) -> CoreResult<String> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let BookingInput { mut booking, policy, segment_ids, payments, new_option } = input;
        if let Some(bundle) = new_option {
            if bundle.option.id != booking.option_id {
                return Err(CoreError::invalid("option_id", "booking must refer to the new option"));
            }
            save_option_tx(&tx, bundle, false, &now)?;
        }
        let trip = trip_of(&tx, "option", &booking.option_id)?;
        let plan = load_bundle(&tx, &booking.option_id)?;
        booking.snapshot = serde_json::to_string(&plan)?;
        booking.status = BookingStatus::Active;
        booking.cancelled_at = None;
        booking.created_at = now.clone();
        booking.updated_at = now.clone();
        booking.validate()?;
        table::insert(&tx, &booking)?;

        if let Some(mut p) = policy {
            p.option_id = None;
            p.booking_id = Some(booking.id.clone());
            p.updated_at = now.clone();
            p.validate()?;
            table::insert(&tx, &p)?;
        }

        if !plan.segments.is_empty() {
            let free: Vec<&FlightSegment> = plan.segments.iter().filter(|s| s.booking_id.is_none()).collect();
            let chosen: Vec<&str> = if segment_ids.is_empty() {
                free.iter().map(|s| s.id.as_str()).collect()
            } else {
                for id in &segment_ids {
                    if !free.iter().any(|s| &s.id == id) {
                        return Err(CoreError::rule("segment_unavailable", format!("segment {id} is already booked")));
                    }
                }
                segment_ids.iter().map(String::as_str).collect()
            };
            if chosen.is_empty() {
                return Err(CoreError::rule("segment_unavailable", "all segments of this flight are already booked"));
            }
            for id in chosen {
                tx.execute("UPDATE flight_segments SET booking_id = ?1 WHERE id = ?2", (&booking.id, id))?;
            }
        }

        for mut p in payments {
            p.booking_id = booking.id.clone();
            p.created_at = now.clone();
            p.validate()?;
            table::insert(&tx, &p)?;
        }

        refresh_option_status(&tx, &trip, &booking.option_id, &now)?;
        log(&tx, &trip, "booking", &booking.id, "created", None, booking.price_minor.map(|p| format!("{p} {}", booking.currency)), &now)?;
        touch(&tx, &trip, &now)?;
        tx.commit()?;
        Ok(booking.id)
    }

    /// Updates booked details and terms. The snapshot and the lifecycle are not changed here.
    pub fn update_booking(&mut self, mut booking: Booking, policy: Option<CancellationPolicy>) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let old: Booking = table::get(&tx, &booking.id)?;
        let trip = trip_of(&tx, "booking", &booking.id)?;
        booking.option_id = old.option_id.clone();
        booking.snapshot = old.snapshot.clone();
        booking.status = old.status;
        booking.cancelled_at = old.cancelled_at.clone();
        booking.created_at = old.created_at.clone();
        booking.updated_at = now.clone();
        booking.validate()?;
        let money = |b: &Booking| b.price_minor.map(|p| format!("{p} {}", b.currency));
        log(&tx, &trip, "booking", &booking.id, "price", money(&old), money(&booking), &now)?;
        log(&tx, &trip, "booking", &booking.id, "payment_status", Some(enum_str(&old.payment_status)), Some(enum_str(&booking.payment_status)), &now)?;
        log(&tx, &trip, "booking", &booking.id, "reference", old.reference.clone(), booking.reference.clone(), &now)?;
        table::upsert(&tx, &booking)?;
        save_booking_policy(&tx, &trip, &booking.id, policy, &now)?;
        touch(&tx, &trip, &now)?;
        Ok(tx.commit()?)
    }

    /// Cancels a booking. The booking, its payments and the itinerary history stay.
    pub fn cancel_booking(&mut self, input: CancelInput) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let mut b: Booking = table::get(&tx, &input.booking_id)?;
        if b.status == BookingStatus::Cancelled {
            return Err(CoreError::rule("already_cancelled", "the booking is already cancelled"));
        }
        let trip = trip_of(&tx, "booking", &b.id)?;
        b.status = BookingStatus::Cancelled;
        b.cancellation_requested_at = input.requested_at.or(b.cancellation_requested_at);
        b.cancelled_at = Some(input.cancelled_at);
        b.refund_final_minor = input.refund_final_minor;
        if let Some(n) = input.notes.filter(|n| !n.trim().is_empty()) {
            b.notes = Some(match b.notes.take() {
                Some(old) if !old.is_empty() => format!("{old}\n\n{n}"),
                _ => n,
            });
        }
        b.updated_at = now.clone();
        b.validate()?;
        table::upsert(&tx, &b)?;
        log(&tx, &trip, "booking", &b.id, "status", Some("active".into()), Some("cancelled".into()), &now)?;
        refresh_option_status(&tx, &trip, &b.option_id, &now)?;
        touch(&tx, &trip, &now)?;
        Ok(tx.commit()?)
    }

    // ---- Scenarios ----------------------------------------------------------------------

    pub fn save_scenario(&mut self, mut scenario: Scenario, selections: Vec<ScenarioSelection>) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        scenario.updated_at = now.clone();
        scenario.validate()?;
        for s in &selections {
            s.validate()?;
            if s.scenario_id != scenario.id {
                return Err(CoreError::invalid("selections", "selection belongs to another scenario"));
            }
            same_trip(&scenario.trip_id, trip_of(&tx, "slot", &s.slot_id)?, "slot_id")?;
            if let Some(o) = &s.option_id {
                let slot: Option<String> =
                    tx.query_row("SELECT slot_id FROM options WHERE id = ?1", [o], |r| r.get(0)).optional()?;
                if slot.as_deref() != Some(s.slot_id.as_str()) {
                    return Err(CoreError::invalid("option_id", "option does not belong to the slot"));
                }
            }
        }
        if scenario.preferred {
            tx.execute("UPDATE scenarios SET preferred = 0 WHERE trip_id = ?1 AND id <> ?2", (&scenario.trip_id, &scenario.id))?;
        }
        table::upsert(&tx, &scenario)?;
        table::delete_by::<ScenarioSelection>(&tx, "scenario_id = ?", &[&scenario.id])?;
        for s in &selections {
            table::insert(&tx, s)?;
        }
        touch(&tx, &scenario.trip_id, &now)?;
        Ok(tx.commit()?)
    }

    pub fn set_preferred_scenario(&mut self, trip_id: &str, scenario_id: Option<&str>) -> CoreResult<()> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        tx.execute("UPDATE scenarios SET preferred = 0 WHERE trip_id = ?1", [trip_id])?;
        if let Some(id) = scenario_id {
            if tx.execute("UPDATE scenarios SET preferred = 1 WHERE id = ?1 AND trip_id = ?2", (id, trip_id))? == 0 {
                return Err(CoreError::NotFound(format!("scenario {id}")));
            }
        }
        touch(&tx, trip_id, &now)?;
        Ok(tx.commit()?)
    }

    // ---- Documents ----------------------------------------------------------------------

    pub fn attach_document(
        &mut self,
        trip_id: &str,
        source: &Path,
        option_id: Option<String>,
        booking_id: Option<String>,
    ) -> CoreResult<Document> {
        let now = self.now();
        table::get::<Trip>(&self.conn, trip_id)?;
        if let Some(o) = &option_id {
            same_trip(trip_id, trip_of(&self.conn, "option", o)?, "option_id")?;
        }
        if let Some(b) = &booking_id {
            same_trip(trip_id, trip_of(&self.conn, "booking", b)?, "booking_id")?;
        }
        let stored = documents::store_file(&self.data_dir, source)?;
        let doc = Document {
            id: new_id(),
            trip_id: trip_id.to_string(),
            option_id,
            booking_id,
            stored_name: stored.stored_name,
            filename: stored.filename,
            mime: stored.mime,
            size_bytes: stored.size_bytes,
            sha256: stored.sha256,
            notes: None,
            created_at: now.clone(),
        };
        doc.validate()?;
        let tx = self.conn.transaction()?;
        table::insert(&tx, &doc)?;
        touch(&tx, trip_id, &now)?;
        tx.commit()?;
        Ok(doc)
    }

    pub fn update_document_notes(&self, id: &str, notes: Option<String>) -> CoreResult<()> {
        if notes.as_ref().is_some_and(|n| n.len() > 20_000) {
            return Err(CoreError::invalid("notes", "too long"));
        }
        self.conn.execute("UPDATE documents SET notes = ?1 WHERE id = ?2", (notes, id))?;
        Ok(())
    }

    /// Path of a stored document, or `file_missing` if the file is gone.
    pub fn document_path(&self, id: &str) -> CoreResult<PathBuf> {
        let doc: Document = table::get(&self.conn, id)?;
        documents::existing_path(&self.data_dir, &doc.stored_name)
    }
}

// ---- Transaction helpers ----------------------------------------------------------------

fn save_option_tx(tx: &Transaction, mut bundle: OptionBundle, confirm_booked_edit: bool, now: &str) -> CoreResult<()> {
    let o = &mut bundle.option;
    o.updated_at = now.to_string();
    let slot: Slot = table::get(tx, &o.slot_id)?;
    let old = table::find::<PlanOption>(tx, &o.id)?;
    if let Some(old) = &old {
        o.created_at = old.created_at.clone();
        if old.slot_id != o.slot_id {
            let old_slot: Slot = table::get(tx, &old.slot_id)?;
            if old_slot.trip_id != slot.trip_id {
                return Err(CoreError::invalid("slot_id", "options cannot move to another trip"));
            }
        }
    }
    let active = count(tx, "SELECT COUNT(*) FROM bookings WHERE option_id = ?1 AND status = 'active'", &o.id)?;
    if active > 0 && !confirm_booked_edit {
        return Err(CoreError::rule("option_booked", "this option is booked; confirm to change the booked details"));
    }
    if active > 0 && !matches!(o.status, OptionStatus::Booked | OptionStatus::Completed | OptionStatus::Archived) {
        return Err(CoreError::rule("option_booked", "cancel the booking to change the status of a booked option"));
    }
    if active == 0 && o.status == OptionStatus::Booked {
        return Err(CoreError::rule("booking_required", "an option becomes booked by recording a booking"));
    }
    // Keep segment-to-booking links as stored; the form cannot reassign them.
    for s in &mut bundle.segments {
        s.booking_id = tx
            .query_row("SELECT booking_id FROM flight_segments WHERE id = ?1 AND option_id = ?2", (&s.id, &o.id), |r| r.get(0))
            .optional()?
            .flatten();
    }
    bundle.validate()?;
    let o = &bundle.option;
    let segments_fit = match slot.kind {
        SlotKind::Flight => bundle.segments.iter().all(|s| s.mode.is_none()),
        SlotKind::Transport => bundle.segments.iter().all(|s| s.mode.is_some()),
        _ => bundle.segments.is_empty(),
    };
    let expected = segments_fit
        && match slot.kind {
            SlotKind::Flight | SlotKind::Transport => {
                bundle.accommodation.is_none() && bundle.rental_car.is_none() && bundle.activity.is_none()
            }
            SlotKind::Accommodation => bundle.rental_car.is_none() && bundle.activity.is_none(),
            SlotKind::RentalCar => bundle.accommodation.is_none() && bundle.activity.is_none(),
            SlotKind::Activity | SlotKind::Parking | SlotKind::Insurance | SlotKind::Other => {
                bundle.accommodation.is_none() && bundle.rental_car.is_none()
            }
        };
    if !expected {
        return Err(CoreError::invalid("option", "details do not match the slot kind"));
    }

    let trip = slot.trip_id.clone();
    if let Some(old) = &old {
        let money = |p: &PlanOption| p.price_minor.map(|v| format!("{v} {}", p.currency));
        log(tx, &trip, "option", &o.id, "price", money(old), money(o), now)?;
        log(tx, &trip, "option", &o.id, "status", Some(enum_str(&old.status)), Some(enum_str(&o.status)), now)?;
    }
    table::upsert(tx, o)?;

    let keep: Vec<&str> = bundle.segments.iter().map(|s| s.id.as_str()).collect();
    for existing in table::select::<FlightSegment>(tx, "option_id = ?", &[&o.id])? {
        if !keep.contains(&existing.id.as_str()) {
            if existing.booking_id.is_some() {
                return Err(CoreError::rule("segment_booked", "a booked segment cannot be removed"));
            }
            table::delete_by::<FlightSegment>(tx, "id = ?", &[&existing.id])?;
        }
    }
    for s in &bundle.segments {
        table::upsert(tx, s)?;
    }
    replace_one(tx, &o.id, bundle.accommodation.as_ref())?;
    replace_one(tx, &o.id, bundle.rental_car.as_ref())?;
    replace_one(tx, &o.id, bundle.activity.as_ref())?;
    table::delete_by::<OptionFee>(tx, "option_id = ?", &[&o.id])?;
    for f in &bundle.fees {
        table::insert(tx, f)?;
    }
    match &bundle.policy {
        Some(p) => {
            let mut p = p.clone();
            p.updated_at = now.to_string();
            tx.execute("DELETE FROM cancellation_policies WHERE option_id = ?1 AND id <> ?2", (&o.id, &p.id))?;
            table::upsert(tx, &p)?;
        }
        None => {
            tx.execute("DELETE FROM cancellation_policies WHERE option_id = ?1", [&o.id])?;
        }
    }
    touch(tx, &trip, now)
}

fn replace_one<T: Row>(tx: &Transaction, option_id: &str, row: Option<&T>) -> CoreResult<()> {
    match row {
        Some(r) => table::upsert(tx, r),
        None => table::delete_by::<T>(tx, "option_id = ?", &[&option_id]).map(|_| ()),
    }
}

fn save_booking_policy(
    tx: &Transaction,
    trip: &str,
    booking_id: &str,
    policy: Option<CancellationPolicy>,
    now: &str,
) -> CoreResult<()> {
    let old: Option<CancellationPolicy> = table::select(tx, "booking_id = ?", &[&booking_id])?.into_iter().next();
    let describe = |p: &CancellationPolicy| {
        format!("{} until {}", enum_str(&p.policy_type), p.deadline_local.as_deref().unwrap_or("-"))
    };
    match policy {
        Some(mut p) => {
            p.option_id = None;
            p.booking_id = Some(booking_id.to_string());
            p.updated_at = now.to_string();
            if let Some(o) = &old {
                p.id = o.id.clone();
            }
            p.validate()?;
            log(tx, trip, "booking", booking_id, "cancellation_policy", old.as_ref().map(describe), Some(describe(&p)), now)?;
            table::upsert(tx, &p)
        }
        None => {
            if let Some(o) = &old {
                log(tx, trip, "booking", booking_id, "cancellation_policy", Some(describe(o)), None, now)?;
                table::delete_by::<CancellationPolicy>(tx, "id = ?", &[&o.id])?;
            }
            Ok(())
        }
    }
}

/// Booked while any booking is active; cancelled once all of its bookings are cancelled;
/// planned again when the last (mistaken) booking was deleted.
fn refresh_option_status(tx: &Transaction, trip: &str, option_id: &str, now: &str) -> CoreResult<()> {
    let option: PlanOption = table::get(tx, option_id)?;
    let active = count(tx, "SELECT COUNT(*) FROM bookings WHERE option_id = ?1 AND status = 'active'", option_id)?;
    let total = count(tx, "SELECT COUNT(*) FROM bookings WHERE option_id = ?1", option_id)?;
    let status = if active > 0 {
        if option.status == OptionStatus::Completed { OptionStatus::Completed } else { OptionStatus::Booked }
    } else if total > 0 {
        OptionStatus::Cancelled
    } else if matches!(option.status, OptionStatus::Booked | OptionStatus::Cancelled) {
        OptionStatus::Planned
    } else {
        option.status
    };
    if status != option.status {
        log(tx, trip, "option", option_id, "status", Some(enum_str(&option.status)), Some(enum_str(&status)), now)?;
        tx.execute("UPDATE options SET status = ?1, updated_at = ?2 WHERE id = ?3", (enum_str(&status), now, option_id))?;
    }
    Ok(())
}

pub(crate) fn load_bundle(conn: &Connection, option_id: &str) -> CoreResult<OptionBundle> {
    let key: [&dyn rusqlite::ToSql; 1] = [&option_id];
    Ok(OptionBundle {
        option: table::get(conn, option_id)?,
        segments: table::select(conn, "option_id = ? ORDER BY seq", &key)?,
        accommodation: table::select(conn, "option_id = ?", &key)?.into_iter().next(),
        rental_car: table::select(conn, "option_id = ?", &key)?.into_iter().next(),
        activity: table::select(conn, "option_id = ?", &key)?.into_iter().next(),
        fees: table::select(conn, "option_id = ? ORDER BY sort", &key)?,
        policy: table::select(conn, "option_id = ?", &key)?.into_iter().next(),
    })
}

pub(crate) fn load_graph(conn: &Connection, trip: Trip) -> CoreResult<TripGraph> {
    let id: [&dyn rusqlite::ToSql; 1] = [&trip.id];
    const OPTIONS: &str = "(SELECT o.id FROM options o JOIN slots s ON s.id = o.slot_id WHERE s.trip_id = ?)";
    const BOOKINGS: &str = "(SELECT b.id FROM bookings b JOIN options o ON o.id = b.option_id
                              JOIN slots s ON s.id = o.slot_id WHERE s.trip_id = ?)";
    let by_option = |extra: &str| format!("option_id IN {OPTIONS}{extra}");
    Ok(TripGraph {
        travelers: table::select(conn, "trip_id = ? ORDER BY sort, name", &id)?,
        stations: table::select(conn, "trip_id = ? ORDER BY sort", &id)?,
        slots: table::select(conn, "trip_id = ? ORDER BY sort, created_at", &id)?,
        options: table::select(conn, "slot_id IN (SELECT id FROM slots WHERE trip_id = ?) ORDER BY sort, created_at", &id)?,
        flight_segments: table::select(conn, &by_option(" ORDER BY option_id, seq"), &id)?,
        accommodation_details: table::select(conn, &by_option(""), &id)?,
        rental_car_details: table::select(conn, &by_option(""), &id)?,
        activity_details: table::select(conn, &by_option(""), &id)?,
        option_fees: table::select(conn, &by_option(" ORDER BY sort"), &id)?,
        cancellation_policies: table::select(
            conn,
            &format!("option_id IN {OPTIONS} OR booking_id IN {BOOKINGS}"),
            &[&trip.id, &trip.id],
        )?,
        bookings: table::select(conn, &format!("id IN {BOOKINGS} ORDER BY created_at"), &id)?,
        payments: table::select(conn, &format!("booking_id IN {BOOKINGS} ORDER BY paid_on"), &id)?,
        expenses: table::select(conn, "trip_id = ? ORDER BY spent_on, created_at", &id)?,
        cost_shares: table::select(
            conn,
            &format!("booking_id IN {BOOKINGS} OR expense_id IN (SELECT id FROM expenses WHERE trip_id = ?)"),
            &[&trip.id, &trip.id],
        )?,
        scenarios: table::select(conn, "trip_id = ? ORDER BY created_at", &id)?,
        scenario_selections: table::select(conn, "scenario_id IN (SELECT id FROM scenarios WHERE trip_id = ?)", &id)?,
        price_observations: table::select(conn, &by_option(" ORDER BY observed_at"), &id)?,
        tasks: table::select(conn, "trip_id = ? ORDER BY sort, created_at", &id)?,
        dismissed_warnings: table::select(conn, "trip_id = ?", &id)?,
        open_nights: table::select(conn, "trip_id = ? ORDER BY night", &id)?,
        documents: table::select(conn, "trip_id = ? ORDER BY created_at", &id)?,
        notes: table::select(conn, "trip_id = ? ORDER BY updated_at DESC", &id)?,
        change_log: table::select(conn, "trip_id = ? ORDER BY id", &id)?,
        trip,
    })
}

fn table_of(kind: EntityKind) -> &'static str {
    match kind {
        EntityKind::Trip => Trip::TABLE,
        EntityKind::Traveler => Traveler::TABLE,
        EntityKind::Station => Station::TABLE,
        EntityKind::Slot => Slot::TABLE,
        EntityKind::Option => PlanOption::TABLE,
        EntityKind::Booking => Booking::TABLE,
        EntityKind::Payment => Payment::TABLE,
        EntityKind::Expense => Expense::TABLE,
        EntityKind::CostShare => CostShare::TABLE,
        EntityKind::Scenario => Scenario::TABLE,
        EntityKind::Task => Task::TABLE,
        EntityKind::Note => Note::TABLE,
        EntityKind::Document => Document::TABLE,
        EntityKind::DismissedWarning => DismissedWarning::TABLE,
        EntityKind::OpenNight => OpenNight::TABLE,
        EntityKind::ExchangeRate => ExchangeRate::TABLE,
        EntityKind::PriceObservation => PriceObservation::TABLE,
    }
}

fn del<T: Row>(tx: &Transaction, what: &str, id: &str) -> CoreResult<String> {
    let trip = trip_of(tx, what, id)?;
    table::delete_by::<T>(tx, "id = ?", &[&id])?;
    Ok(trip)
}

/// The trip a row belongs to.
pub(crate) fn trip_of(conn: &Connection, what: &str, id: &str) -> CoreResult<String> {
    let sql = match what {
        "slot" => "SELECT trip_id FROM slots WHERE id = ?1",
        "station" => "SELECT trip_id FROM stations WHERE id = ?1",
        "traveler" => "SELECT trip_id FROM travelers WHERE id = ?1",
        "expense" => "SELECT trip_id FROM expenses WHERE id = ?1",
        "scenario" => "SELECT trip_id FROM scenarios WHERE id = ?1",
        "task" => "SELECT trip_id FROM tasks WHERE id = ?1",
        "note" => "SELECT trip_id FROM notes WHERE id = ?1",
        "document" => "SELECT trip_id FROM documents WHERE id = ?1",
        "option" => "SELECT s.trip_id FROM options o JOIN slots s ON s.id = o.slot_id WHERE o.id = ?1",
        "observation" => {
            "SELECT s.trip_id FROM price_observations p JOIN options o ON o.id = p.option_id
             JOIN slots s ON s.id = o.slot_id WHERE p.id = ?1"
        }
        "booking" => {
            "SELECT s.trip_id FROM bookings b JOIN options o ON o.id = b.option_id
             JOIN slots s ON s.id = o.slot_id WHERE b.id = ?1"
        }
        "payment" => {
            "SELECT s.trip_id FROM payments p JOIN bookings b ON b.id = p.booking_id
             JOIN options o ON o.id = b.option_id JOIN slots s ON s.id = o.slot_id WHERE p.id = ?1"
        }
        "cost_share" => {
            "SELECT COALESCE(
               (SELECT s.trip_id FROM bookings b JOIN options o ON o.id = b.option_id
                  JOIN slots s ON s.id = o.slot_id WHERE b.id = c.booking_id),
               (SELECT e.trip_id FROM expenses e WHERE e.id = c.expense_id))
             FROM cost_shares c WHERE c.id = ?1"
        }
        _ => unreachable!("unknown row kind {what}"),
    };
    conn.query_row(sql, [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| CoreError::NotFound(format!("{what} {id}")))
}

fn same_trip(expected: &str, actual: String, field: &str) -> CoreResult<()> {
    if expected == actual { Ok(()) } else { Err(CoreError::invalid(field, "belongs to another trip")) }
}

fn has_options(conn: &Connection, slot_id: &str) -> CoreResult<bool> {
    Ok(count(conn, "SELECT COUNT(*) FROM options WHERE slot_id = ?1", slot_id)? > 0)
}

fn count(conn: &Connection, sql: &str, id: &str) -> CoreResult<i64> {
    Ok(conn.query_row(sql, [id], |r| r.get(0))?)
}

fn touch(conn: &Connection, trip_id: &str, now: &str) -> CoreResult<()> {
    conn.execute("UPDATE trips SET updated_at = ?1 WHERE id = ?2", (now, trip_id))?;
    Ok(())
}

pub(crate) fn enum_str<T: Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(serde_json::Value::String(s)) => s,
        _ => String::new(),
    }
}

#[allow(clippy::too_many_arguments)]
fn log(
    conn: &Connection,
    trip: &str,
    entity: &str,
    entity_id: &str,
    field: &str,
    old: Option<String>,
    new: Option<String>,
    now: &str,
) -> CoreResult<()> {
    if old != new {
        conn.execute(
            "INSERT INTO change_log (trip_id, entity, entity_id, field, old_value, new_value, at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (trip, entity, entity_id, field, old, new, now),
        )?;
    }
    Ok(())
}
