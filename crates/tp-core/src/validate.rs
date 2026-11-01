//! Input validation for every row written to the database (UI forms validate too, but the core
//! must not rely on that, e.g. for imported files).

use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime};

use crate::error::{CoreError, CoreResult};
use crate::model::*;

const MAX_TEXT: usize = 20_000;
const MAX_LINE: usize = 500;

pub trait Validate {
    fn validate(&self) -> CoreResult<()>;
}

fn line(field: &str, v: &str) -> CoreResult<()> {
    if v.chars().count() > MAX_LINE {
        return Err(CoreError::invalid(field, "too long"));
    }
    Ok(())
}

fn title(field: &str, v: &str) -> CoreResult<()> {
    if v.trim().is_empty() {
        return Err(CoreError::invalid(field, "required"));
    }
    line(field, v)
}

fn opt_line(field: &str, v: &Option<String>) -> CoreResult<()> {
    v.as_deref().map_or(Ok(()), |v| line(field, v))
}

fn opt_text(field: &str, v: &Option<String>) -> CoreResult<()> {
    match v {
        Some(v) if v.len() > MAX_TEXT => Err(CoreError::invalid(field, "too long")),
        _ => Ok(()),
    }
}

pub fn id(field: &str, v: &str) -> CoreResult<()> {
    if v.is_empty() || v.len() > 64 || !v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(CoreError::invalid(field, "invalid id"));
    }
    Ok(())
}

fn opt_id(field: &str, v: &Option<String>) -> CoreResult<()> {
    v.as_deref().map_or(Ok(()), |v| id(field, v))
}

pub fn currency(field: &str, v: &str) -> CoreResult<()> {
    if v.len() != 3 || !v.chars().all(|c| c.is_ascii_uppercase()) {
        return Err(CoreError::invalid(field, "currency must be an ISO 4217 code"));
    }
    Ok(())
}

pub fn date(field: &str, v: &str) -> CoreResult<()> {
    NaiveDate::parse_from_str(v, "%Y-%m-%d").map(|_| ()).map_err(|_| CoreError::invalid(field, "expected YYYY-MM-DD"))
}

fn opt_date(field: &str, v: &Option<String>) -> CoreResult<()> {
    v.as_deref().map_or(Ok(()), |v| date(field, v))
}

fn opt_time(field: &str, v: &Option<String>) -> CoreResult<()> {
    match v {
        Some(v) => NaiveTime::parse_from_str(v, "%H:%M").map(|_| ()).map_err(|_| CoreError::invalid(field, "expected HH:MM")),
        None => Ok(()),
    }
}

fn opt_local(field: &str, v: &Option<String>) -> CoreResult<()> {
    match v {
        Some(v) => NaiveDateTime::parse_from_str(v, "%Y-%m-%dT%H:%M")
            .map(|_| ())
            .map_err(|_| CoreError::invalid(field, "expected YYYY-MM-DDTHH:MM")),
        None => Ok(()),
    }
}

pub fn timestamp(field: &str, v: &str) -> CoreResult<()> {
    DateTime::parse_from_rfc3339(v).map(|_| ()).map_err(|_| CoreError::invalid(field, "expected an RFC 3339 timestamp"))
}

fn opt_timestamp(field: &str, v: &Option<String>) -> CoreResult<()> {
    v.as_deref().map_or(Ok(()), |v| timestamp(field, v))
}

/// IANA zone names like `Europe/Lisbon` or `UTC`; the UI resolves them with Temporal.
fn opt_tz(field: &str, v: &Option<String>) -> CoreResult<()> {
    match v {
        Some(v) if v.is_empty() || v.len() > 64 || !v.chars().all(|c| c.is_ascii_alphanumeric() || "/_+-".contains(c)) => {
            Err(CoreError::invalid(field, "invalid time zone"))
        }
        _ => Ok(()),
    }
}

/// Only plain web links are stored; anything else (file:, javascript:, …) is refused.
pub fn url(field: &str, v: &str) -> CoreResult<()> {
    let lower = v.to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"));
    match rest {
        Some(host) if !host.is_empty() && !host.starts_with('/') && !v.chars().any(char::is_whitespace) && v.len() <= 2048 => Ok(()),
        _ => Err(CoreError::invalid(field, "expected an http(s) URL")),
    }
}

fn opt_url(field: &str, v: &Option<String>) -> CoreResult<()> {
    v.as_deref().map_or(Ok(()), |v| url(field, v))
}

fn non_negative(field: &str, v: Option<i64>) -> CoreResult<()> {
    match v {
        Some(n) if n < 0 => Err(CoreError::invalid(field, "must not be negative")),
        _ => Ok(()),
    }
}

fn range(field: &str, v: Option<i64>, min: i64, max: i64) -> CoreResult<()> {
    match v {
        Some(n) if n < min || n > max => Err(CoreError::invalid(field, format!("must be between {min} and {max}"))),
        _ => Ok(()),
    }
}

/// Both or neither, within WGS 84 ranges.
fn coordinates(lat: Option<f64>, lon: Option<f64>) -> CoreResult<()> {
    match (lat, lon) {
        (None, None) => Ok(()),
        (Some(a), Some(o)) if (-90.0..=90.0).contains(&a) && (-180.0..=180.0).contains(&o) => Ok(()),
        _ => Err(CoreError::invalid("lat", "expected latitude and longitude")),
    }
}

fn not_before(field: &str, start: &Option<String>, end: &Option<String>) -> CoreResult<()> {
    if let (Some(s), Some(e)) = (start, end)
        && e < s
    {
        return Err(CoreError::invalid(field, "must not be before the start"));
    }
    Ok(())
}

impl Validate for Trip {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        title("title", &self.title)?;
        opt_text("description", &self.description)?;
        opt_line("destination", &self.destination)?;
        opt_date("earliest_departure", &self.earliest_departure)?;
        opt_date("latest_return", &self.latest_return)?;
        not_before("latest_return", &self.earliest_departure, &self.latest_return)?;
        opt_date("preferred_start", &self.preferred_start)?;
        opt_date("preferred_end", &self.preferred_end)?;
        not_before("preferred_end", &self.preferred_start, &self.preferred_end)?;
        if let Some(m) = &self.preferred_month {
            date("preferred_month", &format!("{m}-01"))?;
        }
        range("min_nights", self.min_nights, 0, 365)?;
        range("max_nights", self.max_nights, 0, 365)?;
        if let (Some(a), Some(b)) = (self.min_nights, self.max_nights)
            && b < a
        {
            return Err(CoreError::invalid("max_nights", "must not be below the minimum"));
        }
        if let Some(codes) = &self.home_airports
            && !codes.split(',').all(|c| c.len() == 3 && c.chars().all(|c| c.is_ascii_uppercase()))
        {
            return Err(CoreError::invalid("home_airports", "expected IATA codes"));
        }
        non_negative("budget_target_minor", self.budget_target_minor)?;
        non_negative("budget_max_minor", self.budget_max_minor)?;
        currency("currency", &self.currency)?;
        opt_line("travel_style", &self.travel_style)?;
        opt_text("notes", &self.notes)?;
        range("arrival_buffer_min", Some(self.arrival_buffer_min), 0, 24 * 60)?;
        range("departure_buffer_min", Some(self.departure_buffer_min), 0, 24 * 60)?;
        timestamp("created_at", &self.created_at)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for Traveler {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        title("name", &self.name)?;
        opt_date("birth_date", &self.birth_date)?;
        opt_text("notes", &self.notes)
    }
}

impl Validate for Station {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        title("name", &self.name)?;
        opt_line("location", &self.location)?;
        opt_date("arrive_date", &self.arrive_date)?;
        opt_date("depart_date", &self.depart_date)?;
        not_before("depart_date", &self.arrive_date, &self.depart_date)?;
        opt_text("notes", &self.notes)
    }
}

impl Validate for Slot {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        opt_id("station_id", &self.station_id)?;
        title("title", &self.title)?;
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for PlanOption {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("slot_id", &self.slot_id)?;
        title("title", &self.title)?;
        range("rating", self.rating, 0, 5)?;
        opt_line("provider", &self.provider)?;
        opt_line("platform", &self.platform)?;
        opt_url("url", &self.url)?;
        non_negative("price_minor", self.price_minor)?;
        non_negative("target_price_minor", self.target_price_minor)?;
        currency("currency", &self.currency)?;
        range("party_size", self.party_size, 1, 99)?;
        opt_text("included_services", &self.included_services)?;
        opt_text("pros", &self.pros)?;
        opt_text("cons", &self.cons)?;
        opt_text("notes", &self.notes)?;
        opt_line("source", &self.source)?;
        opt_timestamp("price_verified_at", &self.price_verified_at)?;
        opt_text("contact", &self.contact)?;
        timestamp("created_at", &self.created_at)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for FlightSegment {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("option_id", &self.option_id)?;
        opt_id("booking_id", &self.booking_id)?;
        opt_line("airline", &self.airline)?;
        opt_line("flight_number", &self.flight_number)?;
        for (f, v) in [("from_airport", &self.from_airport), ("to_airport", &self.to_airport)] {
            if let Some(code) = v
                && (code.len() != 3 || !code.chars().all(|c| c.is_ascii_uppercase()))
            {
                return Err(CoreError::invalid(f, "expected an IATA code"));
            }
        }
        opt_local("depart_local", &self.depart_local)?;
        opt_tz("depart_tz", &self.depart_tz)?;
        opt_local("arrive_local", &self.arrive_local)?;
        opt_tz("arrive_tz", &self.arrive_tz)?;
        opt_line("cabin", &self.cabin)?;
        opt_line("fare_class", &self.fare_class)?;
        opt_line("baggage", &self.baggage)?;
        opt_line("from_place", &self.from_place)?;
        opt_line("to_place", &self.to_place)?;
        coordinates(self.from_lat, self.from_lon)?;
        coordinates(self.to_lat, self.to_lon)?;
        opt_text("notes", &self.notes)
    }
}

impl Validate for AccommodationDetails {
    fn validate(&self) -> CoreResult<()> {
        id("option_id", &self.option_id)?;
        opt_line("address", &self.address)?;
        opt_url("map_url", &self.map_url)?;
        opt_date("check_in", &self.check_in)?;
        opt_date("check_out", &self.check_out)?;
        if let (Some(a), Some(b)) = (&self.check_in, &self.check_out)
            && b <= a
        {
            return Err(CoreError::invalid("check_out", "must be after check-in"));
        }
        opt_time("check_in_time", &self.check_in_time)?;
        opt_time("check_out_time", &self.check_out_time)?;
        opt_tz("tz", &self.tz)?;
        opt_line("room_type", &self.room_type)?;
        opt_line("meal_plan", &self.meal_plan)?;
        coordinates(self.lat, self.lon)
    }
}

impl Validate for RentalCarDetails {
    fn validate(&self) -> CoreResult<()> {
        id("option_id", &self.option_id)?;
        opt_line("vehicle_category", &self.vehicle_category)?;
        opt_line("vehicle_model", &self.vehicle_model)?;
        opt_line("pickup_location", &self.pickup_location)?;
        opt_local("pickup_local", &self.pickup_local)?;
        opt_tz("pickup_tz", &self.pickup_tz)?;
        opt_line("return_location", &self.return_location)?;
        opt_local("return_local", &self.return_local)?;
        opt_tz("return_tz", &self.return_tz)?;
        opt_line("mileage", &self.mileage)?;
        opt_line("fuel_policy", &self.fuel_policy)?;
        opt_text("insurance", &self.insurance)?;
        non_negative("excess_minor", self.excess_minor)?;
        non_negative("deposit_minor", self.deposit_minor)?;
        non_negative("additional_driver_fee_minor", self.additional_driver_fee_minor)?;
        range("grace_minutes", Some(self.grace_minutes), 0, 24 * 60)
    }
}

impl Validate for ActivityDetails {
    fn validate(&self) -> CoreResult<()> {
        id("option_id", &self.option_id)?;
        opt_line("category", &self.category)?;
        opt_line("location", &self.location)?;
        opt_date("start_date", &self.start_date)?;
        opt_time("start_time", &self.start_time)?;
        opt_date("end_date", &self.end_date)?;
        opt_time("end_time", &self.end_time)?;
        not_before("end_date", &self.start_date, &self.end_date)?;
        opt_tz("tz", &self.tz)?;
        range("duration_min", self.duration_min, 0, 60 * 24 * 60)?;
        coordinates(self.lat, self.lon)
    }
}

impl Validate for OptionFee {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("option_id", &self.option_id)?;
        title("label", &self.label)?;
        non_negative("amount_minor", self.amount_minor)?;
        currency("currency", &self.currency)
    }
}

impl Validate for CancellationPolicy {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        opt_id("option_id", &self.option_id)?;
        opt_id("booking_id", &self.booking_id)?;
        if self.option_id.is_some() == self.booking_id.is_some() {
            return Err(CoreError::invalid("option_id", "policy belongs to exactly one option or booking"));
        }
        opt_local("deadline_local", &self.deadline_local)?;
        opt_tz("deadline_tz", &self.deadline_tz)?;
        non_negative("fee_minor", self.fee_minor)?;
        non_negative("refundable_minor", self.refundable_minor)?;
        range("refundable_percent", self.refundable_percent, 0, 100)?;
        currency("currency", &self.currency)?;
        opt_text("policy_text", &self.policy_text)?;
        opt_line("source", &self.source)?;
        opt_timestamp("checked_at", &self.checked_at)?;
        opt_text("notes", &self.notes)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for Booking {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("option_id", &self.option_id)?;
        opt_line("provider", &self.provider)?;
        opt_line("platform", &self.platform)?;
        opt_line("reference", &self.reference)?;
        opt_date("booked_on", &self.booked_on)?;
        non_negative("price_minor", self.price_minor)?;
        currency("currency", &self.currency)?;
        opt_text("contact", &self.contact)?;
        opt_url("url", &self.url)?;
        opt_text("notes", &self.notes)?;
        opt_timestamp("cancellation_requested_at", &self.cancellation_requested_at)?;
        opt_timestamp("cancelled_at", &self.cancelled_at)?;
        non_negative("refund_final_minor", self.refund_final_minor)?;
        timestamp("created_at", &self.created_at)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for Payment {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("booking_id", &self.booking_id)?;
        if self.amount_minor <= 0 {
            return Err(CoreError::invalid("amount_minor", "must be positive"));
        }
        currency("currency", &self.currency)?;
        opt_date("paid_on", &self.paid_on)?;
        opt_line("method", &self.method)?;
        opt_id("traveler_id", &self.traveler_id)?;
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for Expense {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        opt_id("booking_id", &self.booking_id)?;
        title("title", &self.title)?;
        if self.amount_minor <= 0 {
            return Err(CoreError::invalid("amount_minor", "must be positive"));
        }
        currency("currency", &self.currency)?;
        opt_date("spent_on", &self.spent_on)?;
        opt_id("paid_by", &self.paid_by)?;
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for CostShare {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        opt_id("booking_id", &self.booking_id)?;
        opt_id("expense_id", &self.expense_id)?;
        if self.booking_id.is_some() == self.expense_id.is_some() {
            return Err(CoreError::invalid("booking_id", "share belongs to exactly one booking or expense"));
        }
        id("traveler_id", &self.traveler_id)?;
        range("weight", Some(self.weight), 0, 1000)
    }
}

impl Validate for Scenario {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        title("name", &self.name)?;
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for ScenarioSelection {
    fn validate(&self) -> CoreResult<()> {
        id("scenario_id", &self.scenario_id)?;
        id("slot_id", &self.slot_id)?;
        opt_id("option_id", &self.option_id)
    }
}

impl Validate for PriceObservation {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("option_id", &self.option_id)?;
        timestamp("observed_at", &self.observed_at)?;
        non_negative("price_minor", Some(self.price_minor))?;
        currency("currency", &self.currency)?;
        opt_line("provider", &self.provider)?;
        opt_text("attributes", &self.attributes)?;
        opt_text("notes", &self.notes)
    }
}

impl Validate for Task {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        opt_id("option_id", &self.option_id)?;
        title("title", &self.title)?;
        opt_date("due_date", &self.due_date)?;
        opt_timestamp("done_at", &self.done_at)?;
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for DismissedWarning {
    fn validate(&self) -> CoreResult<()> {
        id("trip_id", &self.trip_id)?;
        title("key", &self.key)?;
        opt_text("note", &self.note)?;
        timestamp("dismissed_at", &self.dismissed_at)
    }
}

impl Validate for OpenNight {
    fn validate(&self) -> CoreResult<()> {
        id("trip_id", &self.trip_id)?;
        date("night", &self.night)?;
        opt_line("note", &self.note)
    }
}

impl Validate for Document {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        opt_id("option_id", &self.option_id)?;
        opt_id("booking_id", &self.booking_id)?;
        crate::documents::check_stored_name(&self.stored_name)?;
        title("filename", &self.filename)?;
        opt_line("mime", &self.mime)?;
        non_negative("size_bytes", Some(self.size_bytes))?;
        if self.sha256.len() != 64 || !self.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(CoreError::invalid("sha256", "invalid checksum"));
        }
        opt_text("notes", &self.notes)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for Note {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        id("trip_id", &self.trip_id)?;
        opt_id("option_id", &self.option_id)?;
        title("title", &self.title)?;
        opt_text("body", &Some(self.body.clone()))?;
        timestamp("created_at", &self.created_at)?;
        timestamp("updated_at", &self.updated_at)
    }
}

impl Validate for ExchangeRate {
    fn validate(&self) -> CoreResult<()> {
        id("id", &self.id)?;
        currency("base", &self.base)?;
        currency("quote", &self.quote)?;
        if self.base == self.quote {
            return Err(CoreError::invalid("quote", "must differ from the base currency"));
        }
        let ok = !self.rate.is_empty()
            && self.rate.len() <= 24
            && self.rate.chars().all(|c| c.is_ascii_digit() || c == '.')
            && self.rate.matches('.').count() <= 1
            && self.rate.chars().any(|c| c.is_ascii_digit() && c != '0');
        if !ok {
            return Err(CoreError::invalid("rate", "expected a positive decimal number"));
        }
        date("as_of", &self.as_of)?;
        opt_line("source", &self.source)?;
        timestamp("created_at", &self.created_at)
    }
}

impl Validate for OptionBundle {
    fn validate(&self) -> CoreResult<()> {
        let o = &self.option;
        o.validate()?;
        for s in &self.segments {
            s.validate()?;
            if s.option_id != o.id {
                return Err(CoreError::invalid("segments", "segment belongs to another option"));
            }
        }
        let own = |field: &str, option_id: &str| {
            if option_id == o.id { Ok(()) } else { Err(CoreError::invalid(field, "belongs to another option")) }
        };
        if let Some(a) = &self.accommodation {
            a.validate()?;
            own("accommodation", &a.option_id)?;
        }
        if let Some(r) = &self.rental_car {
            r.validate()?;
            own("rental_car", &r.option_id)?;
        }
        if let Some(a) = &self.activity {
            a.validate()?;
            own("activity", &a.option_id)?;
        }
        for f in &self.fees {
            f.validate()?;
            own("fees", &f.option_id)?;
        }
        if let Some(p) = &self.policy {
            p.validate()?;
            if p.option_id.as_deref() != Some(o.id.as_str()) {
                return Err(CoreError::invalid("policy", "belongs to another option"));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_must_be_web_links() {
        assert!(url("u", "https://www.booking.com/hotel/pt/x.html").is_ok());
        assert!(url("u", "http://example.com").is_ok());
        for bad in ["javascript:alert(1)", "file:///C:/x", "https://", "ftp://x", "https://a b"] {
            assert!(url("u", bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn currencies_dates_and_rates() {
        assert!(currency("c", "EUR").is_ok());
        assert!(currency("c", "eur").is_err());
        assert!(date("d", "2027-02-29").is_err());
        assert!(date("d", "2028-02-29").is_ok());
        let mut rate = ExchangeRate {
            id: "r".into(),
            base: "EUR".into(),
            quote: "USD".into(),
            rate: "1.0825".into(),
            as_of: "2026-10-01".into(),
            source: None,
            created_at: "2026-10-01T00:00:00Z".into(),
        };
        assert!(rate.validate().is_ok());
        for bad in ["0", "0.000", "-1", "1,2", "1.2.3", ""] {
            rate.rate = bad.into();
            assert!(rate.validate().is_err(), "{bad}");
        }
    }
}
