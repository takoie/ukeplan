use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub fn get_app_data_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(appdata).join("UkeplanLager");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub fn get_config_file() -> PathBuf {
    get_app_data_dir().join("config.json")
}

pub fn get_default_db_path() -> PathBuf {
    get_app_data_dir().join("ukeplaner_database.db")
}

pub fn get_active_db_path() -> PathBuf {
    let config_file = get_config_file();
    if let Ok(content) = std::fs::read_to_string(&config_file) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(custom) = json.get("db_path").and_then(|v| v.as_str()) {
                let p = PathBuf::from(custom);
                if p.exists() {
                    return p;
                }
            }
        }
    }
    get_default_db_path()
}

pub fn get_export_dir() -> PathBuf {
    let dir = get_app_data_dir().join("eksport");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    dir
}

pub fn write_config(path: &Path) -> std::io::Result<()> {
    let json = serde_json::json!({ "db_path": path.to_string_lossy() });
    std::fs::write(get_config_file(), serde_json::to_string(&json)?)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut cols = stmt.query_map([], |row| row.get::<_, String>(1))?;
    Ok(cols.any(|c| c.map(|c| c == column).unwrap_or(false)))
}

/// Speiler init_db() i app.py: oppretter tabellene hvis de mangler, og legger
/// idempotent til skoleaar/sprak-kolonnene på eldre databaser (samme migrering
/// som Python-versjonen gjorde med ALTER TABLE).
pub fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS planer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uke INTEGER NOT NULL,
            år INTEGER NOT NULL,
            fag TEXT NOT NULL,
            tema TEXT,
            aktivitet TEXT,
            arbeidskrav TEXT
        );
        CREATE TABLE IF NOT EXISTS fag (
            navn TEXT PRIMARY KEY,
            dager TEXT,
            leksedager TEXT
        );",
    )?;

    if !column_exists(conn, "fag", "skoleaar")? {
        conn.execute("ALTER TABLE fag ADD COLUMN skoleaar TEXT", [])?;
        conn.execute(
            "UPDATE fag SET skoleaar = '2025/2026' WHERE skoleaar IS NULL",
            [],
        )?;
    }
    if !column_exists(conn, "fag", "sprak")? {
        conn.execute("ALTER TABLE fag ADD COLUMN sprak TEXT DEFAULT 'Bokmål'", [])?;
        conn.execute("UPDATE fag SET sprak = 'Bokmål' WHERE sprak IS NULL", [])?;
    }
    Ok(())
}

pub fn init_db(path: &Path) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    ensure_schema(&conn)
}

pub fn get_connection() -> rusqlite::Result<Connection> {
    let conn = Connection::open(get_active_db_path())?;
    conn.busy_timeout(Duration::from_secs(10))?;
    Ok(conn)
}

pub fn safe_json_load(value: Option<String>) -> Vec<String> {
    match value {
        Some(s) if !s.is_empty() && s != "null" => serde_json::from_str(&s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Fag {
    pub navn: String,
    pub dager: Vec<String>,
    pub leksedager: Vec<String>,
    pub skoleaar: String,
    pub sprak: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plan {
    pub id: i64,
    pub uke: i64,
    #[serde(rename = "år")]
    pub ar: i64,
    pub fag: String,
    pub tema: Option<String>,
    pub aktivitet: Option<String>,
    pub arbeidskrav: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PlanForrige {
    pub id: i64,
    pub uke: i64,
    #[serde(rename = "år")]
    pub ar: i64,
    pub fag: String,
    pub tema: Option<String>,
    pub aktivitet: Option<String>,
    pub arbeidskrav: Option<String>,
    #[serde(rename = "visningsUke")]
    pub visnings_uke: i64,
}

#[derive(Debug, Serialize)]
pub struct TidslinjeItem {
    pub uke: i64,
    #[serde(rename = "år")]
    pub ar: i64,
    pub tema: Option<String>,
}
