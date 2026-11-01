//! Undo for deletions. Before a delete, every row it removes (following `ON DELETE CASCADE`) and
//! every reference it clears (`ON DELETE SET NULL`) is captured from the schema itself, so new
//! tables are covered without changes here. Captures live in memory for the session only.

use std::collections::{HashSet, VecDeque};

use rusqlite::types::Value;
use rusqlite::{Connection, params_from_iter};

use crate::error::{CoreError, CoreResult};
use crate::store::{Store, new_id};

/// How many deletions can be undone.
const CAPACITY: usize = 10;

#[derive(Debug, Clone)]
pub(crate) struct CapturedRow {
    table: String,
    rowid: i64,
    columns: Vec<String>,
    values: Vec<Value>,
}

#[derive(Debug)]
pub(crate) struct Deleted {
    id: String,
    /// The trip whose change time is updated on undo (none for app-wide rows).
    pub(crate) trip: Option<String>,
    /// Removed rows, parents before children where possible.
    rows: Vec<CapturedRow>,
    /// Rows that stay but had a reference cleared: table, rowid, column, old value.
    cleared: Vec<(String, i64, String, Value)>,
    /// Rows that stay but are changed as a side effect of the delete (restored as they were).
    changed: Vec<CapturedRow>,
}

#[derive(Default)]
pub(crate) struct Trash(VecDeque<Deleted>);

struct ForeignKey {
    child: String,
    column: String,
    parent: String,
    parent_column: String,
    set_null: bool,
}

fn foreign_keys(conn: &Connection) -> CoreResult<Vec<ForeignKey>> {
    let mut stmt = conn.prepare(
        "SELECT m.name, f.\"from\", f.\"table\", f.\"to\", f.on_delete
         FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type = 'table'",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(ForeignKey {
            child: r.get(0)?,
            column: r.get(1)?,
            parent: r.get(2)?,
            parent_column: r.get(3)?,
            set_null: r.get::<_, String>(4)? == "SET NULL",
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn select_rows(conn: &Connection, table: &str, filter: &str, params: &[Value]) -> CoreResult<Vec<CapturedRow>> {
    let mut stmt = conn.prepare(&format!("SELECT rowid, * FROM {table} WHERE {filter}"))?;
    let columns: Vec<String> = stmt.column_names().into_iter().skip(1).map(str::to_string).collect();
    let mut rows = stmt.query(params_from_iter(params))?;
    let mut out = Vec::new();
    while let Some(r) = rows.next()? {
        let values = (1..=columns.len()).map(|i| r.get::<_, Value>(i)).collect::<Result<_, _>>()?;
        out.push(CapturedRow { table: table.to_string(), rowid: r.get(0)?, columns: columns.clone(), values });
    }
    Ok(out)
}

struct Capture<'a> {
    conn: &'a Connection,
    keys: Vec<ForeignKey>,
    seen: HashSet<(String, i64)>,
    cleared_seen: HashSet<(String, i64, String)>,
    out: Deleted,
}

impl Capture<'_> {
    fn rows(&mut self, table: &str, filter: &str, params: &[Value]) -> CoreResult<()> {
        for row in select_rows(self.conn, table, filter, params)? {
            if !self.seen.insert((row.table.clone(), row.rowid)) {
                continue;
            }
            let children: Vec<(String, String, String, bool)> = self
                .keys
                .iter()
                .filter(|k| k.parent == table)
                .map(|k| (k.child.clone(), k.column.clone(), k.parent_column.clone(), k.set_null))
                .collect();
            let row_value = |col: &str| row.columns.iter().position(|c| c == col).map(|i| row.values[i].clone());
            let mut pending = Vec::new();
            for (child, column, parent_column, set_null) in children {
                let Some(value) = row_value(&parent_column) else { continue };
                if value == Value::Null {
                    continue;
                }
                pending.push((child, column, value, set_null));
            }
            self.out.rows.push(row);
            for (child, column, value, set_null) in pending {
                let filter = format!("{column} = ?");
                if set_null {
                    for r in select_rows(self.conn, &child, &filter, std::slice::from_ref(&value))? {
                        if self.cleared_seen.insert((child.clone(), r.rowid, column.clone())) {
                            self.out.cleared.push((child.clone(), r.rowid, column.clone(), value.clone()));
                        }
                    }
                } else {
                    // CASCADE, and RESTRICT rows that the store removes itself before the parent.
                    self.rows(&child, &filter, &[value])?;
                }
            }
        }
        Ok(())
    }
}

/// Captures what deleting the rows of `table` matching `filter` would remove or clear.
pub(crate) fn capture(conn: &Connection, table: &str, filter: &str, params: &[Value]) -> CoreResult<Deleted> {
    let mut c = Capture {
        conn,
        keys: foreign_keys(conn)?,
        seen: HashSet::new(),
        cleared_seen: HashSet::new(),
        out: Deleted { id: new_id(), trip: None, rows: Vec::new(), cleared: Vec::new(), changed: Vec::new() },
    };
    c.rows(table, filter, params)?;
    Ok(c.out)
}

impl Deleted {
    /// Keeps a row that the delete will change as a side effect, to put it back on undo.
    pub(crate) fn keep_changed(&mut self, conn: &Connection, table: &str, id: &str) -> CoreResult<()> {
        self.changed.extend(select_rows(conn, table, "id = ?", &[Value::Text(id.to_string())])?);
        Ok(())
    }

    fn stored_documents(&self) -> impl Iterator<Item = &str> {
        self.rows.iter().filter(|r| r.table == "documents").filter_map(|r| {
            let i = r.columns.iter().position(|c| c == "stored_name")?;
            match &r.values[i] {
                Value::Text(s) => Some(s.as_str()),
                _ => None,
            }
        })
    }
}

impl Trash {
    pub(crate) fn push(&mut self, d: Deleted) -> String {
        let id = d.id.clone();
        if self.0.len() == CAPACITY {
            self.0.pop_front();
        }
        self.0.push_back(d);
        id
    }

    /// Document files that must stay on disk while their deletion can be undone.
    pub(crate) fn kept_files(&self) -> HashSet<String> {
        self.0.iter().flat_map(|d| d.stored_documents().map(str::to_string)).collect()
    }
}

impl Store {
    /// Puts back the rows of a deletion. Fails without changes if the data no longer fits, e.g.
    /// because a parent row was deleted in the meantime.
    pub fn undo_delete(&mut self, id: &str) -> CoreResult<()> {
        let pos = self
            .trash
            .0
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| CoreError::rule("undo_unavailable", "this deletion can no longer be undone"))?;
        let now = self.now();
        let tx = self.conn.transaction()?;
        // Rows reached through several parents may come before one of them.
        tx.pragma_update(None, "defer_foreign_keys", true)?;
        let d = &self.trash.0[pos];
        let result = (|| -> CoreResult<()> {
            for r in &d.rows {
                let sql = format!(
                    "INSERT INTO {} (rowid, {}) VALUES (?, {})",
                    r.table,
                    r.columns.join(", "),
                    vec!["?"; r.columns.len()].join(", ")
                );
                let params = std::iter::once(Value::Integer(r.rowid)).chain(r.values.iter().cloned());
                tx.execute(&sql, params_from_iter(params))?;
            }
            for (table, rowid, column, value) in &d.cleared {
                tx.execute(&format!("UPDATE {table} SET {column} = ?1 WHERE rowid = ?2"), (value, rowid))?;
            }
            for r in &d.changed {
                let sets: Vec<String> = r.columns.iter().map(|c| format!("{c} = ?")).collect();
                let sql = format!("UPDATE {} SET {} WHERE rowid = ?", r.table, sets.join(", "));
                let params = r.values.iter().cloned().chain(std::iter::once(Value::Integer(r.rowid)));
                tx.execute(&sql, params_from_iter(params))?;
            }
            Ok(())
        })();
        if let Err(e) = result {
            return Err(match e {
                CoreError::Db(_) => CoreError::rule("undo_unavailable", "the data changed; the deletion cannot be undone"),
                other => other,
            });
        }
        if let Some(t) = &d.trip {
            tx.execute("UPDATE trips SET updated_at = ?1 WHERE id = ?2", (&now, t))?;
        }
        tx.commit().map_err(|_| CoreError::rule("undo_unavailable", "the data changed; the deletion cannot be undone"))?;
        self.trash.0.remove(pos);
        Ok(())
    }

    /// Forgets all deletions that could be undone and removes their document files.
    pub fn clear_trash(&mut self) -> CoreResult<usize> {
        self.trash.0.clear();
        self.remove_orphan_files()
    }

    pub(crate) fn remove_orphan_files(&self) -> CoreResult<usize> {
        crate::documents::remove_orphans(&self.conn, &self.data_dir, &self.trash.kept_files())
    }
}
