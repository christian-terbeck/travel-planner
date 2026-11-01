//! Reading booking confirmations with Claude (optional, off by default). The file is sent to the
//! Anthropic API only when the user starts an import; the answer is a proposal that the UI shows
//! in the normal booking forms, and nothing is stored until the user confirms it there.
//!
//! There is no official Anthropic SDK for Rust, so the Messages API is called over HTTP.

use std::path::Path;
use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;

use crate::error::{CoreError, CoreResult};
use crate::store::Store;

/// Setting that allows sending confirmations to Claude ("1" = on).
pub const ENABLED_SETTING: &str = "ai_import_enabled";
pub const API_URL: &str = "https://api.anthropic.com/v1/messages";
pub const MODEL: &str = "claude-opus-5-5";
const API_VERSION: &str = "2026-10-21";
/// Lets a declined request continue on Anthropic's recommended fallback model.
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
/// PDFs and images up to this size are sent as they are.
pub const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;
/// Text files (mails, HTML) are cut to this many characters.
const MAX_TEXT_CHARS: usize = 300_000;
const TIMEOUT: Duration = Duration::from_secs(240);

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedSegment {
    /// "flight", "train", "bus", "ferry", "transfer" or "other".
    pub mode: String,
    pub carrier: Option<String>,
    pub number: Option<String>,
    /// IATA code for flights, station or place otherwise.
    pub from: Option<String>,
    pub to: Option<String>,
    /// Local date-time as printed ("YYYY-MM-DDTHH:MM").
    pub depart_local: Option<String>,
    pub depart_tz: Option<String>,
    pub arrive_local: Option<String>,
    pub arrive_tz: Option<String>,
    pub cabin: Option<String>,
    pub seat: Option<String>,
    pub baggage: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedStay {
    pub address: Option<String>,
    pub check_in: Option<String>,
    pub check_out: Option<String>,
    pub check_in_time: Option<String>,
    pub check_out_time: Option<String>,
    pub room: Option<String>,
    pub meals: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedCar {
    pub pickup_location: Option<String>,
    pub pickup_local: Option<String>,
    pub return_location: Option<String>,
    pub return_local: Option<String>,
    pub vehicle: Option<String>,
    pub insurance: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedSpan {
    pub location: Option<String>,
    pub start_date: Option<String>,
    pub start_time: Option<String>,
    pub end_date: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedCancellation {
    /// "free_until", "with_fee", "partially_refundable", "non_refundable" or "unknown".
    pub policy_type: String,
    pub deadline_local: Option<String>,
    pub fee: Option<f64>,
    pub text: Option<String>,
}

/// What Claude read from a confirmation. Every value is a proposal for the user to check.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExtractedBooking {
    /// Slot kind: "flight", "transport", "accommodation", "rental_car", "activity", "parking",
    /// "insurance" or "other".
    pub kind: String,
    pub title: String,
    pub provider: Option<String>,
    pub platform: Option<String>,
    pub reference: Option<String>,
    pub booked_on: Option<String>,
    /// Total price in major units (e.g. 280.5), with its ISO currency.
    pub price: Option<f64>,
    pub currency: Option<String>,
    pub paid: Option<bool>,
    pub contact: Option<String>,
    pub segments: Vec<ExtractedSegment>,
    pub stay: Option<ExtractedStay>,
    pub car: Option<ExtractedCar>,
    pub span: Option<ExtractedSpan>,
    pub cancellation: Option<ExtractedCancellation>,
    pub travelers: Vec<String>,
    /// Anything the model was unsure about, for the user to check.
    pub notes: Option<String>,
}

impl Store {
    pub fn ai_import_enabled(&self) -> CoreResult<bool> {
        Ok(self.setting(ENABLED_SETTING)?.as_deref() == Some("1"))
    }
}

fn nullable(t: &str) -> Value {
    json!({ "anyOf": [{ "type": t }, { "type": "null" }] })
}

fn object(fields: &[(&str, Value)]) -> Value {
    let props: serde_json::Map<String, Value> = fields.iter().map(|(k, v)| ((*k).to_string(), v.clone())).collect();
    let required: Vec<&str> = fields.iter().map(|(k, _)| *k).collect();
    json!({ "type": "object", "properties": props, "required": required, "additionalProperties": false })
}

/// JSON schema of [`ExtractedBooking`] for structured outputs (all fields required, nullable).
pub fn schema() -> Value {
    let s = || nullable("string");
    let segment = object(&[
        ("mode", json!({ "type": "string", "enum": ["flight", "train", "bus", "ferry", "transfer", "other"] })),
        ("carrier", s()),
        ("number", s()),
        ("from", s()),
        ("to", s()),
        ("depart_local", s()),
        ("depart_tz", s()),
        ("arrive_local", s()),
        ("arrive_tz", s()),
        ("cabin", s()),
        ("seat", s()),
        ("baggage", s()),
    ]);
    let stay = object(&[
        ("address", s()),
        ("check_in", s()),
        ("check_out", s()),
        ("check_in_time", s()),
        ("check_out_time", s()),
        ("room", s()),
        ("meals", s()),
    ]);
    let car = object(&[
        ("pickup_location", s()),
        ("pickup_local", s()),
        ("return_location", s()),
        ("return_local", s()),
        ("vehicle", s()),
        ("insurance", s()),
    ]);
    let span =
        object(&[("location", s()), ("start_date", s()), ("start_time", s()), ("end_date", s()), ("end_time", s())]);
    let cancellation = object(&[
        (
            "policy_type",
            json!({ "type": "string", "enum": ["free_until", "with_fee", "partially_refundable", "non_refundable", "unknown"] }),
        ),
        ("deadline_local", s()),
        ("fee", nullable("number")),
        ("text", s()),
    ]);
    let or_null = |v: Value| json!({ "anyOf": [v, { "type": "null" }] });
    object(&[
        (
            "kind",
            json!({ "type": "string", "enum": ["flight", "transport", "accommodation", "rental_car", "activity", "parking", "insurance", "other"] }),
        ),
        ("title", json!({ "type": "string" })),
        ("provider", s()),
        ("platform", s()),
        ("reference", s()),
        ("booked_on", s()),
        ("price", nullable("number")),
        ("currency", s()),
        ("paid", nullable("boolean")),
        ("contact", s()),
        ("segments", json!({ "type": "array", "items": segment })),
        ("stay", or_null(stay)),
        ("car", or_null(car)),
        ("span", or_null(span)),
        ("cancellation", or_null(cancellation)),
        ("travelers", json!({ "type": "array", "items": { "type": "string" } })),
        ("notes", s()),
    ])
}

const SYSTEM: &str = "You read travel booking confirmations (flights, trains, buses, ferries, transfers, \
hotels and other stays, rental cars, activities, parking, travel insurance) and return the booking as JSON.

Rules:
- Only report what the document states. Use null for anything not stated; never guess prices, references or times.
- Dates are YYYY-MM-DD. Times are local times as printed, HH:MM. Local date-times are YYYY-MM-DDTHH:MM.
- Time zones are IANA names (e.g. Europe/Lisbon) and only when the place makes them unambiguous; otherwise null.
- Flights: one segment per flight leg, `from`/`to` as IATA airport codes, mode \"flight\". Trains, buses, ferries and \
transfers use kind \"transport\" with station or place names in `from`/`to`.
- `price` is the total amount charged for the whole booking, in major units, with its ISO 4217 currency.
- Fill `stay` only for accommodation, `car` only for rental cars, `span` only for activities, parking and insurance \
(insurance: the covered dates).
- `cancellation`: the terms as written; `deadline_local` is the last moment of free or reduced-cost cancellation.
- `title` is a short name for the booking (e.g. \"TAP Frankfurt – Lisbon\", \"Casa do Alfama\") in the requested language.
- Put anything ambiguous or worth checking into `notes`, in the requested language.";

/// What is sent for a file: PDFs and images as they are, text-like files as text.
pub fn content_block(path: &Path) -> CoreResult<Value> {
    let meta = std::fs::metadata(path)?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(CoreError::rule("file_too_large_ai", "the file is larger than 20 MB"));
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let b64 = |bytes: Vec<u8>| base64::engine::general_purpose::STANDARD.encode(bytes);
    let media = match ext.as_str() {
        "pdf" => Some(("document", "application/pdf")),
        "png" => Some(("image", "image/png")),
        "jpg" | "jpeg" => Some(("image", "image/jpeg")),
        "webp" => Some(("image", "image/webp")),
        "gif" => Some(("image", "image/gif")),
        _ => None,
    };
    if let Some((kind, media_type)) = media {
        let data = b64(std::fs::read(path)?);
        return Ok(json!({ "type": kind, "source": { "type": "base64", "media_type": media_type, "data": data } }));
    }
    if !matches!(ext.as_str(), "txt" | "eml" | "html" | "htm" | "md") {
        return Err(CoreError::rule("file_unsupported", "use a PDF, an image, an .eml mail or a text/HTML file"));
    }
    let raw = String::from_utf8_lossy(&std::fs::read(path)?).into_owned();
    let text: String = raw.chars().take(MAX_TEXT_CHARS).collect();
    Ok(json!({ "type": "text", "text": format!("<confirmation file=\"{}\">\n{text}\n</confirmation>", ext) }))
}

pub fn request_body(file: Value, language: &str) -> Value {
    let language = if language == "de" { "German" } else { "English" };
    json!({
        "model": MODEL,
        "max_tokens": 16000,
        "fallbacks": "default",
        "system": SYSTEM,
        "output_config": {
            "effort": "medium",
            "format": { "type": "json_schema", "schema": schema() },
        },
        "messages": [{
            "role": "user",
            "content": [
                file,
                { "type": "text", "text": format!("Extract the booking from this confirmation. Write `title` and `notes` in {language}.") },
            ],
        }],
    })
}

/// Reads the answer: the JSON text block, after checking why the model stopped.
pub fn parse_response(status: u16, body: &str) -> CoreResult<ExtractedBooking> {
    let v: Value = serde_json::from_str(body).map_err(|_| CoreError::rule("ai_failed", "unexpected answer"))?;
    if status == 401 || status == 403 {
        return Err(CoreError::rule("ai_auth", "the API key was not accepted"));
    }
    if status >= 400 {
        let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("request failed");
        return Err(CoreError::rule("ai_failed", format!("HTTP {status}: {msg}")));
    }
    match v.get("stop_reason").and_then(Value::as_str) {
        Some("refusal") => return Err(CoreError::rule("ai_refused", "the model declined to read this file")),
        Some("max_tokens") => return Err(CoreError::rule("ai_failed", "the answer was cut off")),
        _ => {}
    }
    let text = v
        .get("content")
        .and_then(Value::as_array)
        .and_then(|blocks| blocks.iter().rev().find(|b| b.get("type").and_then(Value::as_str) == Some("text")))
        .and_then(|b| b.get("text").and_then(Value::as_str))
        .ok_or_else(|| CoreError::rule("ai_failed", "no answer text"))?;
    serde_json::from_str(text).map_err(|_| CoreError::rule("ai_failed", "the answer did not match the expected format"))
}

/// Sends the file to Claude and returns the proposal (blocking).
pub fn extract(api_key: &str, path: &Path, language: &str, user_agent: &str) -> CoreResult<ExtractedBooking> {
    let body = request_body(content_block(path)?, language);
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .user_agent(user_agent)
        .http_status_as_error(false)
        .build()
        .into();
    let (status, text) = agent
        .post(API_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .header("anthropic-beta", FALLBACK_BETA)
        .header("content-type", "application/json")
        .send(body.to_string())
        .and_then(|mut r| {
            let status = r.status().as_u16();
            r.body_mut().read_to_string().map(|t| (status, t))
        })
        .map_err(|e| CoreError::rule("online_failed", e.to_string()))?;
    parse_response(status, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_is_strict_everywhere() {
        fn check(v: &Value) {
            if v.get("type").and_then(Value::as_str) == Some("object") {
                assert_eq!(v["additionalProperties"], json!(false));
                let props = v["properties"].as_object().unwrap();
                let req: Vec<&str> = v["required"].as_array().unwrap().iter().map(|r| r.as_str().unwrap()).collect();
                assert_eq!(props.len(), req.len());
            }
            match v {
                Value::Object(m) => m.values().for_each(check),
                Value::Array(a) => a.iter().for_each(check),
                _ => {}
            }
        }
        check(&schema());
    }

    #[test]
    fn sends_pdfs_as_documents_and_mails_as_text() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("ticket.PDF");
        std::fs::write(&pdf, b"%PDF-1.4 test").unwrap();
        let block = content_block(&pdf).unwrap();
        assert_eq!(block["type"], "document");
        assert_eq!(block["source"]["media_type"], "application/pdf");
        let mail = dir.path().join("mail.eml");
        std::fs::write(&mail, "Subject: Your booking ABC123").unwrap();
        assert!(content_block(&mail).unwrap()["text"].as_str().unwrap().contains("ABC123"));
        let exe = dir.path().join("x.exe");
        std::fs::write(&exe, b"MZ").unwrap();
        assert!(matches!(content_block(&exe), Err(CoreError::Rule { .. })));

        let body = request_body(block, "de");
        assert_eq!(body["model"], MODEL);
        assert!(body.get("temperature").is_none());
        assert!(body["messages"][0]["content"][1]["text"].as_str().unwrap().contains("German"));
    }

    #[test]
    fn parses_answers_and_reports_failures() {
        let answer = json!({
            "stop_reason": "end_turn",
            "content": [
                { "type": "thinking", "thinking": "" },
                { "type": "text", "text": serde_json::to_string(&json!({
                    "kind": "flight", "title": "TAP Frankfurt – Lisbon", "provider": "TAP", "platform": null,
                    "reference": "ABC123", "booked_on": "2027-03-01", "price": 280.5, "currency": "EUR",
                    "paid": true, "contact": null,
                    "segments": [{ "mode": "flight", "carrier": "TAP", "number": "TP 571", "from": "FRA", "to": "LIS",
                        "depart_local": "2027-06-10T07:00", "depart_tz": "Europe/Berlin",
                        "arrive_local": "2027-06-10T09:00", "arrive_tz": "Europe/Lisbon",
                        "cabin": "Economy", "seat": null, "baggage": "23 kg" }],
                    "stay": null, "car": null, "span": null,
                    "cancellation": { "policy_type": "non_refundable", "deadline_local": null, "fee": null, "text": null },
                    "travelers": ["Chris"], "notes": null
                })).unwrap() }
            ]
        });
        let b = parse_response(200, &answer.to_string()).unwrap();
        assert_eq!(b.reference.as_deref(), Some("ABC123"));
        assert_eq!(b.segments[0].to.as_deref(), Some("LIS"));
        assert_eq!(b.price, Some(280.5));

        let code = |r: CoreResult<ExtractedBooking>| match r {
            Err(CoreError::Rule { code, .. }) => code,
            other => panic!("{other:?}"),
        };
        assert_eq!(code(parse_response(401, r#"{"error":{"message":"invalid x-api-key"}}"#)), "ai_auth");
        assert_eq!(code(parse_response(200, r#"{"stop_reason":"refusal","content":[]}"#)), "ai_refused");
        assert_eq!(code(parse_response(529, r#"{"error":{"message":"Overloaded"}}"#)), "ai_failed");
    }
}
