//! Business-rule tests for the persistence layer.

use crate::error::CoreError;
use crate::model::*;
use crate::store::{BookingInput, CancelInput, Entity, EntityKind, Store, new_id};
use crate::transfer::ImportMode;

const NOW: &str = "2026-10-31T12:00:00Z";

fn store() -> (Store, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    (Store::for_tests(dir.path(), NOW).unwrap(), dir)
}

fn trip(s: &mut Store, title: &str) -> String {
    let id = new_id();
    s.save(Entity::Trip(Trip {
        id: id.clone(),
        title: title.into(),
        description: None,
        destination: None,
        status_override: None,
        earliest_departure: None,
        latest_return: None,
        preferred_start: None,
        preferred_end: None,
        preferred_month: None,
        min_nights: None,
        max_nights: None,
        home_airports: None,
        budget_target_minor: Some(250_000),
        budget_max_minor: None,
        currency: "EUR".into(),
        travel_style: None,
        notes: None,
        arrival_buffer_min: 60,
        departure_buffer_min: 120,
        created_at: NOW.into(),
        updated_at: NOW.into(),
    }))
    .unwrap();
    id
}

fn slot(s: &mut Store, trip_id: &str, kind: SlotKind) -> String {
    let id = new_id();
    s.save(Entity::Slot(Slot {
        id: id.clone(),
        trip_id: trip_id.into(),
        station_id: None,
        kind,
        title: "Slot".into(),
        required: true,
        notes: None,
        sort: 0,
        created_at: NOW.into(),
    }))
    .unwrap();
    id
}

fn option(slot_id: &str, price: Option<i64>) -> PlanOption {
    PlanOption {
        id: new_id(),
        slot_id: slot_id.into(),
        title: "Option".into(),
        status: OptionStatus::Planned,
        decision: Decision::None,
        rating: None,
        provider: Some("TAP".into()),
        platform: Some("Google Flights".into()),
        url: Some("https://www.google.com/travel/flights".into()),
        price_minor: price,
        currency: "EUR".into(),
        price_basis: PriceBasis::Total,
        party_size: None,
        included_services: None,
        pros: None,
        cons: None,
        notes: None,
        source: None,
        price_verified_at: None,
        contact: None,
        sort: 0,
        created_at: NOW.into(),
        updated_at: NOW.into(),
    }
}

fn segment(option_id: &str, seq: i64, from: &str, to: &str, dep: &str, arr: &str) -> FlightSegment {
    FlightSegment {
        id: new_id(),
        option_id: option_id.into(),
        booking_id: None,
        seq,
        airline: Some("TAP".into()),
        flight_number: Some(format!("TP{seq}")),
        from_airport: Some(from.into()),
        to_airport: Some(to.into()),
        depart_local: Some(dep.into()),
        depart_tz: Some("Europe/Berlin".into()),
        arrive_local: Some(arr.into()),
        arrive_tz: Some("Europe/Lisbon".into()),
        cabin: None,
        fare_class: None,
        baggage: None,
        notes: None,
        mode: None,
        from_place: None,
        to_place: None,
        from_lat: None,
        from_lon: None,
        to_lat: None,
        to_lon: None,
    }
}

fn flight_bundle(slot_id: &str, price: i64) -> OptionBundle {
    let o = option(slot_id, Some(price));
    let segments = vec![
        segment(&o.id, 1, "FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"),
        segment(&o.id, 2, "LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"),
    ];
    OptionBundle { option: o, segments, accommodation: None, rental_car: None, activity: None, fees: vec![], policy: None }
}

fn booking(option_id: &str, price: i64) -> Booking {
    Booking {
        id: new_id(),
        option_id: option_id.into(),
        status: BookingStatus::Active,
        provider: Some("TAP".into()),
        platform: Some("tap.pt".into()),
        reference: Some("ABC123".into()),
        booked_on: Some("2026-10-31".into()),
        price_minor: Some(price),
        currency: "EUR".into(),
        payment_status: PaymentStatus::Unpaid,
        contact: None,
        url: None,
        notes: None,
        snapshot: String::new(),
        cancellation_requested_at: None,
        cancelled_at: None,
        refund_final_minor: None,
        created_at: NOW.into(),
        updated_at: NOW.into(),
    }
}

fn book(s: &mut Store, option_id: &str, price: i64, segment_ids: Vec<String>) -> String {
    s.create_booking(BookingInput {
        booking: booking(option_id, price),
        policy: None,
        segment_ids,
        payments: vec![],
        new_option: None,
    })
    .unwrap()
}

fn rule_code(e: CoreError) -> &'static str {
    match e {
        CoreError::Rule { code, .. } => code,
        other => panic!("expected a rule error, got {other:?}"),
    }
}

#[test]
fn trip_without_dates_is_valid_and_round_trips() {
    let (mut s, _d) = store();
    let id = trip(&mut s, "Japan Spring Adventure");
    let g = s.trip_graph(&id).unwrap();
    assert_eq!(g.trip.title, "Japan Spring Adventure");
    assert!(g.trip.earliest_departure.is_none());
    assert_eq!(s.trip_graphs().unwrap().len(), 1);
}

#[test]
fn invalid_rows_are_rejected() {
    let (mut s, _d) = store();
    let id = trip(&mut s, "Portugal");
    let mut t = s.trip_graph(&id).unwrap().trip;
    t.currency = "euro".into();
    assert!(matches!(s.save(Entity::Trip(t.clone())), Err(CoreError::Validation { .. })));
    t.currency = "EUR".into();
    t.earliest_departure = Some("2027-06-10".into());
    t.latest_return = Some("2027-06-01".into());
    assert!(matches!(s.save(Entity::Trip(t)), Err(CoreError::Validation { .. })));
}

#[test]
fn duplicating_an_option_is_a_deep_independent_copy() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 28_000);
    let original = b.option.id.clone();
    s.save_option(b, false).unwrap();
    let copy = s.duplicate_option(&original, "Flight B").unwrap();

    let mut edited = crate::store::load_bundle(&s.conn, &copy).unwrap();
    edited.option.price_minor = Some(34_000);
    edited.segments[0].depart_local = Some("2027-06-12T07:00".into());
    s.save_option(edited, false).unwrap();

    let a = crate::store::load_bundle(&s.conn, &original).unwrap();
    assert_eq!(a.option.price_minor, Some(28_000));
    assert_eq!(a.segments[0].depart_local.as_deref(), Some("2027-06-10T07:00"));
    assert_eq!(a.segments.len(), 2);
}

#[test]
fn booking_snapshots_the_plan_and_protects_the_option() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 28_000);
    let oid = b.option.id.clone();
    s.save_option(b, false).unwrap();
    let bid = book(&mut s, &oid, 29_500, vec![]);

    let g = s.trip_graph(&t).unwrap();
    let booked = g.bookings.iter().find(|b| b.id == bid).unwrap();
    let snap: OptionBundle = serde_json::from_str(&booked.snapshot).unwrap();
    assert_eq!(snap.option.price_minor, Some(28_000), "planned price preserved");
    assert_eq!(booked.price_minor, Some(29_500), "actual price kept separately");
    assert_eq!(g.options[0].status, OptionStatus::Booked);
    assert!(g.flight_segments.iter().all(|s| s.booking_id.as_deref() == Some(bid.as_str())));

    let mut edit = crate::store::load_bundle(&s.conn, &oid).unwrap();
    edit.option.price_minor = Some(1);
    assert_eq!(rule_code(s.save_option(edit.clone(), false).unwrap_err()), "option_booked");
    s.save_option(edit, true).unwrap();
    let g = s.trip_graph(&t).unwrap();
    let snap: OptionBundle = serde_json::from_str(&g.bookings[0].snapshot).unwrap();
    assert_eq!(snap.option.price_minor, Some(28_000), "snapshot is immutable");
    assert_eq!(g.bookings[0].price_minor, Some(29_500), "booking unaffected by plan edits");
    assert!(g.change_log.iter().any(|c| c.entity == "option" && c.field == "price"));

    assert_eq!(rule_code(s.delete(EntityKind::Option, &[oid]).unwrap_err()), "option_has_bookings");
}

#[test]
fn outbound_and_return_can_be_separate_bookings() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 30_000);
    let (oid, out, ret) = (b.option.id.clone(), b.segments[0].id.clone(), b.segments[1].id.clone());
    s.save_option(b, false).unwrap();
    let first = book(&mut s, &oid, 14_000, vec![out.clone()]);
    let err = s
        .create_booking(BookingInput {
            booking: booking(&oid, 1),
            policy: None,
            segment_ids: vec![out],
            payments: vec![],
            new_option: None,
        })
        .unwrap_err();
    assert_eq!(rule_code(err), "segment_unavailable");
    let second = book(&mut s, &oid, 16_000, vec![]);
    let g = s.trip_graph(&t).unwrap();
    let by = |id: &str| g.flight_segments.iter().find(|s| s.id == id).unwrap().booking_id.clone().unwrap();
    assert_eq!(by(&ret), second);
    assert_ne!(first, second);
}

#[test]
fn cancelling_keeps_booking_payments_and_history() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Accommodation);
    let o = option(&sl, Some(62_000));
    let oid = o.id.clone();
    let acc = AccommodationDetails {
        option_id: oid.clone(),
        accommodation_type: AccommodationType::Hotel,
        address: None,
        map_url: None,
        check_in: Some("2027-06-10".into()),
        check_out: Some("2027-06-17".into()),
        check_in_time: None,
        check_out_time: None,
        tz: Some("Europe/Lisbon".into()),
        room_type: None,
        meal_plan: None,
        lat: Some(38.7139),
        lon: Some(-9.1334),
    };
    s.save_option(
        OptionBundle { option: o, segments: vec![], accommodation: Some(acc), rental_car: None, activity: None, fees: vec![], policy: None },
        false,
    )
    .unwrap();
    let bid = book(&mut s, &oid, 62_000, vec![]);
    s.save(Entity::Payment(Payment {
        id: new_id(),
        booking_id: bid.clone(),
        kind: PaymentKind::Payment,
        amount_minor: 62_000,
        currency: "EUR".into(),
        paid_on: Some("2026-10-31".into()),
        method: None,
        traveler_id: None,
        notes: None,
        created_at: NOW.into(),
    }))
    .unwrap();
    s.cancel_booking(CancelInput {
        booking_id: bid.clone(),
        requested_at: None,
        cancelled_at: NOW.into(),
        refund_final_minor: Some(62_000),
        notes: Some("Free cancellation".into()),
    })
    .unwrap();
    let g = s.trip_graph(&t).unwrap();
    assert_eq!(g.bookings[0].status, BookingStatus::Cancelled);
    assert_eq!(g.payments.len(), 1);
    assert_eq!(g.options[0].status, OptionStatus::Cancelled);
    assert_eq!(g.accommodation_details.len(), 1);
    assert_eq!(rule_code(s.cancel_booking(CancelInput {
        booking_id: bid,
        requested_at: None,
        cancelled_at: NOW.into(),
        refund_final_minor: None,
        notes: None,
    }).unwrap_err()), "already_cancelled");
}

#[test]
fn status_booked_requires_a_booking() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let mut b = flight_bundle(&sl, 1);
    b.option.status = OptionStatus::Booked;
    assert_eq!(rule_code(s.save_option(b, false).unwrap_err()), "booking_required");
}

#[test]
fn details_must_match_slot_kind() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Accommodation);
    let b = flight_bundle(&sl, 1);
    assert!(matches!(s.save_option(b, false), Err(CoreError::Validation { .. })));
}

#[test]
fn only_one_preferred_scenario_per_trip() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 1);
    let oid = b.option.id.clone();
    s.save_option(b, false).unwrap();
    let mk = |name: &str| Scenario {
        id: new_id(),
        trip_id: t.clone(),
        name: name.into(),
        preferred: true,
        notes: None,
        created_at: NOW.into(),
        updated_at: NOW.into(),
    };
    let (a, b) = (mk("A"), mk("B"));
    let sel = |sc: &Scenario| vec![ScenarioSelection { scenario_id: sc.id.clone(), slot_id: sl.clone(), option_id: Some(oid.clone()) }];
    s.save_scenario(a.clone(), sel(&a)).unwrap();
    s.save_scenario(b.clone(), sel(&b)).unwrap();
    let g = s.trip_graph(&t).unwrap();
    let preferred: Vec<_> = g.scenarios.iter().filter(|s| s.preferred).map(|s| s.name.as_str()).collect();
    assert_eq!(preferred, ["B"]);
    s.set_preferred_scenario(&t, Some(&a.id)).unwrap();
    let g = s.trip_graph(&t).unwrap();
    assert!(g.scenarios.iter().find(|s| s.id == a.id).unwrap().preferred);
    assert_eq!(g.scenario_selections.len(), 2);
}

#[test]
fn references_across_trips_are_refused() {
    let (mut s, _d) = store();
    let a = trip(&mut s, "A");
    let b = trip(&mut s, "B");
    let station = new_id();
    s.save(Entity::Station(Station {
        id: station.clone(),
        trip_id: a.clone(),
        name: "Lisbon".into(),
        location: None,
        arrive_date: None,
        depart_date: None,
        notes: None,
        sort: 0,
    }))
    .unwrap();
    let err = s
        .save(Entity::Slot(Slot {
            id: new_id(),
            trip_id: b,
            station_id: Some(station),
            kind: SlotKind::Accommodation,
            title: "Stay".into(),
            required: true,
            notes: None,
            sort: 0,
            created_at: NOW.into(),
        }))
        .unwrap_err();
    assert!(matches!(err, CoreError::Validation { .. }));
}

#[test]
fn deleting_a_trip_removes_everything_and_unreferenced_files() {
    let (mut s, dir) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 1);
    let oid = b.option.id.clone();
    s.save_option(b, false).unwrap();
    book(&mut s, &oid, 1, vec![]);
    let src = dir.path().join("ticket.pdf");
    std::fs::write(&src, b"%PDF-1.7 test").unwrap();
    let doc = s.attach_document(&t, &src, Some(oid), None).unwrap();
    assert!(s.document_path(&doc.id).unwrap().is_file());

    s.delete(EntityKind::Trip, &[t.clone()]).unwrap();
    assert!(s.trip_graph(&t).is_err());
    let left: i64 = s.conn.query_row("SELECT COUNT(*) FROM flight_segments", [], |r| r.get(0)).unwrap();
    assert_eq!(left, 0);
    let files = std::fs::read_dir(crate::documents::dir(dir.path())).unwrap().count();
    assert_eq!(files, 0);
}

#[test]
fn missing_document_files_are_reported() {
    let (mut s, dir) = store();
    let t = trip(&mut s, "Portugal");
    let src = dir.path().join("voucher.png");
    std::fs::write(&src, b"png").unwrap();
    let doc = s.attach_document(&t, &src, None, None).unwrap();
    std::fs::remove_file(s.document_path(&doc.id).unwrap()).unwrap();
    assert_eq!(rule_code(s.document_path(&doc.id).unwrap_err()), "file_missing");
}

#[test]
fn price_observations_are_append_only() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let sl = slot(&mut s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 28_000);
    let oid = b.option.id.clone();
    s.save_option(b, false).unwrap();
    let obs = PriceObservation {
        id: new_id(),
        option_id: oid,
        observed_at: NOW.into(),
        price_minor: 25_000,
        currency: "EUR".into(),
        kind: ObservationKind::ManualCheck,
        provider: None,
        attributes: None,
        notes: None,
    };
    s.save(Entity::PriceObservation(obs.clone())).unwrap();
    assert_eq!(rule_code(s.save(Entity::PriceObservation(obs)).unwrap_err()), "observation_immutable");
    let g = s.trip_graph(&t).unwrap();
    assert_eq!(g.options[0].price_minor, Some(28_000), "observation does not overwrite the saved price");
}

fn populated(s: &mut Store) -> String {
    let t = trip(s, "Portugal Road Trip");
    let sl = slot(s, &t, SlotKind::Flight);
    let b = flight_bundle(&sl, 28_000);
    let oid = b.option.id.clone();
    s.save_option(b, false).unwrap();
    book(s, &oid, 29_000, vec![]);
    s.duplicate_option(&oid, "Flight B").unwrap();
    t
}

#[test]
fn export_and_import_as_new_trip() {
    let (mut s, dir) = store();
    let t = populated(&mut s);
    let file = dir.path().join("trip.json");
    s.export_trip(&t, &file).unwrap();

    let preview = s.preview_import(&file).unwrap();
    assert_eq!(preview.title, "Portugal Road Trip");
    assert_eq!(preview.existing_title.as_deref(), Some("Portugal Road Trip"));

    let new = s.import_trip(&file, ImportMode::AsNew).unwrap();
    assert_ne!(new, t);
    let (a, b) = (s.trip_graph(&t).unwrap(), s.trip_graph(&new).unwrap());
    assert_eq!(a.options.len(), b.options.len());
    assert_eq!(a.bookings.len(), b.bookings.len());
    assert!(b.options.iter().all(|o| !a.options.iter().any(|x| x.id == o.id)));
    assert!(b.flight_segments.iter().all(|seg| b.options.iter().any(|o| o.id == seg.option_id)));
    assert!(b.flight_segments.iter().filter_map(|s| s.booking_id.as_ref()).all(|id| b.bookings.iter().any(|x| &x.id == id)));
}

#[test]
fn import_replace_and_validation_errors() {
    let (mut s, dir) = store();
    let t = populated(&mut s);
    let file = dir.path().join("trip.json");
    s.export_trip(&t, &file).unwrap();
    let mut g = s.trip_graph(&t).unwrap();
    g.trip.title = "Changed".into();
    s.save(Entity::Trip(g.trip.clone())).unwrap();
    s.import_trip(&file, ImportMode::Replace).unwrap();
    assert_eq!(s.trip_graph(&t).unwrap().trip.title, "Portugal Road Trip");
    assert_eq!(s.trip_graphs().unwrap().len(), 1);

    let text = std::fs::read_to_string(&file).unwrap();
    let broken = text.replacen(&g.slots[0].id, "0000-missing", 1);
    let bad = dir.path().join("bad.json");
    std::fs::write(&bad, broken).unwrap();
    assert!(s.preview_import(&bad).is_err());
    std::fs::write(&bad, "{\"format\":\"something-else\"}").unwrap();
    assert_eq!(rule_code(s.preview_import(&bad).unwrap_err()), "import_wrong_format");
    std::fs::write(&bad, "not json").unwrap();
    assert_eq!(rule_code(s.preview_import(&bad).unwrap_err()), "import_not_json");
}

#[test]
fn backup_and_restore_round_trip() {
    let (mut s, dir) = store();
    let t = populated(&mut s);
    let src = dir.path().join("ticket.pdf");
    std::fs::write(&src, b"%PDF").unwrap();
    let doc = s.attach_document(&t, &src, None, None).unwrap();
    let backup = dir.path().join("backup.zip");
    let manifest = s.create_backup(&backup).unwrap();
    assert_eq!(manifest.trips, 1);
    assert_eq!(manifest.documents, 1);

    s.delete(EntityKind::Trip, &[t.clone()]).unwrap();
    trip(&mut s, "Something else");
    let preview = s.preview_restore(&backup).unwrap();
    assert_eq!(preview.trip_titles, ["Portugal Road Trip"]);
    assert_eq!(preview.missing_documents, 0);

    let safety = s.restore_backup(&backup).unwrap();
    assert!(std::path::Path::new(&safety).is_file());
    let graphs = s.trip_graphs().unwrap();
    assert_eq!(graphs.len(), 1);
    assert_eq!(graphs[0].trip.id, t);
    assert!(s.document_path(&doc.id).unwrap().is_file());
}

#[test]
fn restore_rejects_foreign_or_unsafe_archives() {
    let (s, dir) = store();
    let path = dir.path().join("evil.zip");
    {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", opts).unwrap();
        std::io::Write::write_all(
            &mut zip,
            br#"{"format":"travel-planner/backup","schema_version":1,"created_at":"x","trips":0,"documents":0}"#,
        )
        .unwrap();
        zip.start_file("../outside.txt", opts).unwrap();
        zip.finish().unwrap();
    }
    assert_eq!(rule_code(s.preview_restore(&path).unwrap_err()), "backup_invalid");
    std::fs::write(&path, b"not a zip").unwrap();
    assert_eq!(rule_code(s.preview_restore(&path).unwrap_err()), "backup_invalid");
}

#[test]
fn transport_segments_need_a_mode_and_flights_must_not_have_one() {
    let (mut s, _d) = store();
    let t = trip(&mut s, "Portugal");
    let rail = slot(&mut s, &t, SlotKind::Transport);
    let o = option(&rail, Some(4_500));
    let mut seg = segment(&o.id, 1, "LIS", "OPO", "2027-06-12T09:00", "2027-06-12T12:00");
    seg.from_airport = None;
    seg.to_airport = None;
    seg.from_place = Some("Lisboa Santa Apolónia".into());
    seg.to_place = Some("Porto Campanhã".into());
    seg.from_lat = Some(38.7139);
    seg.from_lon = Some(-9.1223);
    let mut bundle = OptionBundle {
        option: o,
        segments: vec![seg.clone()],
        accommodation: None,
        rental_car: None,
        activity: None,
        fees: vec![],
        policy: None,
    };
    assert!(matches!(s.save_option(bundle.clone(), false), Err(CoreError::Validation { .. })), "mode missing");
    bundle.segments[0].mode = Some(TransportMode::Train);
    s.save_option(bundle.clone(), false).unwrap();
    let g = s.trip_graph(&t).unwrap();
    assert_eq!(g.flight_segments[0].mode, Some(TransportMode::Train));
    assert_eq!(g.flight_segments[0].to_place.as_deref(), Some("Porto Campanhã"));

    let fl = slot(&mut s, &t, SlotKind::Flight);
    let mut flight = flight_bundle(&fl, 10_000);
    flight.segments[0].mode = Some(TransportMode::Bus);
    assert!(matches!(s.save_option(flight, false), Err(CoreError::Validation { .. })));

    bundle.segments[0].to_lat = Some(41.1);
    assert!(matches!(s.save_option(bundle, false), Err(CoreError::Validation { .. })), "half a coordinate");
}
