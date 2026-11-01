//! Trip export/import (JSON) and full backups (zip with the database and the documents).
//! Imports and restores are validated completely before anything in the database changes.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::db;
use crate::documents;
use crate::error::{CoreError, CoreResult};
use crate::model::*;
use crate::store::{Store, new_id};
use crate::table::{self, Row};
use crate::validate::Validate;

const TRIP_FORMAT: &str = "travel-planner/trip";
const TRIP_FORMAT_VERSION: u32 = 1;
const BACKUP_FORMAT: &str = "travel-planner/backup";
const DB_ENTRY: &str = "travel-planner.sqlite";
const MAX_IMPORT_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize)]
struct TripExport {
    format: String,
    version: u32,
    schema_version: i64,
    exported_at: String,
    trip: TripGraph,
    exchange_rates: Vec<ExchangeRate>,
}

#[derive(Debug, Clone, Copy, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ImportMode {
    /// New IDs for everything; the existing trip (if any) stays untouched.
    AsNew,
    /// Replaces the trip with the same ID.
    Replace,
}

/// What a copy of a trip takes along. Bookings, payments, actual expenses, price history,
/// documents and the change history always stay with the original.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CopyTripInput {
    pub trip_id: String,
    pub title: String,
    /// Every date and time of the copy is moved by this many days (0 keeps them).
    pub shift_days: i32,
    /// Alternatives with their details, fees, terms and the saved scenarios; else only the needs.
    pub include_options: bool,
    pub include_travelers: bool,
    /// Tasks (reopened), notes and the packing list (unpacked).
    pub include_tasks_and_notes: bool,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ImportPreview {
    pub title: String,
    pub exported_at: String,
    pub existing_title: Option<String>,
    pub counts: Vec<(String, usize)>,
    pub missing_documents: usize,
    pub new_exchange_rates: usize,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BackupManifest {
    pub format: String,
    pub schema_version: i64,
    pub created_at: String,
    pub trips: i64,
    pub documents: i64,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RestorePreview {
    pub manifest: BackupManifest,
    pub trip_titles: Vec<String>,
    pub missing_documents: usize,
}

impl Store {
    pub fn export_trip(&self, trip_id: &str, target: &Path) -> CoreResult<()> {
        let export = TripExport {
            format: TRIP_FORMAT.into(),
            version: TRIP_FORMAT_VERSION,
            schema_version: db::schema_version(&self.conn)?,
            exported_at: self.now(),
            trip: self.trip_graph(trip_id)?,
            exchange_rates: table::select(&self.conn, "1", &[])?,
        };
        write_atomic(target, serde_json::to_string_pretty(&export)?.as_bytes())
    }

    pub fn preview_import(&self, source: &Path) -> CoreResult<ImportPreview> {
        let export = read_trip_export(source)?;
        let g = &export.trip;
        let existing: Option<Trip> = table::find(&self.conn, &g.trip.id)?;
        let known: HashSet<String> = self.conn.prepare("SELECT stored_name FROM documents")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let missing = g
            .documents
            .iter()
            .filter(|d| !known.contains(&d.stored_name) && documents::existing_path(&self.data_dir, &d.stored_name).is_err())
            .count();
        let rates: Vec<ExchangeRate> = table::select(&self.conn, "1", &[])?;
        Ok(ImportPreview {
            title: g.trip.title.clone(),
            exported_at: export.exported_at.clone(),
            existing_title: existing.map(|t| t.title),
            counts: vec![
                ("slots".into(), g.slots.len()),
                ("options".into(), g.options.len()),
                ("bookings".into(), g.bookings.len()),
                ("payments".into(), g.payments.len()),
                ("expenses".into(), g.expenses.len()),
                ("scenarios".into(), g.scenarios.len()),
                ("documents".into(), g.documents.len()),
                ("notes".into(), g.notes.len()),
                ("packing_items".into(), g.packing_items.len()),
            ],
            missing_documents: missing,
            new_exchange_rates: export.exchange_rates.iter().filter(|r| !rates.iter().any(|x| x.id == r.id)).count(),
        })
    }

    /// Imports a validated trip export and returns the ID of the imported trip.
    pub fn import_trip(&mut self, source: &Path, mode: ImportMode) -> CoreResult<String> {
        let export = read_trip_export(source)?;
        let mut graph = export.trip;
        if matches!(mode, ImportMode::AsNew) {
            graph = remap_ids(graph)?;
        }
        let tx = self.conn.transaction()?;
        if matches!(mode, ImportMode::Replace) {
            tx.execute(
                "DELETE FROM bookings WHERE option_id IN
                   (SELECT o.id FROM options o JOIN slots s ON s.id = o.slot_id WHERE s.trip_id = ?1)",
                [&graph.trip.id],
            )?;
            tx.execute("DELETE FROM trips WHERE id = ?1", [&graph.trip.id])?;
        }
        insert_graph(&tx, &graph)?;
        for r in &export.exchange_rates {
            if table::find::<ExchangeRate>(&tx, &r.id)?.is_none() {
                table::insert(&tx, r)?;
            }
        }
        tx.commit()?;
        self.remove_orphan_files()?;
        Ok(graph.trip.id)
    }

    /// Creates a new trip from an existing one, e.g. to plan the same holiday again next year.
    /// Returns the new trip's ID.
    pub fn copy_trip(&mut self, input: CopyTripInput) -> CoreResult<String> {
        let now = self.now();
        let g = self.trip_graph(&input.trip_id)?;
        let graph = remap_ids(copy_graph(g, &input, &now)?)?;
        validate_graph(&graph)?;
        let tx = self.conn.transaction()?;
        insert_graph(&tx, &graph)?;
        tx.commit()?;
        Ok(graph.trip.id)
    }

    /// Writes a consistent copy of the database plus all documents into a zip file.
    pub fn create_backup(&self, target: &Path) -> CoreResult<BackupManifest> {
        let tmp = tempdir_in(&self.data_dir)?;
        let db_copy = tmp.join(DB_ENTRY);
        self.conn.execute("VACUUM INTO ?1", [db_copy.to_string_lossy()])?;
        let docs: Vec<String> = self
            .conn
            .prepare("SELECT DISTINCT stored_name FROM documents")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        let manifest = BackupManifest {
            format: BACKUP_FORMAT.into(),
            schema_version: db::schema_version(&self.conn)?,
            created_at: self.now(),
            trips: self.conn.query_row("SELECT COUNT(*) FROM trips", [], |r| r.get(0))?,
            documents: docs.len() as i64,
        };

        let part = target.with_extension("part");
        let result = (|| -> CoreResult<()> {
            let mut zip = zip::ZipWriter::new(fs::File::create(&part)?);
            let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("manifest.json", opts)?;
            zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;
            zip.start_file(DB_ENTRY, opts)?;
            std::io::copy(&mut fs::File::open(&db_copy)?, &mut zip)?;
            for name in &docs {
                if let Ok(path) = documents::existing_path(&self.data_dir, name) {
                    zip.start_file(format!("documents/{name}"), opts)?;
                    std::io::copy(&mut fs::File::open(path)?, &mut zip)?;
                }
            }
            zip.finish()?;
            Ok(())
        })();
        let _ = fs::remove_dir_all(&tmp);
        if let Err(e) = result {
            let _ = fs::remove_file(&part);
            return Err(e);
        }
        fs::rename(&part, target)?;
        Ok(manifest)
    }

    pub fn preview_restore(&self, source: &Path) -> CoreResult<RestorePreview> {
        let tmp = tempdir_in(&self.data_dir)?;
        let result = (|| {
            let (manifest, conn, docs) = unpack_backup(source, &tmp)?;
            let trip_titles = conn
                .prepare("SELECT title FROM trips ORDER BY created_at")?
                .query_map([], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            let referenced: HashSet<String> = conn
                .prepare("SELECT stored_name FROM documents")?
                .query_map([], |r| r.get(0))?
                .collect::<Result<_, _>>()?;
            Ok(RestorePreview { manifest, trip_titles, missing_documents: referenced.difference(&docs).count() })
        })();
        let _ = fs::remove_dir_all(&tmp);
        result
    }

    /// Replaces all data with the backup. A safety backup of the current state is written to
    /// `<data>/backups/` first and its path returned.
    pub fn restore_backup(&mut self, source: &Path) -> CoreResult<String> {
        let tmp = tempdir_in(&self.data_dir)?;
        let result = (|| {
            let (_, backup_conn, _) = unpack_backup(source, &tmp)?;
            let safety_dir = self.data_dir.join("backups");
            fs::create_dir_all(&safety_dir)?;
            let stamp = self.now().replace([':', '-'], "");
            let safety = safety_dir.join(format!("before-restore-{stamp}.zip"));
            self.create_backup(&safety)?;

            {
                let backup = rusqlite::backup::Backup::new(&backup_conn, &mut self.conn)?;
                backup.run_to_completion(256, std::time::Duration::from_millis(0), None)?;
            }
            drop(backup_conn);
            db::migrate_existing(&mut self.conn)?;
            // Deletions from before the restore refer to data that is gone.
            self.trash = Default::default();

            let docs_dir = documents::dir(&self.data_dir);
            for entry in fs::read_dir(tmp.join("documents"))?.flatten() {
                let target = docs_dir.join(entry.file_name());
                if !target.exists() {
                    fs::rename(entry.path(), target)?;
                }
            }
            self.remove_orphan_files()?;
            Ok(safety.display().to_string())
        })();
        let _ = fs::remove_dir_all(&tmp);
        result
    }
}

fn read_trip_export(source: &Path) -> CoreResult<TripExport> {
    if fs::metadata(source)?.len() > MAX_IMPORT_BYTES {
        return Err(CoreError::rule("import_too_large", "the file is too large for a trip export"));
    }
    let text = fs::read_to_string(source)?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| CoreError::rule("import_not_json", e.to_string()))?;
    if value.get("format").and_then(|f| f.as_str()) != Some(TRIP_FORMAT) {
        return Err(CoreError::rule("import_wrong_format", "this is not a Travel Planner trip export"));
    }
    if value.get("version").and_then(|v| v.as_u64()) != Some(TRIP_FORMAT_VERSION as u64) {
        return Err(CoreError::rule("import_unsupported_version", "the export was made by an incompatible version"));
    }
    let export: TripExport =
        serde_json::from_value(value).map_err(|e| CoreError::rule("import_invalid", e.to_string()))?;
    validate_graph(&export.trip)?;
    for r in &export.exchange_rates {
        r.validate()?;
    }
    Ok(export)
}

/// Every row is valid and every reference points to a row of the same export.
fn validate_graph(g: &TripGraph) -> CoreResult<()> {
    let t = &g.trip;
    t.validate()?;
    let ids = |rows: Vec<&str>| rows.into_iter().map(str::to_string).collect::<HashSet<_>>();
    let travelers = ids(g.travelers.iter().map(|r| r.id.as_str()).collect());
    let stations = ids(g.stations.iter().map(|r| r.id.as_str()).collect());
    let slots = ids(g.slots.iter().map(|r| r.id.as_str()).collect());
    let options = ids(g.options.iter().map(|r| r.id.as_str()).collect());
    let bookings = ids(g.bookings.iter().map(|r| r.id.as_str()).collect());
    let expenses = ids(g.expenses.iter().map(|r| r.id.as_str()).collect());
    let scenarios = ids(g.scenarios.iter().map(|r| r.id.as_str()).collect());

    let bad = |what: &str| CoreError::rule("import_broken_reference", format!("{what} refers to a missing row"));
    let check = |set: &HashSet<String>, v: &str, what: &str| if set.contains(v) { Ok(()) } else { Err(bad(what)) };
    let check_opt = |set: &HashSet<String>, v: &Option<String>, what: &str| match v {
        Some(v) => check(set, v, what),
        None => Ok(()),
    };
    let own_trip = |v: &str, what: &str| if v == t.id { Ok(()) } else { Err(bad(what)) };

    for r in &g.travelers {
        r.validate()?;
        own_trip(&r.trip_id, "traveler")?;
    }
    for r in &g.traveler_documents {
        r.validate()?;
        check(&travelers, &r.traveler_id, "travel document")?;
    }
    for r in &g.stations {
        r.validate()?;
        own_trip(&r.trip_id, "station")?;
    }
    for r in &g.slots {
        r.validate()?;
        own_trip(&r.trip_id, "slot")?;
        check_opt(&stations, &r.station_id, "slot")?;
    }
    for r in &g.options {
        r.validate()?;
        check(&slots, &r.slot_id, "option")?;
    }
    for r in &g.flight_segments {
        r.validate()?;
        check(&options, &r.option_id, "flight segment")?;
        check_opt(&bookings, &r.booking_id, "flight segment")?;
    }
    for r in &g.accommodation_details {
        r.validate()?;
        check(&options, &r.option_id, "accommodation")?;
    }
    for r in &g.rental_car_details {
        r.validate()?;
        check(&options, &r.option_id, "rental car")?;
    }
    for r in &g.activity_details {
        r.validate()?;
        check(&options, &r.option_id, "activity")?;
    }
    for r in &g.option_fees {
        r.validate()?;
        check(&options, &r.option_id, "fee")?;
    }
    for r in &g.cancellation_policies {
        r.validate()?;
        check_opt(&options, &r.option_id, "cancellation policy")?;
        check_opt(&bookings, &r.booking_id, "cancellation policy")?;
    }
    for r in &g.bookings {
        r.validate()?;
        check(&options, &r.option_id, "booking")?;
        serde_json::from_str::<serde_json::Value>(&r.snapshot)?;
    }
    for r in &g.payments {
        r.validate()?;
        check(&bookings, &r.booking_id, "payment")?;
        check_opt(&travelers, &r.traveler_id, "payment")?;
    }
    for r in &g.expenses {
        r.validate()?;
        own_trip(&r.trip_id, "expense")?;
        check_opt(&bookings, &r.booking_id, "expense")?;
        check_opt(&travelers, &r.paid_by, "expense")?;
    }
    for r in &g.cost_shares {
        r.validate()?;
        check_opt(&bookings, &r.booking_id, "cost share")?;
        check_opt(&expenses, &r.expense_id, "cost share")?;
        check(&travelers, &r.traveler_id, "cost share")?;
    }
    if g.scenarios.iter().filter(|s| s.preferred).count() > 1 {
        return Err(CoreError::rule("import_invalid", "more than one preferred scenario"));
    }
    for r in &g.scenarios {
        r.validate()?;
        own_trip(&r.trip_id, "scenario")?;
    }
    for r in &g.scenario_selections {
        r.validate()?;
        check(&scenarios, &r.scenario_id, "scenario selection")?;
        check(&slots, &r.slot_id, "scenario selection")?;
        check_opt(&options, &r.option_id, "scenario selection")?;
    }
    for r in &g.price_observations {
        r.validate()?;
        check(&options, &r.option_id, "price observation")?;
    }
    for r in &g.tasks {
        r.validate()?;
        own_trip(&r.trip_id, "task")?;
        check_opt(&options, &r.option_id, "task")?;
    }
    for r in &g.packing_items {
        r.validate()?;
        own_trip(&r.trip_id, "packing item")?;
        check_opt(&travelers, &r.traveler_id, "packing item")?;
    }
    for r in &g.dismissed_warnings {
        r.validate()?;
        own_trip(&r.trip_id, "dismissed warning")?;
    }
    for r in &g.open_nights {
        r.validate()?;
        own_trip(&r.trip_id, "open night")?;
    }
    for r in &g.documents {
        r.validate()?;
        own_trip(&r.trip_id, "document")?;
        check_opt(&options, &r.option_id, "document")?;
        check_opt(&bookings, &r.booking_id, "document")?;
    }
    for r in &g.notes {
        r.validate()?;
        own_trip(&r.trip_id, "note")?;
        check_opt(&options, &r.option_id, "note")?;
    }
    for r in &g.change_log {
        own_trip(&r.trip_id, "change log")?;
    }
    Ok(())
}

fn copy_graph(g: TripGraph, input: &CopyTripInput, now: &str) -> CoreResult<TripGraph> {
    let days = chrono::Duration::days(input.shift_days.into());
    let shift_date = |v: &mut Option<String>| {
        if let Some(d) = v.as_deref().and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()) {
            *v = Some((d + days).format("%Y-%m-%d").to_string());
        }
    };
    let shift_local = |v: &mut Option<String>| {
        if let Some(d) = v.as_deref().and_then(|d| chrono::NaiveDateTime::parse_from_str(d, "%Y-%m-%dT%H:%M").ok()) {
            *v = Some((d + days).format("%Y-%m-%dT%H:%M").to_string());
        }
    };
    let title = input.title.trim();
    if title.is_empty() {
        return Err(CoreError::invalid("title", "required"));
    }

    let mut t = g.trip;
    t.title = title.to_string();
    t.status_override = None;
    t.created_at = now.to_string();
    t.updated_at = now.to_string();
    for d in [&mut t.earliest_departure, &mut t.latest_return, &mut t.preferred_start, &mut t.preferred_end] {
        shift_date(d);
    }
    if let Some(m) = t.preferred_month.as_deref().and_then(|m| chrono::NaiveDate::parse_from_str(&format!("{m}-01"), "%Y-%m-%d").ok()) {
        t.preferred_month = Some((m + days).format("%Y-%m").to_string());
    }

    let mut out = TripGraph {
        trip: t,
        travelers: if input.include_travelers { g.travelers } else { vec![] },
        traveler_documents: if input.include_travelers { g.traveler_documents } else { vec![] },
        stations: g.stations,
        slots: g.slots,
        options: vec![],
        flight_segments: vec![],
        accommodation_details: vec![],
        rental_car_details: vec![],
        activity_details: vec![],
        option_fees: vec![],
        cancellation_policies: vec![],
        bookings: vec![],
        payments: vec![],
        expenses: vec![],
        cost_shares: vec![],
        scenarios: vec![],
        scenario_selections: vec![],
        price_observations: vec![],
        tasks: vec![],
        packing_items: vec![],
        dismissed_warnings: vec![],
        open_nights: vec![],
        documents: vec![],
        notes: vec![],
        change_log: vec![],
    };
    for s in &mut out.stations {
        shift_date(&mut s.arrive_date);
        shift_date(&mut s.depart_date);
    }
    for s in &mut out.slots {
        s.created_at = now.to_string();
    }

    if input.include_options {
        // Alternatives start over as plans; archived and rejected ones are left behind.
        let keep: HashSet<String> = g
            .options
            .iter()
            .filter(|o| o.status != OptionStatus::Archived && o.decision != Decision::Rejected)
            .map(|o| o.id.clone())
            .collect();
        for mut o in g.options.into_iter().filter(|o| keep.contains(&o.id)) {
            if matches!(o.status, OptionStatus::Booked | OptionStatus::Cancelled | OptionStatus::Completed) {
                o.status = OptionStatus::Planned;
            }
            o.price_verified_at = None;
            o.created_at = now.to_string();
            o.updated_at = now.to_string();
            out.options.push(o);
        }
        let kept = |id: &str| keep.contains(id);
        for mut s in g.flight_segments.into_iter().filter(|s| kept(&s.option_id)) {
            s.booking_id = None;
            shift_local(&mut s.depart_local);
            shift_local(&mut s.arrive_local);
            out.flight_segments.push(s);
        }
        for mut a in g.accommodation_details.into_iter().filter(|a| kept(&a.option_id)) {
            shift_date(&mut a.check_in);
            shift_date(&mut a.check_out);
            out.accommodation_details.push(a);
        }
        for mut r in g.rental_car_details.into_iter().filter(|r| kept(&r.option_id)) {
            shift_local(&mut r.pickup_local);
            shift_local(&mut r.return_local);
            out.rental_car_details.push(r);
        }
        for mut a in g.activity_details.into_iter().filter(|a| kept(&a.option_id)) {
            shift_date(&mut a.start_date);
            shift_date(&mut a.end_date);
            out.activity_details.push(a);
        }
        out.option_fees = g.option_fees.into_iter().filter(|f| kept(&f.option_id)).collect();
        for mut p in g.cancellation_policies.into_iter().filter(|p| p.option_id.as_deref().is_some_and(kept)) {
            shift_local(&mut p.deadline_local);
            p.checked_at = None;
            p.updated_at = now.to_string();
            out.cancellation_policies.push(p);
        }
        for mut s in g.scenarios {
            s.created_at = now.to_string();
            s.updated_at = now.to_string();
            out.scenarios.push(s);
        }
        out.scenario_selections = g
            .scenario_selections
            .into_iter()
            .map(|mut s| {
                if s.option_id.as_deref().is_some_and(|o| !kept(o)) {
                    s.option_id = None;
                }
                s
            })
            .collect();
        // Dismissed warnings are left behind: their keys name rows of the original.
        for mut n in g.open_nights {
            let mut night = Some(n.night);
            shift_date(&mut night);
            n.night = night.unwrap_or_default();
            out.open_nights.push(n);
        }
    }
    let options: HashSet<String> = out.options.iter().map(|o| o.id.clone()).collect();
    let option_ref = |v: &mut Option<String>| {
        if v.as_deref().is_some_and(|o| !options.contains(o)) {
            *v = None;
        }
    };

    if input.include_tasks_and_notes {
        for mut t in g.tasks {
            t.done_at = None;
            shift_date(&mut t.due_date);
            option_ref(&mut t.option_id);
            t.created_at = now.to_string();
            out.tasks.push(t);
        }
        let travelers: HashSet<String> = out.travelers.iter().map(|t| t.id.clone()).collect();
        for mut p in g.packing_items {
            p.packed = false;
            if p.traveler_id.as_deref().is_some_and(|t| !travelers.contains(t)) {
                p.traveler_id = None;
            }
            out.packing_items.push(p);
        }
        for mut n in g.notes {
            option_ref(&mut n.option_id);
            n.created_at = now.to_string();
            n.updated_at = now.to_string();
            out.notes.push(n);
        }
    }

    // Planned expenses are part of the plan; actual ones and refunds belong to the original trip.
    let travelers: HashSet<String> = out.travelers.iter().map(|t| t.id.clone()).collect();
    for mut e in g.expenses.into_iter().filter(|e| e.kind == ExpenseKind::Planned && e.booking_id.is_none()) {
        shift_date(&mut e.spent_on);
        if e.paid_by.as_deref().is_some_and(|p| !travelers.contains(p)) {
            e.paid_by = None;
        }
        e.created_at = now.to_string();
        out.expenses.push(e);
    }
    let expenses: HashSet<String> = out.expenses.iter().map(|e| e.id.clone()).collect();
    out.cost_shares = g
        .cost_shares
        .into_iter()
        .filter(|c| c.expense_id.as_deref().is_some_and(|e| expenses.contains(e)) && travelers.contains(&c.traveler_id))
        .collect();
    Ok(out)
}

/// Gives every row of the graph a fresh ID and rewrites all references to it. Booking
/// snapshots keep their original content: they record the plan as it was.
fn remap_ids(graph: TripGraph) -> CoreResult<TripGraph> {
    let mut value = serde_json::to_value(&graph)?;
    let mut map: HashMap<String, String> = HashMap::new();
    collect_ids(&value, &mut map);
    rewrite_refs(&mut value, &map);
    Ok(serde_json::from_value(value)?)
}

fn collect_ids(v: &serde_json::Value, map: &mut HashMap<String, String>) {
    match v {
        serde_json::Value::Object(o) => {
            if let Some(serde_json::Value::String(id)) = o.get("id") {
                map.entry(id.clone()).or_insert_with(new_id);
            }
            o.values().for_each(|c| collect_ids(c, map));
        }
        serde_json::Value::Array(a) => a.iter().for_each(|c| collect_ids(c, map)),
        _ => {}
    }
}

fn rewrite_refs(v: &mut serde_json::Value, map: &HashMap<String, String>) {
    match v {
        serde_json::Value::Object(o) => {
            for (k, child) in o.iter_mut() {
                let is_ref = k == "id" || k.ends_with("_id") || k == "paid_by";
                match child {
                    serde_json::Value::String(s) if is_ref => {
                        if let Some(new) = map.get(s.as_str()) {
                            *s = new.clone();
                        }
                    }
                    _ => rewrite_refs(child, map),
                }
            }
        }
        serde_json::Value::Array(a) => a.iter_mut().for_each(|c| rewrite_refs(c, map)),
        _ => {}
    }
}

fn insert_graph(conn: &Connection, g: &TripGraph) -> CoreResult<()> {
    fn all<T: Row>(conn: &Connection, rows: &[T]) -> CoreResult<()> {
        rows.iter().try_for_each(|r| table::insert(conn, r))
    }
    table::insert(conn, &g.trip)?;
    all(conn, &g.travelers)?;
    all(conn, &g.traveler_documents)?;
    all(conn, &g.stations)?;
    all(conn, &g.slots)?;
    all(conn, &g.options)?;
    all(conn, &g.bookings)?;
    all(conn, &g.flight_segments)?;
    all(conn, &g.accommodation_details)?;
    all(conn, &g.rental_car_details)?;
    all(conn, &g.activity_details)?;
    all(conn, &g.option_fees)?;
    all(conn, &g.cancellation_policies)?;
    all(conn, &g.payments)?;
    all(conn, &g.expenses)?;
    all(conn, &g.cost_shares)?;
    all(conn, &g.scenarios)?;
    all(conn, &g.scenario_selections)?;
    all(conn, &g.price_observations)?;
    all(conn, &g.tasks)?;
    all(conn, &g.packing_items)?;
    all(conn, &g.dismissed_warnings)?;
    all(conn, &g.open_nights)?;
    all(conn, &g.documents)?;
    all(conn, &g.notes)?;
    for c in &g.change_log {
        conn.execute(
            "INSERT INTO change_log (trip_id, entity, entity_id, field, old_value, new_value, at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (&c.trip_id, &c.entity, &c.entity_id, &c.field, &c.old_value, &c.new_value, &c.at),
        )?;
    }
    Ok(())
}

/// Extracts and checks a backup: manifest, database integrity and schema version, and document
/// entries (only plain stored names inside `documents/` are accepted).
fn unpack_backup(source: &Path, tmp: &Path) -> CoreResult<(BackupManifest, Connection, HashSet<String>)> {
    let bad = |m: &str| CoreError::rule("backup_invalid", m.to_string());
    let mut zip = zip::ZipArchive::new(fs::File::open(source)?).map_err(|_| bad("not a zip file"))?;
    let manifest: BackupManifest = {
        let f = zip.by_name("manifest.json").map_err(|_| bad("manifest missing"))?;
        let mut s = String::new();
        f.take(1024 * 1024).read_to_string(&mut s)?;
        serde_json::from_str(&s).map_err(|_| bad("manifest unreadable"))?
    };
    if manifest.format != BACKUP_FORMAT {
        return Err(bad("not a Travel Planner backup"));
    }
    if manifest.schema_version > db::SCHEMA_VERSION {
        return Err(CoreError::rule("backup_newer", "the backup was made by a newer version of the app"));
    }
    let docs_dir = tmp.join("documents");
    fs::create_dir_all(&docs_dir)?;
    let mut docs = HashSet::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let Some(name) = entry.enclosed_name() else { return Err(bad("unsafe path in backup")) };
        let name = name.to_string_lossy().replace('\\', "/");
        if name == "manifest.json" || entry.is_dir() {
            continue;
        }
        let target = if name == DB_ENTRY {
            tmp.join(DB_ENTRY)
        } else if let Some(doc) = name.strip_prefix("documents/") {
            documents::check_stored_name(doc).map_err(|_| bad("unexpected file in backup"))?;
            docs.insert(doc.to_string());
            docs_dir.join(doc)
        } else {
            return Err(bad("unexpected file in backup"));
        };
        std::io::copy(&mut entry, &mut fs::File::create(target)?)?;
    }
    let db_path = tmp.join(DB_ENTRY);
    if !db_path.is_file() {
        return Err(bad("database missing"));
    }
    let conn = Connection::open_with_flags(&db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let check: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(|_| bad("database unreadable"))?;
    if check != "ok" {
        return Err(bad("database is damaged"));
    }
    let version = db::schema_version(&conn)?;
    if version != manifest.schema_version {
        return Err(bad("manifest does not match the database"));
    }
    let fk: i64 = conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0))?;
    if fk > 0 {
        return Err(bad("database has broken references"));
    }
    Ok((manifest, conn, docs))
}

fn tempdir_in(data_dir: &Path) -> CoreResult<std::path::PathBuf> {
    let dir = data_dir.join("tmp").join(new_id());
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn write_atomic(target: &Path, bytes: &[u8]) -> CoreResult<()> {
    let part = target.with_extension("part");
    fs::write(&part, bytes)?;
    fs::rename(&part, target)?;
    Ok(())
}

/// Writes a text export (HTML, ICS, CSV) produced by the UI. Only known extensions are allowed.
pub fn write_text_export(target: &Path, contents: &str) -> CoreResult<()> {
    let ext = target.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["html", "ics", "csv", "md", "txt", "json"].contains(&ext.as_str()) {
        return Err(CoreError::invalid("path", "unsupported export file type"));
    }
    write_atomic(target, contents.as_bytes())
}

