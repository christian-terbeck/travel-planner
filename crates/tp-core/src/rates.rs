//! Euro reference rates of the European Central Bank, fetched only when the user enabled it.
//! They are stored like rates entered by hand (base EUR, dated, source "ECB"), so conversions
//! stay explicit about the rate and its date. Only the newest ECB rate per currency is kept;
//! rates entered by hand are never touched.

use std::time::Duration;

use crate::error::{CoreError, CoreResult};
use crate::model::ExchangeRate;
use crate::store::{Store, new_id};
use crate::table;
use crate::validate::Validate;

/// Setting that allows fetching the reference rates ("1" = on).
pub const ENABLED_SETTING: &str = "ecb_rates_enabled";
/// When the rates were last fetched successfully (UTC timestamp).
pub const FETCHED_SETTING: &str = "ecb_rates_fetched_at";
pub const URL: &str = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
pub const SOURCE: &str = "ECB";
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq)]
pub struct ReferenceRates {
    /// Day the rates refer to (YYYY-MM-DD).
    pub date: String,
    /// Currency and decimal rate: 1 EUR = rate.
    pub rates: Vec<(String, String)>,
}

/// Reads the daily XML (`<Cube time='…'>` with `<Cube currency='USD' rate='1.0825'/>` entries).
pub fn parse(xml: &str) -> CoreResult<ReferenceRates> {
    let attr = |tag: &str, name: &str| -> Option<String> {
        let start = tag.find(&format!("{name}="))? + name.len() + 1;
        let quote = tag[start..].chars().next()?;
        let rest = &tag[start + 1..];
        Some(rest[..rest.find(quote)?].to_string())
    };
    let mut date = None;
    let mut rates = Vec::new();
    for tag in xml.split('<').filter(|t| t.starts_with("Cube ")) {
        if let Some(t) = attr(tag, "time") {
            date = Some(t);
        }
        if let (Some(c), Some(r)) = (attr(tag, "currency"), attr(tag, "rate")) {
            rates.push((c, r));
        }
    }
    let invalid = || CoreError::rule("online_failed", "unexpected answer from the ECB");
    let date = date.ok_or_else(invalid)?;
    crate::validate::date("date", &date).map_err(|_| invalid())?;
    if rates.is_empty() {
        return Err(invalid());
    }
    Ok(ReferenceRates { date, rates })
}

pub fn fetch(user_agent: &str) -> CoreResult<ReferenceRates> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(TIMEOUT)).user_agent(user_agent).build().into();
    let body = agent
        .get(URL)
        .call()
        .and_then(|mut r| r.body_mut().read_to_string())
        .map_err(|e| CoreError::rule("online_failed", e.to_string()))?;
    parse(&body)
}

impl Store {
    pub fn ecb_rates_enabled(&self) -> CoreResult<bool> {
        Ok(self.setting(ENABLED_SETTING)?.as_deref() == Some("1"))
    }

    /// Adds the rates not stored yet for that day and drops older ECB rates of the same
    /// currencies; returns how many were added.
    pub fn store_reference_rates(&mut self, r: &ReferenceRates) -> CoreResult<usize> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let mut added = 0;
        for (quote, rate) in &r.rates {
            let exists: i64 = tx.query_row(
                "SELECT COUNT(*) FROM exchange_rates WHERE base = 'EUR' AND quote = ?1 AND as_of = ?2",
                (quote, &r.date),
                |row| row.get(0),
            )?;
            let row = ExchangeRate {
                id: new_id(),
                base: "EUR".into(),
                quote: quote.clone(),
                rate: rate.clone(),
                as_of: r.date.clone(),
                source: Some(SOURCE.into()),
                created_at: now.clone(),
            };
            // Unknown or malformed entries are skipped rather than failing the whole update.
            if exists == 0 && row.validate().is_ok() {
                table::insert(&tx, &row)?;
                tx.execute(
                    "DELETE FROM exchange_rates WHERE base = 'EUR' AND quote = ?1 AND source = ?2 AND as_of < ?3",
                    (quote, SOURCE, &r.date),
                )?;
                added += 1;
            }
        }
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (FETCHED_SETTING, &now),
        )?;
        tx.commit()?;
        Ok(added)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<Cube>
		<Cube time='2026-10-30'>
			<Cube currency='USD' rate='1.0825'/>
			<Cube currency='JPY' rate='163.42'/>
			<Cube currency='GBP' rate="0.8391"/>
		</Cube>
	</Cube>
</gesmes:Envelope>"#;

    #[test]
    fn parses_the_daily_file() {
        let r = parse(XML).unwrap();
        assert_eq!(r.date, "2026-10-30");
        assert_eq!(r.rates[0], ("USD".to_string(), "1.0825".to_string()));
        assert_eq!(r.rates.len(), 3);
        assert!(parse("<html>Service unavailable</html>").is_err());
    }

    #[test]
    fn stores_each_day_once() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::for_tests(dir.path(), "2026-11-01T12:00:00Z").unwrap();
        let mut r = parse(XML).unwrap();
        r.rates.push(("bad".into(), "x".into()));
        assert_eq!(store.store_reference_rates(&r).unwrap(), 3);
        assert_eq!(store.store_reference_rates(&r).unwrap(), 0);
        let info = store.app_info().unwrap();
        assert_eq!(info.exchange_rates.len(), 3);
        assert!(info.exchange_rates.iter().all(|x| x.source.as_deref() == Some(SOURCE) && x.base == "EUR"));
        assert_eq!(store.setting(FETCHED_SETTING).unwrap().as_deref(), Some("2026-11-01T12:00:00Z"));

        // The next day replaces older ECB rates but keeps rates entered by hand.
        let manual = ExchangeRate {
            id: new_id(),
            base: "EUR".into(),
            quote: "USD".into(),
            rate: "1.1".into(),
            as_of: "2026-10-01".into(),
            source: Some("Bank".into()),
            created_at: "2026-10-01T00:00:00Z".into(),
        };
        store.save(crate::store::Entity::ExchangeRate(manual)).unwrap();
        r.date = "2026-11-02".into();
        assert_eq!(store.store_reference_rates(&r).unwrap(), 3);
        let rates = store.app_info().unwrap().exchange_rates;
        assert_eq!(rates.iter().filter(|x| x.source.as_deref() == Some(SOURCE)).count(), 3);
        assert!(rates.iter().all(|x| x.source.as_deref() != Some(SOURCE) || x.as_of == "2026-11-02"));
        assert!(rates.iter().any(|x| x.source.as_deref() == Some("Bank")));
    }

    /// Talks to the ECB; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_reference_rates() {
        let r = fetch("TravelPlanner-tests").unwrap();
        assert!(r.rates.iter().any(|(c, _)| c == "USD"), "{r:?}");
    }
}
