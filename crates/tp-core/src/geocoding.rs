//! Address search with a Nominatim-compatible service (by default the public OpenStreetMap
//! server). Only used when the user enabled it and only on an explicit search; answers are cached
//! in the database, so the same text is never asked twice.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{CoreError, CoreResult};
use crate::store::Store;
use crate::validate;

/// Setting that allows sending search texts to the service ("1" = on).
pub const ENABLED_SETTING: &str = "geocoding_enabled";
/// Setting with the service's base URL (the part before `/search`).
pub const URL_SETTING: &str = "geocoding_url";
pub const DEFAULT_URL: &str = "https://nominatim.openstreetmap.org";
const MAX_RESULTS: usize = 5;

/// The public server allows at most one request per second.
const MIN_INTERVAL: Duration = Duration::from_millis(1100);
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Place {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone)]
pub struct GeocodingConfig {
    pub enabled: bool,
    pub url: String,
}

/// Normalised search text, also the cache key.
pub fn normalize(query: &str) -> CoreResult<String> {
    let q = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if q.chars().count() < 3 || q.len() > 300 {
        return Err(CoreError::invalid("query", "enter an address or place"));
    }
    Ok(q)
}

impl Store {
    pub fn geocoding_config(&self) -> CoreResult<GeocodingConfig> {
        Ok(GeocodingConfig {
            enabled: self.setting(ENABLED_SETTING)?.as_deref() == Some("1"),
            url: self.setting(URL_SETTING)?.filter(|u| !u.trim().is_empty()).unwrap_or_else(|| DEFAULT_URL.to_string()),
        })
    }

    pub fn cached_places(&self, service: &str, query: &str, language: &str) -> CoreResult<Option<Vec<Place>>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT results FROM geocode_cache WHERE service = ?1 AND query = ?2 AND language = ?3",
                (service, query.to_lowercase(), language),
                |r| r.get(0),
            )
            .optional()?;
        Ok(json.map(|j| serde_json::from_str(&j)).transpose()?)
    }

    pub fn cache_places(&self, service: &str, query: &str, language: &str, places: &[Place]) -> CoreResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO geocode_cache (service, query, language, results, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (service, query.to_lowercase(), language, serde_json::to_string(places)?, self.now()),
        )?;
        Ok(())
    }
}

/// Searches the service (blocking, spaced to respect the usage policy).
pub fn fetch(service: &str, query: &str, language: &str, user_agent: &str) -> CoreResult<Vec<Place>> {
    validate::url("geocoding_url", service)?;
    static LAST: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(wait) = last.and_then(|t| MIN_INTERVAL.checked_sub(t.elapsed())) {
            std::thread::sleep(wait);
        }
        *last = Some(Instant::now());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(TIMEOUT)).user_agent(user_agent).build().into();
    let body = agent
        .get(format!("{}/search", service.trim_end_matches('/')))
        .query("q", query)
        .query("format", "jsonv2")
        .query("limit", MAX_RESULTS.to_string())
        .header("Accept-Language", language)
        .call()
        .and_then(|mut r| r.body_mut().read_to_string())
        .map_err(|e| CoreError::rule("online_failed", e.to_string()))?;
    parse(&body)
}

#[derive(Deserialize)]
struct NominatimPlace {
    display_name: String,
    lat: String,
    lon: String,
}

pub fn parse(body: &str) -> CoreResult<Vec<Place>> {
    let raw: Vec<NominatimPlace> =
        serde_json::from_str(body).map_err(|_| CoreError::rule("online_failed", "unexpected answer from the service"))?;
    Ok(raw
        .into_iter()
        .filter_map(|p| {
            let (lat, lon) = (p.lat.parse::<f64>().ok()?, p.lon.parse::<f64>().ok()?);
            (lat.abs() <= 90.0 && lon.abs() <= 180.0).then_some(Place { name: p.display_name, lat, lon })
        })
        .take(MAX_RESULTS)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_places_and_skips_broken_ones() {
        let body = r#"[
            {"place_id": 1, "display_name": "Porto Campanhã, Porto, Portugal", "lat": "41.1487", "lon": "-8.5853"},
            {"display_name": "Nowhere", "lat": "abc", "lon": "1"}
        ]"#;
        assert_eq!(
            parse(body).unwrap(),
            vec![Place { name: "Porto Campanhã, Porto, Portugal".into(), lat: 41.1487, lon: -8.5853 }]
        );
        assert!(parse("<html>").is_err());
    }

    #[test]
    fn normalizes_queries_and_caches_per_language() {
        assert_eq!(normalize("  Rua  das Flores 12,\nPorto ").unwrap(), "Rua das Flores 12, Porto");
        assert!(normalize("ab").is_err());
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_tests(dir.path(), "2026-11-01T12:00:00Z").unwrap();
        let c = store.geocoding_config().unwrap();
        assert!(!c.enabled);
        assert_eq!(c.url, DEFAULT_URL);
        let places = vec![Place { name: "Lisboa".into(), lat: 38.7, lon: -9.1 }];
        store.cache_places(DEFAULT_URL, "Lisboa", "de", &places).unwrap();
        assert_eq!(store.cached_places(DEFAULT_URL, "lisboa", "de").unwrap(), Some(places));
        assert_eq!(store.cached_places(DEFAULT_URL, "lisboa", "en").unwrap(), None);
    }

    /// Talks to the public server; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_search_porto_campanha() {
        let places = fetch(DEFAULT_URL, "Estação de Campanhã, Porto", "en", "TravelPlanner-tests").unwrap();
        assert!(places.iter().any(|p| (41.1..41.2).contains(&p.lat)), "{places:?}");
    }
}
