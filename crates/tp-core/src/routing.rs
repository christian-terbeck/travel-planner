//! Road routes from an OSRM-compatible route service (by default the free FOSSGIS server behind
//! openstreetmap.org). Only used when the user enabled it; answers are cached in the database,
//! so each leg is requested once and the map keeps working offline afterwards.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{CoreError, CoreResult};
use crate::store::Store;
use crate::validate;

/// Setting that allows sending route points to the service ("1" = on).
pub const ENABLED_SETTING: &str = "routing_enabled";
/// Setting with the service's base URL (the part before `/route/v1/...`).
pub const URL_SETTING: &str = "routing_url";
pub const DEFAULT_URL: &str = "https://routing.openstreetmap.de/routed-car";
/// Upper bound per request from the UI; a trip has far fewer ground legs.
pub const MAX_QUERIES: usize = 200;

/// The public servers allow at most one request per second.
const MIN_INTERVAL: Duration = Duration::from_millis(1100);
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, TS)]
#[ts(export)]
pub struct RoadQuery {
    pub from_lat: f64,
    pub from_lon: f64,
    pub to_lat: f64,
    pub to_lon: f64,
}

impl RoadQuery {
    /// Rounded to 5 decimals (~1 m), the precision used as cache key.
    fn rounded(self) -> Self {
        let r = |v: f64| (v * 1e5).round() / 1e5;
        Self { from_lat: r(self.from_lat), from_lon: r(self.from_lon), to_lat: r(self.to_lat), to_lon: r(self.to_lon) }
    }

    fn validate(&self) -> CoreResult<()> {
        let ok = |lat: f64, lon: f64| lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0;
        if ok(self.from_lat, self.from_lon) && ok(self.to_lat, self.to_lon) {
            Ok(())
        } else {
            Err(CoreError::invalid("coordinates", "out of range"))
        }
    }
}

/// Result for one leg. `path` is a simplified line as `[lon, lat]` pairs.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export)]
pub enum RoadResult {
    Found {
        distance_m: f64,
        duration_s: f64,
        path: Vec<[f64; 2]>,
    },
    /// The service answered but knows no road between the points (e.g. across the sea).
    NoRoute,
    /// The service could not be reached or answered with an error; asked again next time.
    Failed {
        message: String,
    },
}

#[derive(Debug, Clone)]
pub struct RoutingConfig {
    pub enabled: bool,
    pub url: String,
}

impl Store {
    pub fn routing_config(&self) -> CoreResult<RoutingConfig> {
        let get = |key: &str| -> CoreResult<Option<String>> {
            Ok(self.conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()?)
        };
        Ok(RoutingConfig {
            enabled: get(ENABLED_SETTING)?.as_deref() == Some("1"),
            url: get(URL_SETTING)?.filter(|u| !u.trim().is_empty()).unwrap_or_else(|| DEFAULT_URL.to_string()),
        })
    }

    /// Cached answers in query order; `None` where the leg has not been asked yet.
    pub fn cached_roads(&self, service: &str, queries: &[RoadQuery]) -> CoreResult<Vec<Option<RoadResult>>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT distance_m, duration_s, path FROM road_routes
             WHERE service = ?1 AND from_lat = ?2 AND from_lon = ?3 AND to_lat = ?4 AND to_lon = ?5",
        )?;
        queries
            .iter()
            .map(|q| {
                let q = q.rounded();
                let row: Option<(Option<f64>, Option<f64>, String)> = stmt
                    .query_row((service, q.from_lat, q.from_lon, q.to_lat, q.to_lon), |r| {
                        Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                    })
                    .optional()?;
                Ok(match row {
                    None => None,
                    Some((Some(distance_m), duration_s, path)) => Some(RoadResult::Found {
                        distance_m,
                        duration_s: duration_s.unwrap_or(0.0),
                        path: serde_json::from_str(&path)?,
                    }),
                    Some((None, _, _)) => Some(RoadResult::NoRoute),
                })
            })
            .collect()
    }

    /// Remembers a definite answer. Failures are not cached.
    pub fn cache_road(&self, service: &str, query: RoadQuery, result: &RoadResult) -> CoreResult<()> {
        let (distance, duration, path) = match result {
            RoadResult::Found { distance_m, duration_s, path } => {
                (Some(*distance_m), Some(*duration_s), serde_json::to_string(path)?)
            }
            RoadResult::NoRoute => (None, None, "[]".to_string()),
            RoadResult::Failed { .. } => return Ok(()),
        };
        let q = query.rounded();
        self.conn.execute(
            "INSERT OR REPLACE INTO road_routes
             (service, from_lat, from_lon, to_lat, to_lon, distance_m, duration_s, path, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (service, q.from_lat, q.from_lon, q.to_lat, q.to_lon, distance, duration, path, self.now()),
        )?;
        Ok(())
    }

    pub fn clear_road_cache(&self) -> CoreResult<usize> {
        Ok(self.conn.execute("DELETE FROM road_routes", [])?)
    }
}

pub fn validate_queries(service: &str, queries: &[RoadQuery]) -> CoreResult<()> {
    validate::url("routing_url", service)?;
    if queries.len() > MAX_QUERIES {
        return Err(CoreError::invalid("queries", "too many legs"));
    }
    queries.iter().try_for_each(RoadQuery::validate)
}

/// Asks the service for one leg (blocking, spaced to respect the usage policy).
pub fn fetch(service: &str, query: RoadQuery, user_agent: &str) -> RoadResult {
    static LAST: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(wait) = last.and_then(|t| MIN_INTERVAL.checked_sub(t.elapsed())) {
            std::thread::sleep(wait);
        }
        *last = Some(Instant::now());
    }
    let q = query.rounded();
    let url = format!(
        "{}/route/v1/driving/{},{};{},{}?overview=simplified&geometries=geojson&steps=false&alternatives=false",
        service.trim_end_matches('/'),
        q.from_lon,
        q.from_lat,
        q.to_lon,
        q.to_lat
    );
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .user_agent(user_agent)
        // OSRM reports "no route" as HTTP 400 with a JSON body.
        .http_status_as_error(false)
        .build()
        .into();
    let body = agent.get(&url).call().and_then(|mut r| {
        let status = r.status().as_u16();
        r.body_mut().read_to_string().map(|b| (status, b))
    });
    match body {
        Ok((status, body)) => parse(status, &body),
        Err(e) => RoadResult::Failed { message: e.to_string() },
    }
}

#[derive(Deserialize)]
struct OsrmResponse {
    code: String,
    message: Option<String>,
    #[serde(default)]
    routes: Vec<OsrmRoute>,
}

#[derive(Deserialize)]
struct OsrmRoute {
    distance: f64,
    duration: f64,
    geometry: OsrmGeometry,
}

#[derive(Deserialize)]
struct OsrmGeometry {
    coordinates: Vec<[f64; 2]>,
}

/// Interprets an OSRM `route` response.
pub fn parse(status: u16, body: &str) -> RoadResult {
    let Ok(res) = serde_json::from_str::<OsrmResponse>(body) else {
        return RoadResult::Failed { message: format!("HTTP {status}: unexpected response") };
    };
    match (res.code.as_str(), res.routes.into_iter().next()) {
        ("Ok", Some(r)) => {
            RoadResult::Found { distance_m: r.distance, duration_s: r.duration, path: r.geometry.coordinates }
        }
        ("Ok", None) | ("NoRoute" | "NoSegment", _) => RoadResult::NoRoute,
        (code, _) => RoadResult::Failed {
            message: format!("HTTP {status}: {code} {}", res.message.unwrap_or_default()).trim_end().to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LISBON_PORTO: RoadQuery =
        RoadQuery { from_lat: 38.722306, from_lon: -9.139301, to_lat: 41.157944, to_lon: -8.629105 };

    #[test]
    fn parses_found_route() {
        let body = r#"{"code":"Ok","routes":[{"legs":[],"weight":1,"duration":12378.6,"distance":314216,
            "geometry":{"type":"LineString","coordinates":[[-9.1393,38.7223],[-8.6291,41.1579]]}}],"waypoints":[]}"#;
        assert_eq!(
            parse(200, body),
            RoadResult::Found {
                distance_m: 314216.0,
                duration_s: 12378.6,
                path: vec![[-9.1393, 38.7223], [-8.6291, 41.1579]]
            }
        );
    }

    #[test]
    fn parses_no_route_and_errors() {
        assert_eq!(
            parse(400, r#"{"code":"NoRoute","message":"Impossible route between points"}"#),
            RoadResult::NoRoute
        );
        assert_eq!(
            parse(429, r#"{"code":"TooBig","message":"Too many"}"#),
            RoadResult::Failed { message: "HTTP 429: TooBig Too many".into() }
        );
        assert!(matches!(parse(502, "<html>Bad gateway</html>"), RoadResult::Failed { .. }));
    }

    #[test]
    fn caches_answers_but_not_failures() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_tests(dir.path(), "2026-10-31T12:00:00Z").unwrap();
        let svc = DEFAULT_URL;
        let found =
            RoadResult::Found { distance_m: 314216.0, duration_s: 12378.6, path: vec![[-9.1, 38.7], [-8.6, 41.2]] };
        let other = RoadQuery { from_lat: 37.0, from_lon: -8.0, to_lat: 36.0, to_lon: -5.0 };
        let failed = RoadQuery { from_lat: 1.0, from_lon: 1.0, to_lat: 2.0, to_lon: 2.0 };
        store.cache_road(svc, LISBON_PORTO, &found).unwrap();
        store.cache_road(svc, other, &RoadResult::NoRoute).unwrap();
        store.cache_road(svc, failed, &RoadResult::Failed { message: "offline".into() }).unwrap();

        // A point a few centimetres away hits the same cache entry.
        let nearby = RoadQuery { from_lat: LISBON_PORTO.from_lat + 1e-7, ..LISBON_PORTO };
        let got = store.cached_roads(svc, &[nearby, other, failed]).unwrap();
        assert_eq!(got, vec![Some(found), Some(RoadResult::NoRoute), None]);
        assert_eq!(store.cached_roads("https://other.example", &[LISBON_PORTO]).unwrap(), vec![None]);
        assert_eq!(store.clear_road_cache().unwrap(), 2);
    }

    #[test]
    fn config_defaults_to_disabled_public_server() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::for_tests(dir.path(), "2026-10-31T12:00:00Z").unwrap();
        let c = store.routing_config().unwrap();
        assert!(!c.enabled);
        assert_eq!(c.url, DEFAULT_URL);
        store.set_setting(ENABLED_SETTING, Some("1")).unwrap();
        store.set_setting(URL_SETTING, Some("https://router.example/osrm")).unwrap();
        let c = store.routing_config().unwrap();
        assert!(c.enabled);
        assert_eq!(c.url, "https://router.example/osrm");
    }

    #[test]
    fn rejects_bad_queries() {
        assert!(validate_queries(DEFAULT_URL, &[LISBON_PORTO]).is_ok());
        assert!(validate_queries("ftp://x", &[LISBON_PORTO]).is_err());
        let bad = RoadQuery { from_lat: 91.0, ..LISBON_PORTO };
        assert!(validate_queries(DEFAULT_URL, &[bad]).is_err());
        assert!(validate_queries(DEFAULT_URL, &vec![LISBON_PORTO; MAX_QUERIES + 1]).is_err());
    }

    /// Talks to the public server; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_route_lisbon_porto() {
        match fetch(DEFAULT_URL, LISBON_PORTO, "TravelPlanner-tests") {
            RoadResult::Found { distance_m, duration_s, path } => {
                assert!((280_000.0..360_000.0).contains(&distance_m), "{distance_m}");
                assert!(duration_s > 7_200.0 && path.len() > 2);
            }
            other => panic!("{other:?}"),
        }
    }
}
