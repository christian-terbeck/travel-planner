//! Local document storage. Files are copied into `<data>/documents/` under generated names, so
//! no user-supplied path is ever used to build a path inside the data folder.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::error::{CoreError, CoreResult};

pub const MAX_BYTES: u64 = 200 * 1024 * 1024;

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("documents")
}

pub struct StoredFile {
    pub stored_name: String,
    pub filename: String,
    pub mime: Option<String>,
    pub size_bytes: i64,
    pub sha256: String,
}

/// `<uuid>.<ext>` with a short alphanumeric extension; anything else is rejected.
pub fn check_stored_name(name: &str) -> CoreResult<()> {
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    let stem_ok = !stem.is_empty() && stem.len() <= 64 && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let ext_ok = ext.len() <= 10 && ext.chars().all(|c| c.is_ascii_alphanumeric());
    if stem_ok && ext_ok { Ok(()) } else { Err(CoreError::invalid("stored_name", "invalid stored file name")) }
}

pub fn store_file(data_dir: &Path, source: &Path) -> CoreResult<StoredFile> {
    let meta = fs::metadata(source)?;
    if !meta.is_file() {
        return Err(CoreError::invalid("file", "not a file"));
    }
    if meta.len() > MAX_BYTES {
        return Err(CoreError::rule("file_too_large", "documents are limited to 200 MB"));
    }
    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| CoreError::invalid("file", "file name is not valid text"))?
        .to_string();
    let ext: String = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(10)
        .collect();
    let id = crate::store::new_id();
    let stored_name = if ext.is_empty() { id } else { format!("{id}.{ext}") };
    let target = dir(data_dir).join(&stored_name);

    let mut hasher = Sha256::new();
    let mut input = fs::File::open(source)?;
    let mut buf = vec![0u8; 64 * 1024];
    let tmp = target.with_extension("part");
    {
        let mut out = fs::File::create(&tmp)?;
        loop {
            let n = input.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            std::io::Write::write_all(&mut out, &buf[..n])?;
        }
        out.sync_all()?;
    }
    fs::rename(&tmp, &target)?;
    Ok(StoredFile {
        mime: mime_for(&ext).map(str::to_string),
        stored_name,
        filename,
        size_bytes: meta.len() as i64,
        sha256: hex(&hasher.finalize()),
    })
}

pub fn existing_path(data_dir: &Path, stored_name: &str) -> CoreResult<PathBuf> {
    check_stored_name(stored_name)?;
    let path = dir(data_dir).join(stored_name);
    if path.is_file() { Ok(path) } else { Err(CoreError::rule("file_missing", format!("{stored_name} is missing"))) }
}

/// Deletes files in the documents folder that no document row refers to any more, except `keep`.
pub fn remove_orphans(conn: &Connection, data_dir: &Path, keep: &std::collections::HashSet<String>) -> CoreResult<usize> {
    let mut stmt = conn.prepare("SELECT stored_name FROM documents")?;
    let used: std::collections::HashSet<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut removed = 0;
    let Ok(entries) = fs::read_dir(dir(data_dir)) else { return Ok(0) };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_file() && !used.contains(&name) && !keep.contains(&name) && check_stored_name(&name).is_ok() {
            fs::remove_file(entry.path())?;
            removed += 1;
        }
    }
    Ok(removed)
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "html" | "htm" => "text/html",
        "ics" => "text/calendar",
        "json" => "application/json",
        "eml" => "message/rfc822",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pkpass" => "application/vnd.apple.pkpass",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_names_cannot_escape_the_folder() {
        assert!(check_stored_name("0190a-bc.pdf").is_ok());
        for bad in ["../x.pdf", "a/b.pdf", "a\\b.pdf", "", ".pdf", "x.p df", "C:x.pdf"] {
            assert!(check_stored_name(bad).is_err(), "{bad}");
        }
    }
}
