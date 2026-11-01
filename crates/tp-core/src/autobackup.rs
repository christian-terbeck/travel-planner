//! Automatic backups: once a day, when something changed, a full backup is written to a folder
//! the user chose (e.g. one synced by OneDrive), keeping the newest few.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, Utc};

use crate::error::{CoreError, CoreResult};
use crate::store::Store;

/// Target folder; no folder means automatic backups are off.
pub const DIR_SETTING: &str = "auto_backup_dir";
/// How many automatic backups are kept (default [`DEFAULT_KEEP`]).
pub const KEEP_SETTING: &str = "auto_backup_keep";
/// When the last automatic backup was written (UTC timestamp).
pub const LAST_SETTING: &str = "auto_backup_last";
/// Error of the last attempt (a rule code or a message), cleared by the next success.
pub const ERROR_SETTING: &str = "auto_backup_error";
/// What the data looked like at the last backup, to skip days without changes.
const STATE_SETTING: &str = "auto_backup_state";

pub const DEFAULT_KEEP: usize = 10;
const PREFIX: &str = "travel-planner-auto-";
/// A little less than a day, so a PC started at roughly the same time each day still backs up.
const INTERVAL: Duration = Duration::hours(20);

impl Store {
    fn data_state(&self) -> CoreResult<String> {
        Ok(self.conn.query_row(
            "SELECT (SELECT COUNT(*) FROM trips) || ':' || IFNULL((SELECT MAX(updated_at) FROM trips), '')
                    || ':' || (SELECT COUNT(*) FROM documents) || ':' || (SELECT COUNT(*) FROM exchange_rates)",
            [],
            |r| r.get(0),
        )?)
    }

    fn auto_backup_dir(&self) -> CoreResult<Option<PathBuf>> {
        Ok(self.setting(DIR_SETTING)?.filter(|d| !d.trim().is_empty()).map(PathBuf::from))
    }

    /// Writes an automatic backup if one is due (or `force`), and returns its path. Failures are
    /// also kept in [`ERROR_SETTING`] so the settings page can show them.
    pub fn run_auto_backup(&mut self, force: bool) -> CoreResult<Option<String>> {
        let result = self.auto_backup(force);
        match &result {
            Ok(Some(_)) => self.set_setting(ERROR_SETTING, None)?,
            Ok(None) => {}
            // Rule codes are translated by the UI; other errors are shown as they are.
            Err(CoreError::Rule { code, .. }) => self.set_setting(ERROR_SETTING, Some(code))?,
            Err(e) => self.set_setting(ERROR_SETTING, Some(&e.to_string()))?,
        }
        result
    }

    fn auto_backup(&mut self, force: bool) -> CoreResult<Option<String>> {
        let Some(dir) = self.auto_backup_dir()? else {
            return if force { Err(CoreError::rule("backup_folder_missing", "no backup folder chosen")) } else { Ok(None) };
        };
        let now = self.now();
        let state = self.data_state()?;
        if !force {
            let last = self.setting(LAST_SETTING)?.and_then(|l| DateTime::parse_from_rfc3339(&l).ok());
            let now_t = DateTime::parse_from_rfc3339(&now).map(|t| t.with_timezone(&Utc)).unwrap_or_else(|_| Utc::now());
            if last.is_some_and(|l| now_t - l.with_timezone(&Utc) < INTERVAL) {
                return Ok(None);
            }
            if self.setting(STATE_SETTING)?.as_deref() == Some(state.as_str()) {
                return Ok(None);
            }
        }
        if !dir.is_absolute() || !dir.is_dir() {
            return Err(CoreError::rule("backup_folder_missing", format!("{} is not an existing folder", dir.display())));
        }
        let stamp: String = now.chars().filter(|c| c.is_ascii_digit()).take(14).collect();
        let target = dir.join(format!("{PREFIX}{}-{}.zip", &stamp[..8.min(stamp.len())], &stamp[8.min(stamp.len())..]));
        self.create_backup(&target)?;
        self.set_setting(LAST_SETTING, Some(&now))?;
        self.set_setting(STATE_SETTING, Some(&state))?;
        let keep = self.setting(KEEP_SETTING)?.and_then(|k| k.parse().ok()).unwrap_or(DEFAULT_KEEP).max(1);
        prune(&dir, keep)?;
        Ok(Some(target.display().to_string()))
    }
}

/// Deletes the oldest automatic backups beyond `keep`. Other files in the folder are not touched.
fn prune(dir: &Path, keep: usize) -> CoreResult<()> {
    let mut names: Vec<String> = fs::read_dir(dir)?
        .flatten()
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with(PREFIX) && n.ends_with(".zip"))
        .collect();
    // The timestamp in the name sorts chronologically.
    names.sort();
    let excess = names.len().saturating_sub(keep);
    for n in &names[..excess] {
        fs::remove_file(dir.join(n))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Trip;
    use crate::store::{Entity, new_id};

    fn add_trip(s: &mut Store) {
        let id = new_id();
        let mut t: Trip = serde_json::from_value(serde_json::json!({
            "id": id, "title": "Trip", "description": null, "destination": null, "status_override": null,
            "earliest_departure": null, "latest_return": null, "preferred_start": null, "preferred_end": null,
            "preferred_month": null, "min_nights": null, "max_nights": null, "home_airports": null,
            "budget_target_minor": null, "budget_max_minor": null, "currency": "EUR", "travel_style": null,
            "notes": null, "arrival_buffer_min": 60, "departure_buffer_min": 120,
            "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-01T00:00:00Z"
        }))
        .unwrap();
        t.title = format!("Trip {id}");
        s.save(Entity::Trip(t)).unwrap();
    }

    fn backups(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        v.sort();
        v
    }

    #[test]
    fn backs_up_once_per_day_only_after_changes_and_keeps_the_newest() {
        let data = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let mut s = Store::for_tests(data.path(), "2026-11-01T08:00:00Z").unwrap();
        assert_eq!(s.run_auto_backup(false).unwrap(), None, "off without a folder");

        s.set_setting(DIR_SETTING, Some(&target.path().display().to_string())).unwrap();
        s.set_setting(KEEP_SETTING, Some("2")).unwrap();
        fs::write(target.path().join("other.zip"), b"mine").unwrap();
        add_trip(&mut s);
        let first = s.run_auto_backup(false).unwrap().unwrap();
        assert!(first.ends_with("travel-planner-auto-20261101-080000.zip"));
        assert_eq!(s.run_auto_backup(false).unwrap(), None, "not again on the same day");

        for now in ["2026-11-02T07:00:00Z", "2026-11-03T07:00:00Z"] {
            s.set_now(now);
            add_trip(&mut s);
            assert!(s.run_auto_backup(false).unwrap().is_some(), "{now}");
        }
        s.set_now("2026-11-05T07:00:00Z");
        assert_eq!(s.run_auto_backup(false).unwrap(), None, "nothing changed");

        let files = backups(target.path());
        assert!(files.contains(&"other.zip".to_string()), "other files stay");
        let auto: Vec<&String> = files.iter().filter(|f| f.starts_with(PREFIX)).collect();
        assert_eq!(auto, ["travel-planner-auto-20261102-070000.zip", "travel-planner-auto-20261103-070000.zip"]);
    }

    #[test]
    fn a_missing_folder_is_reported_and_kept_as_error() {
        let data = tempfile::tempdir().unwrap();
        let mut s = Store::for_tests(data.path(), "2026-11-01T08:00:00Z").unwrap();
        let gone = data.path().join("gone");
        s.set_setting(DIR_SETTING, Some(&gone.display().to_string())).unwrap();
        add_trip(&mut s);
        assert!(s.run_auto_backup(false).is_err());
        assert!(s.setting(ERROR_SETTING).unwrap().is_some());
        fs::create_dir(&gone).unwrap();
        assert!(s.run_auto_backup(true).unwrap().is_some());
        assert_eq!(s.setting(ERROR_SETTING).unwrap(), None);
    }
}
