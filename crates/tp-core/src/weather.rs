//! Daily weather from Open-Meteo (no key needed): the forecast for the coming two weeks, the
//! same days of last year as an indication for trips further ahead, and what the weather was for
//! past trips. Only used when the user enabled it; coordinates are rounded to about 1 km before
//! they are sent, and answers are cached.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{DateTime, Months, NaiveDate, Utc};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{CoreError, CoreResult};
use crate::store::Store;

/// Setting that allows sending coordinates and dates to Open-Meteo ("1" = on).
pub const ENABLED_SETTING: &str = "weather_enabled";
const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL: &str = "https://archive-api.open-meteo.com/v1/archive";
const DAILY: &str = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum";
/// The forecast reaches 16 days ahead, including today.
const FORECAST_AHEAD: i64 = 15;
/// The forecast service also returns the recent past; older days come from the archive.
const FORECAST_BACK: i64 = 60;
/// The archive lags a few days behind today.
const ARCHIVE_LAG: i64 = 6;
const MAX_DAYS: i64 = 31;
const FORECAST_FRESH: chrono::Duration = chrono::Duration::hours(3);
const MIN_INTERVAL: Duration = Duration::from_millis(250);
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum WeatherSource {
    Forecast,
    /// The same dates one year earlier, as an indication.
    LastYear,
    /// Measured weather of days that are over.
    Observed,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct WeatherQuery {
    pub lat: f64,
    pub lon: f64,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DayWeather {
    /// The day of the trip (for last year's weather: the trip day it stands for).
    pub date: String,
    /// WMO weather code.
    pub code: Option<i64>,
    pub t_max: Option<f64>,
    pub t_min: Option<f64>,
    pub precipitation_mm: Option<f64>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct WeatherResult {
    pub source: WeatherSource,
    pub days: Vec<DayWeather>,
}

/// One request to the service, decided from the dates and today.
#[derive(Debug, Clone, PartialEq)]
pub struct WeatherRequest {
    pub source: WeatherSource,
    pub lat: f64,
    pub lon: f64,
    /// Dates asked from the service (last year's for [`WeatherSource::LastYear`]).
    pub from: NaiveDate,
    pub to: NaiveDate,
}

impl WeatherRequest {
    fn cache_key(&self) -> String {
        format!("{:?}|{:.2}|{:.2}|{}|{}", self.source, self.lat, self.lon, self.from, self.to)
    }
}

fn date(field: &str, v: &str) -> CoreResult<NaiveDate> {
    NaiveDate::parse_from_str(v, "%Y-%m-%d").map_err(|_| CoreError::invalid(field, "expected YYYY-MM-DD"))
}

/// Chooses forecast, archive or last year for the trip dates, as seen from `today`.
pub fn plan(q: &WeatherQuery, today: NaiveDate) -> CoreResult<WeatherRequest> {
    if !(q.lat.is_finite() && q.lon.is_finite() && q.lat.abs() <= 90.0 && q.lon.abs() <= 180.0) {
        return Err(CoreError::invalid("coordinates", "out of range"));
    }
    let (from, to) = (date("from", &q.from)?, date("to", &q.to)?);
    if to < from || (to - from).num_days() >= MAX_DAYS {
        return Err(CoreError::invalid("to", "at most 31 days"));
    }
    // About 1 km: enough for the weather, and the exact address is not sent.
    let (lat, lon) = ((q.lat * 100.0).round() / 100.0, (q.lon * 100.0).round() / 100.0);
    let days = |n| chrono::Duration::days(n);
    let req = |source, from, to| WeatherRequest { source, lat, lon, from, to };
    Ok(if to <= today + days(FORECAST_AHEAD) && from >= today - days(FORECAST_BACK) {
        req(WeatherSource::Forecast, from, to)
    } else if to <= today - days(ARCHIVE_LAG) {
        req(WeatherSource::Observed, from, to)
    } else {
        let back = |d: NaiveDate| d.checked_sub_months(Months::new(12)).unwrap_or(d);
        req(WeatherSource::LastYear, back(from), back(to))
    })
}

impl Store {
    pub fn weather_enabled(&self) -> CoreResult<bool> {
        Ok(self.setting(ENABLED_SETTING)?.as_deref() == Some("1"))
    }

    pub fn today_utc(&self) -> NaiveDate {
        DateTime::parse_from_rfc3339(&self.now()).map(|t| t.with_timezone(&Utc).date_naive()).unwrap_or_else(|_| Utc::now().date_naive())
    }

    /// A cached answer, if it is still fresh (forecasts for a few hours, the past for good).
    pub fn cached_weather(&self, r: &WeatherRequest) -> CoreResult<Option<Vec<DayWeather>>> {
        let row: Option<(String, String)> = self
            .conn
            .query_row("SELECT days, fetched_at FROM weather_cache WHERE key = ?1", [r.cache_key()], |x| Ok((x.get(0)?, x.get(1)?)))
            .optional()?;
        let Some((days, fetched)) = row else { return Ok(None) };
        if r.source == WeatherSource::Forecast {
            let now = DateTime::parse_from_rfc3339(&self.now()).ok();
            let at = DateTime::parse_from_rfc3339(&fetched).ok();
            if !matches!((now, at), (Some(n), Some(a)) if n - a < FORECAST_FRESH) {
                return Ok(None);
            }
        }
        Ok(Some(serde_json::from_str(&days)?))
    }

    pub fn cache_weather(&self, r: &WeatherRequest, days: &[DayWeather]) -> CoreResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO weather_cache (key, days, fetched_at) VALUES (?1, ?2, ?3)",
            (r.cache_key(), serde_json::to_string(days)?, self.now()),
        )?;
        Ok(())
    }
}

/// Asks the service (blocking, spaced a little).
pub fn fetch(r: &WeatherRequest, user_agent: &str) -> CoreResult<Vec<DayWeather>> {
    static LAST: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(wait) = last.and_then(|t| MIN_INTERVAL.checked_sub(t.elapsed())) {
            std::thread::sleep(wait);
        }
        *last = Some(Instant::now());
    }
    let url = if r.source == WeatherSource::Forecast { FORECAST_URL } else { ARCHIVE_URL };
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(TIMEOUT)).user_agent(user_agent).build().into();
    let body = agent
        .get(url)
        .query("latitude", format!("{:.2}", r.lat))
        .query("longitude", format!("{:.2}", r.lon))
        .query("daily", DAILY)
        .query("timezone", "auto")
        .query("start_date", r.from.to_string())
        .query("end_date", r.to.to_string())
        .call()
        .and_then(|mut x| x.body_mut().read_to_string())
        .map_err(|e| CoreError::rule("online_failed", e.to_string()))?;
    parse(&body, r.source)
}

#[derive(Deserialize)]
struct Answer {
    daily: Daily,
}

#[derive(Deserialize)]
struct Daily {
    time: Vec<String>,
    weather_code: Vec<Option<f64>>,
    temperature_2m_max: Vec<Option<f64>>,
    temperature_2m_min: Vec<Option<f64>>,
    precipitation_sum: Vec<Option<f64>>,
}

/// Reads the daily values; last year's dates are moved to the trip days they stand for.
pub fn parse(body: &str, source: WeatherSource) -> CoreResult<Vec<DayWeather>> {
    let a: Answer =
        serde_json::from_str(body).map_err(|_| CoreError::rule("online_failed", "unexpected answer from the service"))?;
    let d = a.daily;
    let at = |v: &Vec<Option<f64>>, i: usize| v.get(i).copied().flatten();
    Ok(d.time
        .iter()
        .enumerate()
        .filter_map(|(i, day)| {
            let mut date = NaiveDate::parse_from_str(day, "%Y-%m-%d").ok()?;
            if source == WeatherSource::LastYear {
                date = date.checked_add_months(Months::new(12))?;
            }
            Some(DayWeather {
                date: date.to_string(),
                code: at(&d.weather_code, i).map(|c| c as i64),
                t_max: at(&d.temperature_2m_max, i),
                t_min: at(&d.temperature_2m_min, i),
                precipitation_mm: at(&d.precipitation_sum, i),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(from: &str, to: &str) -> WeatherQuery {
        WeatherQuery { lat: 41.14873, lon: -8.61099, from: from.into(), to: to.into() }
    }
    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn picks_the_source_from_the_dates() {
        let today = d("2027-06-01");
        let r = plan(&q("2027-06-10", "2027-06-14"), today).unwrap();
        assert_eq!((r.source, r.lat, r.lon), (WeatherSource::Forecast, 41.15, -8.61));
        let r = plan(&q("2027-08-10", "2027-08-14"), today).unwrap();
        assert_eq!((r.source, r.from, r.to), (WeatherSource::LastYear, d("2026-08-10"), d("2026-08-14")));
        let r = plan(&q("2026-08-10", "2026-08-14"), today).unwrap();
        assert_eq!(r.source, WeatherSource::Observed);
        let r = plan(&q("2028-02-29", "2028-03-01"), today).unwrap();
        assert_eq!((r.from, r.to), (d("2027-02-28"), d("2027-03-01")));
        assert!(plan(&q("2027-06-10", "2027-08-10"), today).is_err());
        assert!(plan(&WeatherQuery { lat: 91.0, ..q("2027-06-10", "2027-06-11") }, today).is_err());
    }

    #[test]
    fn parses_daily_values_and_moves_last_year_to_the_trip() {
        let body = r#"{"daily":{"time":["2026-08-10","2026-08-11"],"weather_code":[61,null],
            "temperature_2m_max":[24.3,26.0],"temperature_2m_min":[16.1,null],"precipitation_sum":[3.2,0.0]}}"#;
        let days = parse(body, WeatherSource::LastYear).unwrap();
        assert_eq!(days[0], DayWeather { date: "2027-08-10".into(), code: Some(61), t_max: Some(24.3), t_min: Some(16.1), precipitation_mm: Some(3.2) });
        assert_eq!((days[1].code, days[1].t_min), (None, None));
        assert!(parse("{}", WeatherSource::Forecast).is_err());
    }

    #[test]
    fn forecasts_are_cached_for_a_few_hours_only() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::for_tests(dir.path(), "2027-06-01T08:00:00Z").unwrap();
        assert!(!s.weather_enabled().unwrap());
        let r = plan(&q("2027-06-10", "2027-06-11"), s.today_utc()).unwrap();
        let days = vec![DayWeather { date: "2027-06-10".into(), code: Some(0), t_max: None, t_min: None, precipitation_mm: None }];
        s.cache_weather(&r, &days).unwrap();
        assert_eq!(s.cached_weather(&r).unwrap(), Some(days.clone()));
        s.set_now("2027-06-01T12:00:00Z");
        assert_eq!(s.cached_weather(&r).unwrap(), None);
        let past = plan(&q("2026-06-10", "2026-06-11"), s.today_utc()).unwrap();
        s.cache_weather(&past, &days).unwrap();
        s.set_now("2028-01-01T12:00:00Z");
        assert!(s.cached_weather(&past).unwrap().is_some());
    }

    /// Talks to Open-Meteo; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_weather_porto() {
        let r = plan(&q("2025-06-10", "2025-06-12"), d("2026-01-01")).unwrap();
        let days = fetch(&r, "TravelPlanner-tests").unwrap();
        assert_eq!(days.len(), 3);
        assert!(days.iter().all(|x| x.t_max.is_some()), "{days:?}");
    }
}
