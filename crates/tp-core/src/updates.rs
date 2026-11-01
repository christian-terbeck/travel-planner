//! Looks for a newer version among the GitHub releases of the project. Nothing is downloaded or
//! installed here: the UI points to the release page, so no signing keys are needed.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{CoreError, CoreResult};

/// Setting that allows checking for updates when the app starts ("1" = on).
pub const ENABLED_SETTING: &str = "update_check_enabled";
/// When the last check ran (UTC timestamp).
pub const CHECKED_SETTING: &str = "update_checked_at";
/// A version the user chose not to be told about again.
pub const SKIPPED_SETTING: &str = "update_skipped";
const LATEST_URL: &str = "https://api.github.com/repos/christian-terbeck/travel-planner/releases/latest";
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_NOTES: usize = 4000;

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export)]
pub struct Release {
    pub version: String,
    pub page_url: String,
    pub published_at: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct UpdateCheck {
    pub current: String,
    /// The latest published release, if there is one.
    pub latest: Option<Release>,
    pub newer: bool,
}

/// `1.2.10` > `1.2.9`; a leading `v` and anything after `-` or `+` are ignored.
pub fn is_newer(candidate: &str, current: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        v.trim_start_matches('v')
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    let (a, b) = (parts(candidate), parts(current));
    (0..a.len().max(b.len())).map(|i| (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0))).find(|(x, y)| x != y).is_some_and(|(x, y)| x > y)
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
    body: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

pub fn parse(body: &str) -> CoreResult<Option<Release>> {
    let r: GithubRelease =
        serde_json::from_str(body).map_err(|_| CoreError::rule("online_failed", "unexpected answer from GitHub"))?;
    if r.draft || r.prerelease || !r.html_url.starts_with("https://github.com/") {
        return Ok(None);
    }
    Ok(Some(Release {
        version: r.tag_name.trim_start_matches('v').to_string(),
        page_url: r.html_url,
        published_at: r.published_at,
        notes: r.body.map(|b| b.chars().take(MAX_NOTES).collect()),
    }))
}

/// Asks GitHub for the latest release (blocking).
pub fn check(current: &str, user_agent: &str) -> CoreResult<UpdateCheck> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .user_agent(user_agent)
        .http_status_as_error(false)
        .build()
        .into();
    let mut answer = agent
        .get(LATEST_URL)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| CoreError::rule("online_failed", e.to_string()))?;
    let latest = match answer.status().as_u16() {
        // No release published yet.
        404 => None,
        200 => parse(&answer.body_mut().read_to_string().map_err(|e| CoreError::rule("online_failed", e.to_string()))?)?,
        s => return Err(CoreError::rule("online_failed", format!("GitHub answered {s}"))),
    };
    let newer = latest.as_ref().is_some_and(|l| is_newer(&l.version, current));
    Ok(UpdateCheck { current: current.to_string(), latest, newer })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.1.10", "0.1.9"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(is_newer("0.2", "0.1.5"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0-beta", "0.1.0"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn reads_a_release_and_ignores_drafts_and_foreign_links() {
        let body = r#"{"tag_name":"v0.2.0","html_url":"https://github.com/christian-terbeck/travel-planner/releases/tag/v0.2.0",
            "published_at":"2026-12-01T10:00:00Z","body":"Packing lists","draft":false,"prerelease":false}"#;
        let r = parse(body).unwrap().unwrap();
        assert_eq!((r.version.as_str(), r.notes.as_deref()), ("0.2.0", Some("Packing lists")));
        assert_eq!(parse(&body.replace("\"draft\":false", "\"draft\":true")).unwrap(), None);
        assert_eq!(parse(&body.replace("https://github.com/", "https://evil.example/")).unwrap(), None);
        assert!(parse("[]").is_err());
    }

    /// Talks to GitHub; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_update_check() {
        let c = check("0.0.1", "TravelPlanner-tests").unwrap();
        assert_eq!(c.newer, c.latest.is_some());
    }
}
