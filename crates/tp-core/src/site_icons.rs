//! Website icons of known providers (the logo a site names in its `<link rel="icon">`), for brands
//! that have no bundled logo. Only used when the user enabled it: the provider's home page and its
//! icon are fetched once, and the image is kept as a data URI. A site without a usable icon is
//! asked again after a while.

use std::time::Duration;

use base64::Engine;
use rusqlite::OptionalExtension;
use ureq::ResponseExt;

use crate::error::CoreResult;
use crate::store::Store;
use crate::validate;

/// Setting that allows fetching icons from provider websites ("1" = on).
pub const ENABLED_SETTING: &str = "site_icons_enabled";
const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_PAGE: u64 = 1024 * 1024;
const MAX_ICON: u64 = 256 * 1024;
const RETRY_MISSING: chrono::Duration = chrono::Duration::days(30);

impl Store {
    pub fn site_icons_enabled(&self) -> CoreResult<bool> {
        Ok(self.setting(ENABLED_SETTING)?.as_deref() == Some("1"))
    }

    /// `Some(None)` is a site known to have no usable icon (until it is due to be asked again).
    pub fn cached_site_icon(&self, site: &str) -> CoreResult<Option<Option<String>>> {
        let row: Option<(Option<String>, String)> = self
            .conn
            .query_row("SELECT data_uri, fetched_at FROM site_icons WHERE site = ?1", [site], |x| Ok((x.get(0)?, x.get(1)?)))
            .optional()?;
        let Some((icon, fetched)) = row else { return Ok(None) };
        if icon.is_none() {
            let now = chrono::DateTime::parse_from_rfc3339(&self.now()).ok();
            let at = chrono::DateTime::parse_from_rfc3339(&fetched).ok();
            if !matches!((now, at), (Some(n), Some(a)) if n - a < RETRY_MISSING) {
                return Ok(None);
            }
        }
        Ok(Some(icon))
    }

    pub fn cache_site_icon(&self, site: &str, icon: Option<&str>) -> CoreResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO site_icons (site, data_uri, fetched_at) VALUES (?1, ?2, ?3)",
            (site, icon, self.now()),
        )?;
        Ok(())
    }

    pub fn clear_site_icons(&self) -> CoreResult<usize> {
        Ok(self.conn.execute("DELETE FROM site_icons", [])?)
    }
}

/// The icon of a website as a data URI, or `None` when it names none that can be shown.
pub fn fetch(site: &str, user_agent: &str) -> CoreResult<Option<String>> {
    validate::url("url", site)?;
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(TIMEOUT)).user_agent(user_agent).build().into();
    let mut candidates = Vec::new();
    // A site that refuses the page may still serve its icon.
    if let Ok(mut page) = agent.get(site).header("Accept", "text/html").call() {
        let base = page.get_uri().to_string();
        if let Ok(html) = page.body_mut().with_config().limit(MAX_PAGE).lossy_utf8(true).read_to_string() {
            candidates = icon_links(&html).into_iter().filter_map(|href| resolve(&base, &href)).collect();
        }
    }
    if let Some(root) = resolve(site, "/favicon.ico") {
        candidates.push(root);
    }
    for url in candidates {
        let Ok(mut answer) = agent.get(&url).call() else { continue };
        let Ok(bytes) = answer.body_mut().with_config().limit(MAX_ICON).read_to_vec() else { continue };
        if let Some(mime) = sniff(&bytes) {
            return Ok(Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))));
        }
    }
    Ok(None)
}

/// Icon links of a page, the most promising first: touch icons (large, opaque), then by size.
pub fn icon_links(html: &str) -> Vec<String> {
    let mut found: Vec<(i64, String)> = Vec::new();
    let lower = html.to_ascii_lowercase();
    let mut at = 0;
    while let Some(start) = lower[at..].find("<link").map(|i| at + i) {
        let end = lower[start..].find('>').map_or(lower.len(), |i| start + i);
        let (tag, tag_lower) = (&html[start..end], &lower[start..end]);
        at = end;
        let Some(rel) = attr(tag_lower, tag_lower, "rel") else { continue };
        let Some(href) = attr(tag, tag_lower, "href") else { continue };
        let rels: Vec<&str> = rel.split_whitespace().collect();
        let score = if rels.contains(&"apple-touch-icon") || rels.contains(&"apple-touch-icon-precomposed") {
            1000
        } else if rels.contains(&"icon") {
            let size = attr(tag_lower, tag_lower, "sizes")
                .and_then(|s| s.split(['x', ' ']).next().and_then(|n| n.parse::<i64>().ok()))
                .unwrap_or(if href.to_ascii_lowercase().ends_with(".svg") { 512 } else { 16 });
            size.min(512)
        } else {
            continue;
        };
        if !href.is_empty() && !href.starts_with("data:") {
            found.push((score, decode_entities(&href)));
        }
    }
    found.sort_by_key(|f| std::cmp::Reverse(f.0));
    found.into_iter().map(|(_, href)| href).collect()
}

/// Value of an attribute (quoted or not) in a tag; names are matched in the lower-case copy.
fn attr(tag: &str, tag_lower: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(i) = tag_lower[from..].find(name).map(|i| from + i) {
        from = i + name.len();
        let before_ok = tag_lower[..i].ends_with(|c: char| c.is_whitespace());
        let rest = tag_lower[from..].trim_start();
        if !before_ok || !rest.starts_with('=') {
            continue;
        }
        let value_at = tag.len() - rest.len() + 1;
        let value = tag[value_at..].trim_start();
        let (quote, body) = match value.chars().next() {
            Some(q @ ('"' | '\'')) => (Some(q), &value[1..]),
            _ => (None, value),
        };
        let len = match quote {
            Some(q) => body.find(q)?,
            None => body.find(char::is_whitespace).unwrap_or(body.len()),
        };
        return Some(body[..len].trim().to_string());
    }
    None
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&").replace("&#x2F;", "/").replace("&#47;", "/")
}

/// Resolves a link against the page it was found on (absolute, `//host`, `/path` or relative).
pub fn resolve(base: &str, href: &str) -> Option<String> {
    let href = href.trim();
    let scheme_end = base.find("://")? + 3;
    let origin_end = base[scheme_end..].find(['/', '?', '#']).map_or(base.len(), |i| scheme_end + i);
    let url = if href.starts_with("https://") || href.starts_with("http://") {
        href.to_string()
    } else if let Some(rest) = href.strip_prefix("//") {
        format!("{}{rest}", &base[..scheme_end])
    } else if href.starts_with('/') {
        format!("{}{href}", &base[..origin_end])
    } else {
        let path_end = base.find(['?', '#']).unwrap_or(base.len());
        let dir_end = base[..path_end].rfind('/').filter(|&i| i >= origin_end).unwrap_or(origin_end);
        format!("{}/{href}", &base[..dir_end])
    };
    validate::url("url", &url).ok().map(|_| url)
}

/// Image type from the first bytes; anything else (an HTML error page, say) is not an icon.
pub fn sniff(bytes: &[u8]) -> Option<&'static str> {
    let head = &bytes[..bytes.len().min(512)];
    if head.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if head.starts_with(&[0, 0, 1, 0]) {
        Some("image/x-icon")
    } else if head.starts_with(b"GIF8") {
        Some("image/gif")
    } else if head.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if head.len() >= 12 && &head[..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        Some("image/webp")
    } else if String::from_utf8_lossy(head).to_ascii_lowercase().contains("<svg") {
        Some("image/svg+xml")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_icon_links_best_first() {
        let html = r#"<html><head>
            <link rel="stylesheet" href="/a.css">
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
            <LINK REL="shortcut icon" href='/favicon.ico'>
            <link href="/touch.png?v=2&amp;x=1" rel="apple-touch-icon" sizes="180x180" />
            <link rel=icon href=/logo.svg>
            <link rel="icon" href="data:image/png;base64,AAAA">
        </head></html>"#;
        assert_eq!(icon_links(html), vec!["/touch.png?v=2&x=1", "/logo.svg", "/favicon-32.png", "/favicon.ico"]);
        assert!(icon_links("<p>no head</p>").is_empty());
    }

    #[test]
    fn resolves_links_against_the_page() {
        let base = "https://www.sixt.de/mietwagen/portugal?x=1";
        assert_eq!(resolve(base, "/f.ico").as_deref(), Some("https://www.sixt.de/f.ico"));
        assert_eq!(resolve(base, "//cdn.sixt.io/i.png").as_deref(), Some("https://cdn.sixt.io/i.png"));
        assert_eq!(resolve(base, "i.png").as_deref(), Some("https://www.sixt.de/mietwagen/i.png"));
        assert_eq!(resolve("https://www.sixt.de", "i.png").as_deref(), Some("https://www.sixt.de/i.png"));
        assert_eq!(resolve(base, "https://x.org/i.png").as_deref(), Some("https://x.org/i.png"));
        assert_eq!(resolve("not a url", "/i.png"), None);
    }

    #[test]
    fn accepts_images_only() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(sniff(&[0, 0, 1, 0, 1, 0]), Some("image/x-icon"));
        assert_eq!(sniff(b"<?xml version=\"1.0\"?><svg xmlns="), Some("image/svg+xml"));
        assert_eq!(sniff(b"<!doctype html><html>"), None);
        assert_eq!(sniff(b""), None);
    }

    #[test]
    fn missing_icons_are_asked_again_later() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::for_tests(dir.path(), "2027-06-01T08:00:00Z").unwrap();
        assert!(!s.site_icons_enabled().unwrap());
        s.cache_site_icon("https://www.sixt.com", Some("data:image/png;base64,AA")).unwrap();
        s.cache_site_icon("https://www.hertz.com", None).unwrap();
        assert_eq!(s.cached_site_icon("https://www.sixt.com").unwrap(), Some(Some("data:image/png;base64,AA".into())));
        assert_eq!(s.cached_site_icon("https://www.hertz.com").unwrap(), Some(None));
        assert_eq!(s.cached_site_icon("https://www.avis.com").unwrap(), None);
        s.set_now("2027-08-01T08:00:00Z");
        assert_eq!(s.cached_site_icon("https://www.hertz.com").unwrap(), None);
        assert!(s.cached_site_icon("https://www.sixt.com").unwrap().is_some());
        assert_eq!(s.clear_site_icons().unwrap(), 2);
    }

    /// Talks to the provider's site; run with `cargo test -p tp-core -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_site_icon_sixt() {
        let icon = fetch("https://www.sixt.com", "TravelPlanner-tests").unwrap();
        assert!(icon.is_some_and(|i| i.starts_with("data:image/")));
    }
}

