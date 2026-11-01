//! Travel Planner core: SQLite persistence, business rules that guard the data, documents,
//! export/import and backups. No UI or Tauri dependencies, so it is tested on its own.

pub mod autobackup;
pub mod confirmation;
pub mod db;
pub mod documents;
pub mod error;
pub mod geocoding;
pub mod model;
pub mod rates;
pub mod routing;
pub mod store;
pub mod table;
pub mod transfer;
pub mod trash;
pub mod validate;
pub mod weather;

pub use error::{CoreError, CoreResult, ErrorPayload};
pub use store::Store;

#[cfg(test)]
mod tests;
