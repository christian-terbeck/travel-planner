//! Trip review with Claude (optional, off by default): the UI sends a compact summary of one
//! trip's plan, and Claude points out what is missing, costly, badly timed or risky. The answer
//! is advice to read; nothing is changed or stored.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;

use crate::confirmation::{MODEL, answer_text, object, send};
use crate::error::{CoreError, CoreResult};
use crate::store::Store;

/// Setting that allows sending trip summaries to Claude ("1" = on).
pub const ENABLED_SETTING: &str = "ai_review_enabled";
/// The summary is built by the UI from one trip; anything larger is not a trip summary.
const MAX_INPUT_BYTES: usize = 200_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReviewFinding {
    /// "missing", "cost", "timing", "risk" or "idea".
    pub kind: String,
    /// "high", "medium" or "low".
    pub importance: String,
    pub title: String,
    pub detail: String,
    /// Titles of the needs or alternatives it is about, as given in the input.
    pub related: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TripReview {
    pub summary: String,
    pub findings: Vec<ReviewFinding>,
    /// What the advice relies on, e.g. "prices are as entered, not current offers".
    pub assumptions: Vec<String>,
}

impl Store {
    pub fn ai_review_enabled(&self) -> CoreResult<bool> {
        Ok(self.setting(ENABLED_SETTING)?.as_deref() == Some("1"))
    }
}

pub fn schema() -> Value {
    let finding = object(&[
        ("kind", json!({ "type": "string", "enum": ["missing", "cost", "timing", "risk", "idea"] })),
        ("importance", json!({ "type": "string", "enum": ["high", "medium", "low"] })),
        ("title", json!({ "type": "string" })),
        ("detail", json!({ "type": "string" })),
        ("related", json!({ "type": "array", "items": { "type": "string" } })),
    ]);
    object(&[
        ("summary", json!({ "type": "string" })),
        ("findings", json!({ "type": "array", "items": finding })),
        ("assumptions", json!({ "type": "array", "items": { "type": "string" } })),
    ])
}

const SYSTEM: &str = "You review a trip that someone is planning in a desktop travel planner. The input is a JSON \
summary of one trip: its constraints, the needs (flights, stays, cars, activities, …) with the alternatives saved for \
each, which alternatives are in the current plan, what is booked, cancellation terms, the warnings the app already \
computed, reminders, open tasks and the budget.

Point out what deserves the traveller's attention:
- missing: reservations or preparations the plan seems to lack (e.g. no transfer from the airport, nights without a \
stay, travel insurance, documents).
- cost: expensive or poorly matched components, cheaper combinations among the saved alternatives, budget risk.
- timing: tight connections, long waits, awkward arrival or departure times, days that are too full or empty.
- risk: cancellation deadlines coming up, non-refundable parts booked before others are certain, single points of failure.
- idea: a useful activity or improvement that fits the trip.

Rules:
- Base every point on the data given. You have no access to live prices, availability or the web; never present \
something as a current offer, and never claim a plan is the cheapest or best possible — only compare what is saved.
- Do not repeat the app's warnings one by one; mention them only where you add an explanation or a way to resolve them.
- Prefer a few concrete, actionable points (usually 3–8) over many vague ones. Order by importance.
- `related` lists titles exactly as they appear in the input; leave it empty when nothing specific is meant.
- `assumptions` states what your advice relies on (e.g. prices as entered, dates of the current plan).
- People appear as \"Person 1\", \"Person 2\"; refer to them that way.";

pub fn request_body(input: &str, language: &str) -> Value {
    let language = if language == "de" { "German" } else { "English" };
    json!({
        "model": MODEL,
        "max_tokens": 16000,
        "fallbacks": "default",
        "system": SYSTEM,
        "output_config": {
            "effort": "high",
            "format": { "type": "json_schema", "schema": schema() },
        },
        "messages": [{
            "role": "user",
            "content": format!("<trip>\n{input}\n</trip>\n\nReview this trip. Write every text in {language}."),
        }],
    })
}

/// Checks the summary: valid JSON, not too large.
pub fn check_input(input: &str) -> CoreResult<()> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(CoreError::invalid("input", "the trip summary is too large"));
    }
    serde_json::from_str::<Value>(input).map_err(|_| CoreError::invalid("input", "expected JSON"))?;
    Ok(())
}

pub fn parse_response(status: u16, body: &str) -> CoreResult<TripReview> {
    let text = answer_text(status, body, "the model declined to review this trip")?;
    serde_json::from_str(&text).map_err(|_| CoreError::rule("ai_failed", "the answer did not match the expected format"))
}

/// Sends the summary to Claude and returns the review (blocking).
pub fn review(api_key: &str, input: &str, language: &str, user_agent: &str) -> CoreResult<TripReview> {
    check_input(input)?;
    let (status, text) = send(api_key, &request_body(input, language), user_agent)?;
    parse_response(status, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_uses_structured_output_and_the_language() {
        let body = request_body(r#"{"trip":{}}"#, "de");
        assert_eq!(body["model"], MODEL);
        assert_eq!(body["fallbacks"], "default");
        assert_eq!(body["output_config"]["format"]["schema"]["additionalProperties"], json!(false));
        assert!(body.get("thinking").is_none() && body.get("temperature").is_none());
        assert!(body["messages"][0]["content"].as_str().unwrap().ends_with("in German."));
    }

    #[test]
    fn checks_input_and_reads_the_answer() {
        assert!(check_input("not json").is_err());
        assert!(check_input(&format!("\"{}\"", "x".repeat(MAX_INPUT_BYTES))).is_err());
        let review = json!({ "summary": "Looks good", "findings": [{ "kind": "missing", "importance": "high",
            "title": "No airport transfer", "detail": "…", "related": ["Flights"] }], "assumptions": [] });
        let body = json!({ "stop_reason": "end_turn", "content": [{ "type": "text", "text": review.to_string() }] });
        let r = parse_response(200, &body.to_string()).unwrap();
        assert_eq!(r.findings[0].title, "No airport transfer");
        let refused = json!({ "stop_reason": "refusal", "content": [] });
        assert!(matches!(parse_response(200, &refused.to_string()), Err(CoreError::Rule { code: "ai_refused", .. })));
        assert!(matches!(parse_response(401, "{}"), Err(CoreError::Rule { code: "ai_auth", .. })));
    }
}
