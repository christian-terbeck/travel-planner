//! Row types. Every struct mirrors one table column by column (snake_case on both sides), so the
//! same type is read from SQLite, sent to the UI as JSON and exported to TypeScript via ts-rs.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

macro_rules! string_enum {
    ($(#[$meta:meta])* $name:ident { $($(#[$vmeta:meta])* $variant:ident),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
        #[serde(rename_all = "snake_case")]
        #[ts(export)]
        pub enum $name { $($(#[$vmeta])* $variant),+ }
    };
}

string_enum!(TravelerCategory { Adult, Child, Infant, Senior, Student, Other });
string_enum!(TravelDocumentKind { Passport, IdCard, Visa, DrivingLicence, Other });
string_enum!(SlotKind { Flight, Accommodation, RentalCar, Activity, Transport, Parking, Insurance, Other });
string_enum!(
    /// Means of a non-flight transport segment.
    TransportMode { Train, Bus, Ferry, Transfer, Other }
);
string_enum!(
    /// Lifecycle of a planned option. "Preferred" is derived from the preferred scenario.
    OptionStatus { Idea, Planned, Booked, Cancelled, Completed, Archived }
);
string_enum!(Decision { None, Favorite, Rejected });
string_enum!(PriceBasis { Total, PerPerson, PerNight, PerDay });
string_enum!(TripStatus { Idea, Planning, Booked, Ongoing, Completed, Cancelled, Archived });
string_enum!(BookingStatus { Active, Cancelled });
string_enum!(PaymentStatus { NotApplicable, Unpaid, PartiallyPaid, Paid, Refunded, PartiallyRefunded, Unknown });
string_enum!(PolicyType { FreeUntil, WithFee, PartiallyRefundable, NonRefundable, Unknown });
string_enum!(PaymentKind { Payment, Refund });
string_enum!(ExpenseKind { Planned, Actual, Refund });
string_enum!(ExpenseCategory { Food, Fuel, Tolls, PublicTransport, Parking, Fees, Shopping, Misc });
string_enum!(ObservationKind { ManualCheck, ProviderLive, ProviderIndicative, ProviderCached });
string_enum!(AccommodationType { Hotel, Apartment, VacationRental, Hostel, Campsite, Other });
string_enum!(DayRule { #[serde(rename = "24h")] Hours24, Calendar });

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Trip {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub destination: Option<String>,
    pub status_override: Option<TripStatus>,
    pub earliest_departure: Option<String>,
    pub latest_return: Option<String>,
    pub preferred_start: Option<String>,
    pub preferred_end: Option<String>,
    pub preferred_month: Option<String>,
    pub min_nights: Option<i64>,
    pub max_nights: Option<i64>,
    pub home_airports: Option<String>,
    pub budget_target_minor: Option<i64>,
    pub budget_max_minor: Option<i64>,
    pub currency: String,
    pub travel_style: Option<String>,
    pub notes: Option<String>,
    pub arrival_buffer_min: i64,
    pub departure_buffer_min: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Minimum change time between journeys by the same means; missing in older exports.
    #[serde(default = "default_connection_buffer")]
    pub connection_buffer_min: i64,
    /// Minimum change time when the means of transport or the airport changes.
    #[serde(default = "default_mode_change_buffer")]
    pub mode_change_buffer_min: i64,
}

fn default_connection_buffer() -> i64 {
    45
}

fn default_mode_change_buffer() -> i64 {
    90
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Traveler {
    pub id: String,
    pub trip_id: String,
    pub name: String,
    pub category: TravelerCategory,
    pub birth_date: Option<String>,
    pub notes: Option<String>,
    pub sort: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Station {
    pub id: String,
    pub trip_id: String,
    pub name: String,
    pub location: Option<String>,
    pub arrive_date: Option<String>,
    pub depart_date: Option<String>,
    pub notes: Option<String>,
    pub sort: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Slot {
    pub id: String,
    pub trip_id: String,
    pub station_id: Option<String>,
    pub kind: SlotKind,
    pub title: String,
    pub required: bool,
    pub notes: Option<String>,
    pub sort: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PlanOption {
    pub id: String,
    pub slot_id: String,
    pub title: String,
    pub status: OptionStatus,
    pub decision: Decision,
    pub rating: Option<i64>,
    pub provider: Option<String>,
    pub platform: Option<String>,
    pub url: Option<String>,
    pub price_minor: Option<i64>,
    pub currency: String,
    pub price_basis: PriceBasis,
    pub party_size: Option<i64>,
    pub included_services: Option<String>,
    pub pros: Option<String>,
    pub cons: Option<String>,
    pub notes: Option<String>,
    pub source: Option<String>,
    pub price_verified_at: Option<String>,
    pub contact: Option<String>,
    pub sort: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Price alert: a price check at or below this amount (option currency) is reported.
    pub target_price_minor: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FlightSegment {
    pub id: String,
    pub option_id: String,
    pub booking_id: Option<String>,
    pub seq: i64,
    pub airline: Option<String>,
    pub flight_number: Option<String>,
    pub from_airport: Option<String>,
    pub to_airport: Option<String>,
    pub depart_local: Option<String>,
    pub depart_tz: Option<String>,
    pub arrive_local: Option<String>,
    pub arrive_tz: Option<String>,
    pub cabin: Option<String>,
    pub fare_class: Option<String>,
    pub baggage: Option<String>,
    pub notes: Option<String>,
    /// `None` for flights; transport slots name their means per segment.
    pub mode: Option<TransportMode>,
    /// Station, port or address for transport segments (flights use the airport codes).
    pub from_place: Option<String>,
    pub to_place: Option<String>,
    pub from_lat: Option<f64>,
    pub from_lon: Option<f64>,
    pub to_lat: Option<f64>,
    pub to_lon: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AccommodationDetails {
    pub option_id: String,
    pub accommodation_type: AccommodationType,
    pub address: Option<String>,
    pub map_url: Option<String>,
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub check_in_time: Option<String>,
    pub check_out_time: Option<String>,
    pub tz: Option<String>,
    pub room_type: Option<String>,
    pub meal_plan: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RentalCarDetails {
    pub option_id: String,
    pub vehicle_category: Option<String>,
    pub vehicle_model: Option<String>,
    pub pickup_location: Option<String>,
    pub pickup_local: Option<String>,
    pub pickup_tz: Option<String>,
    pub return_location: Option<String>,
    pub return_local: Option<String>,
    pub return_tz: Option<String>,
    pub mileage: Option<String>,
    pub fuel_policy: Option<String>,
    pub insurance: Option<String>,
    pub excess_minor: Option<i64>,
    pub deposit_minor: Option<i64>,
    pub additional_driver_fee_minor: Option<i64>,
    pub day_rule: DayRule,
    pub grace_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ActivityDetails {
    pub option_id: String,
    pub category: Option<String>,
    pub location: Option<String>,
    pub start_date: Option<String>,
    pub start_time: Option<String>,
    pub end_date: Option<String>,
    pub end_time: Option<String>,
    pub tz: Option<String>,
    pub duration_min: Option<i64>,
    pub flexible: bool,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OptionFee {
    pub id: String,
    pub option_id: String,
    pub label: String,
    pub amount_minor: Option<i64>,
    pub currency: String,
    pub included: bool,
    pub sort: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CancellationPolicy {
    pub id: String,
    pub option_id: Option<String>,
    pub booking_id: Option<String>,
    pub policy_type: PolicyType,
    pub deadline_local: Option<String>,
    pub deadline_tz: Option<String>,
    pub fee_minor: Option<i64>,
    pub refundable_minor: Option<i64>,
    pub refundable_percent: Option<i64>,
    pub currency: String,
    pub policy_text: Option<String>,
    pub source: Option<String>,
    pub checked_at: Option<String>,
    pub notes: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Booking {
    pub id: String,
    pub option_id: String,
    pub status: BookingStatus,
    pub provider: Option<String>,
    pub platform: Option<String>,
    pub reference: Option<String>,
    pub booked_on: Option<String>,
    pub price_minor: Option<i64>,
    pub currency: String,
    pub payment_status: PaymentStatus,
    pub contact: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
    /// JSON of [`OptionSnapshot`]: the option as it was planned when it was booked.
    pub snapshot: String,
    pub cancellation_requested_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub refund_final_minor: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Payment {
    pub id: String,
    pub booking_id: String,
    pub kind: PaymentKind,
    pub amount_minor: i64,
    pub currency: String,
    pub paid_on: Option<String>,
    pub method: Option<String>,
    pub traveler_id: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

/// Money one traveler gave another to even out shared costs. Moves the balances between them;
/// the trip's costs stay the same.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Settlement {
    pub id: String,
    pub trip_id: String,
    pub from_traveler_id: String,
    pub to_traveler_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub paid_on: String,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Expense {
    pub id: String,
    pub trip_id: String,
    pub booking_id: Option<String>,
    pub kind: ExpenseKind,
    pub category: ExpenseCategory,
    pub title: String,
    pub amount_minor: i64,
    pub currency: String,
    pub spent_on: Option<String>,
    pub paid_by: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CostShare {
    pub id: String,
    pub booking_id: Option<String>,
    pub expense_id: Option<String>,
    pub traveler_id: String,
    pub weight: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Scenario {
    pub id: String,
    pub trip_id: String,
    pub name: String,
    pub preferred: bool,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScenarioSelection {
    pub scenario_id: String,
    pub slot_id: String,
    /// `None`: the slot is intentionally left out of this scenario.
    pub option_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PriceObservation {
    pub id: String,
    pub option_id: String,
    pub observed_at: String,
    pub price_minor: i64,
    pub currency: String,
    pub kind: ObservationKind,
    pub provider: Option<String>,
    pub attributes: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Task {
    pub id: String,
    pub trip_id: String,
    pub option_id: Option<String>,
    pub title: String,
    pub due_date: Option<String>,
    pub done_at: Option<String>,
    pub notes: Option<String>,
    pub sort: i64,
    pub created_at: String,
}

/// A passport, ID card, visa or licence of a traveler; only its kind and validity are kept.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TravelerDocument {
    pub id: String,
    pub traveler_id: String,
    pub kind: TravelDocumentKind,
    /// E.g. "ESTA USA" for a visa.
    pub label: Option<String>,
    pub expires_on: Option<String>,
    pub notes: Option<String>,
}

/// A traveler's membership in a loyalty or frequent flyer programme.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LoyaltyMembership {
    pub id: String,
    pub traveler_id: String,
    pub program: String,
    /// Airline, hotel chain or company the programme belongs to, for matching bookings.
    pub provider: Option<String>,
    pub number: String,
    pub tier: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PackingItem {
    pub id: String,
    pub trip_id: String,
    /// Who packs it; none means shared.
    pub traveler_id: Option<String>,
    pub category: Option<String>,
    pub title: String,
    pub quantity: Option<i64>,
    pub packed: bool,
    pub sort: i64,
}

/// A reusable packing list (not part of a trip).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PackingTemplate {
    pub id: String,
    pub name: String,
    /// JSON array of [`PackingTemplateItem`].
    pub items: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PackingTemplateItem {
    pub category: Option<String>,
    pub title: String,
    pub quantity: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DismissedWarning {
    pub trip_id: String,
    pub key: String,
    pub note: Option<String>,
    pub dismissed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OpenNight {
    pub trip_id: String,
    pub night: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Document {
    pub id: String,
    pub trip_id: String,
    pub option_id: Option<String>,
    pub booking_id: Option<String>,
    pub stored_name: String,
    pub filename: String,
    pub mime: Option<String>,
    pub size_bytes: i64,
    pub sha256: String,
    pub notes: Option<String>,
    pub created_at: String,
    /// A photo of this journal entry. Missing in exports made before the journal existed.
    #[serde(default)]
    pub journal_entry_id: Option<String>,
}

/// What happened on one day of the trip, in the traveller's words.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct JournalEntry {
    pub id: String,
    pub trip_id: String,
    /// Local date (YYYY-MM-DD).
    pub day: String,
    pub title: Option<String>,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Note {
    pub id: String,
    pub trip_id: String,
    pub option_id: Option<String>,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExchangeRate {
    pub id: String,
    pub base: String,
    pub quote: String,
    /// Decimal string, 1 `base` = `rate` `quote`.
    pub rate: String,
    pub as_of: String,
    pub source: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChangeLogEntry {
    pub id: i64,
    pub trip_id: String,
    pub entity: String,
    pub entity_id: String,
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub at: String,
}

/// An option with all of its kind-specific parts, as edited in one form and saved in one
/// transaction. Also the shape of a booking's snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OptionBundle {
    pub option: PlanOption,
    pub segments: Vec<FlightSegment>,
    pub accommodation: Option<AccommodationDetails>,
    pub rental_car: Option<RentalCarDetails>,
    pub activity: Option<ActivityDetails>,
    pub fees: Vec<OptionFee>,
    pub policy: Option<CancellationPolicy>,
}

/// Everything that belongs to one trip. The UI derives all summaries from this.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TripGraph {
    pub trip: Trip,
    pub travelers: Vec<Traveler>,
    /// Missing in exports made before travel documents existed.
    #[serde(default)]
    pub traveler_documents: Vec<TravelerDocument>,
    /// Missing in exports made before loyalty programmes existed.
    #[serde(default)]
    pub loyalty_memberships: Vec<LoyaltyMembership>,
    pub stations: Vec<Station>,
    pub slots: Vec<Slot>,
    pub options: Vec<PlanOption>,
    pub flight_segments: Vec<FlightSegment>,
    pub accommodation_details: Vec<AccommodationDetails>,
    pub rental_car_details: Vec<RentalCarDetails>,
    pub activity_details: Vec<ActivityDetails>,
    pub option_fees: Vec<OptionFee>,
    pub cancellation_policies: Vec<CancellationPolicy>,
    pub bookings: Vec<Booking>,
    pub payments: Vec<Payment>,
    pub expenses: Vec<Expense>,
    pub cost_shares: Vec<CostShare>,
    pub scenarios: Vec<Scenario>,
    pub scenario_selections: Vec<ScenarioSelection>,
    pub price_observations: Vec<PriceObservation>,
    pub tasks: Vec<Task>,
    /// Missing in exports made before packing lists existed.
    #[serde(default)]
    pub packing_items: Vec<PackingItem>,
    pub dismissed_warnings: Vec<DismissedWarning>,
    pub open_nights: Vec<OpenNight>,
    pub documents: Vec<Document>,
    /// Missing in exports made before the journal existed.
    #[serde(default)]
    pub journal_entries: Vec<JournalEntry>,
    /// Missing in exports made before settlements existed.
    #[serde(default)]
    pub settlements: Vec<Settlement>,
    pub notes: Vec<Note>,
    pub change_log: Vec<ChangeLogEntry>,
}
