use serde::Serialize;
use ts_rs::TS;

/// Errors reported to the UI. `code` is stable and translated there; `message` is for logs.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("{field}: {message}")]
    Validation { field: String, message: String },
    #[error("{0} not found")]
    NotFound(String),
    /// A business rule refused the change, e.g. `option_booked`.
    #[error("{code}: {message}")]
    Rule { code: &'static str, message: String },
    #[error("database: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("row mapping: {0}")]
    Mapping(#[from] serde_rusqlite::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("file: {0}")]
    Io(#[from] std::io::Error),
    #[error("archive: {0}")]
    Zip(#[from] zip::result::ZipError),
}

pub type CoreResult<T> = Result<T, CoreError>;

impl CoreError {
    pub fn invalid(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Validation { field: field.into(), message: message.into() }
    }

    pub fn rule(code: &'static str, message: impl Into<String>) -> Self {
        Self::Rule { code, message: message.into() }
    }
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ErrorPayload {
    pub code: String,
    pub field: Option<String>,
    pub message: String,
}

impl From<&CoreError> for ErrorPayload {
    fn from(e: &CoreError) -> Self {
        let (code, field) = match e {
            CoreError::Validation { field, .. } => ("validation".to_string(), Some(field.clone())),
            CoreError::NotFound(_) => ("not_found".to_string(), None),
            CoreError::Rule { code, .. } => ((*code).to_string(), None),
            CoreError::Db(_) | CoreError::Mapping(_) => ("database".to_string(), None),
            CoreError::Json(_) => ("invalid_data".to_string(), None),
            CoreError::Io(_) => ("file".to_string(), None),
            CoreError::Zip(_) => ("archive".to_string(), None),
        };
        Self { code, field, message: e.to_string() }
    }
}
