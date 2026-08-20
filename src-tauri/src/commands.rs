use crate::db::{self, Fag, Plan, PlanForrige, TidslinjeItem};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn get_db_path() -> String {
    db::get_active_db_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn set_db_path(path: String) -> Result<(), String> {
    let mut ny_sti = std::path::PathBuf::from(&path);
    if ny_sti.is_dir() {
        ny_sti = ny_sti.join("ukeplan.db");
    }
    db::init_db(&ny_sti).map_err(|e| e.to_string())?;
    db::write_config(&ny_sti).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_db(path: String) -> Result<(), String> {
    let mut ny_sti = std::path::PathBuf::from(&path);
    if ny_sti.is_dir() {
        ny_sti = ny_sti.join("ukeplan.db");
    }
    let current_path = db::get_active_db_path();
    std::fs::copy(&current_path, &ny_sti).map_err(|e| format!("Kunne ikke flytte: {}", e))?;
    db::write_config(&ny_sti).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_export_folder() -> Result<(), String> {
    let dir = db::get_export_dir();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn map_fag(row: &rusqlite::Row) -> rusqlite::Result<Fag> {
    let skoleaar: Option<String> = row.get(3)?;
    let sprak: Option<String> = row.get(4)?;
    Ok(Fag {
        navn: row.get(0)?,
        dager: db::safe_json_load(row.get(1)?),
        leksedager: db::safe_json_load(row.get(2)?),
        skoleaar: skoleaar
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "2025/2026".to_string()),
        sprak: sprak
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Bokmål".to_string()),
    })
}

fn map_plan(row: &rusqlite::Row) -> rusqlite::Result<Plan> {
    Ok(Plan {
        id: row.get(0)?,
        uke: row.get(1)?,
        ar: row.get(2)?,
        fag: row.get(3)?,
        tema: row.get(4)?,
        aktivitet: row.get(5)?,
        arbeidskrav: row.get(6)?,
    })
}

#[tauri::command]
pub fn hent_fag() -> Result<Vec<Fag>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT navn, dager, leksedager, skoleaar, sprak FROM fag ORDER BY rowid DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_fag).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lagre_nytt_fag(
    navn: String,
    dager: Option<Vec<String>>,
    leksedager: Option<Vec<String>>,
    skoleaar: Option<String>,
    sprak: Option<String>,
) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO fag (navn, dager, leksedager, skoleaar, sprak) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            navn,
            serde_json::to_string(&dager).unwrap_or_else(|_| "null".to_string()),
            serde_json::to_string(&leksedager).unwrap_or_else(|_| "null".to_string()),
            skoleaar,
            sprak.unwrap_or_else(|| "Bokmål".to_string()),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn endre_navn_fag(gammelt_navn: String, nytt_navn: String) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM fag WHERE navn=?1",
            params![nytt_navn],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_some() {
        return Err("Navnet finnes allerede".to_string());
    }
    let cols: Option<(Option<String>, Option<String>, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT dager, leksedager, skoleaar, sprak FROM fag WHERE navn=?1",
            params![gammelt_navn],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (dager, leksedager, skoleaar, sprak) = cols.ok_or_else(|| "Fant ikke fag".to_string())?;
    let sprak = sprak
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Bokmål".to_string());
    conn.execute(
        "INSERT INTO fag (navn, dager, leksedager, skoleaar, sprak) VALUES (?1,?2,?3,?4,?5)",
        params![nytt_navn, dager, leksedager, skoleaar, sprak],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE planer SET fag=?1 WHERE fag=?2",
        params![nytt_navn, gammelt_navn],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM fag WHERE navn=?1", params![gammelt_navn])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn slett_fag(navn: String) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM fag WHERE navn=?1", params![navn])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct EksportResultat {
    pub filename: String,
    pub path: String,
}

#[tauri::command]
pub fn eksporter_fag(navn: String) -> Result<EksportResultat, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let fag: Option<Fag> = conn
        .query_row(
            "SELECT navn, dager, leksedager, skoleaar, sprak FROM fag WHERE navn=?1",
            params![navn],
            map_fag,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let fag = fag.ok_or_else(|| "Fant ikke fag".to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE fag=?1")
        .map_err(|e| e.to_string())?;
    let planer: Vec<Plan> = stmt
        .query_map(params![navn], map_plan)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    let data = serde_json::json!({ "meta": fag, "planer": planer });
    let safe_name: String = navn
        .chars()
        .filter(|c| !"\\/*?:\"<>|".contains(*c))
        .collect::<String>()
        .trim()
        .replace(' ', "_");
    let filnavn = format!(
        "{}_{}.json",
        safe_name,
        chrono::Local::now().format("%Y-%m-%d")
    );
    let path = db::get_export_dir().join(&filnavn);
    let json_str = serde_json::to_string_pretty(&data).map_err(|e| format!("Serverfeil: {}", e))?;
    std::fs::write(&path, json_str).map_err(|e| format!("Serverfeil: {}", e))?;
    Ok(EksportResultat {
        filename: filnavn,
        path: path.to_string_lossy().to_string(),
    })
}

#[derive(Deserialize)]
pub struct ImportMeta {
    pub navn: String,
    pub dager: Option<Vec<String>>,
    pub leksedager: Option<Vec<String>>,
    pub skoleaar: Option<String>,
    pub sprak: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportPlanItem {
    pub uke: i64,
    #[serde(rename = "år")]
    pub ar: i64,
    pub tema: Option<String>,
    pub aktivitet: Option<String>,
    pub arbeidskrav: Option<String>,
}

#[derive(Serialize)]
pub struct ImportResultat {
    #[serde(rename = "nyttNavn")]
    pub nytt_navn: String,
    #[serde(rename = "antallPlaner")]
    pub antall_planer: usize,
}

#[tauri::command]
pub fn importer_fag(meta: ImportMeta, planer: Vec<ImportPlanItem>) -> Result<ImportResultat, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let base_navn = format!("{}-IMPORT", meta.navn);
    let mut final_navn = base_navn.clone();
    let mut cnt = 0;
    loop {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM fag WHERE navn=?1",
                params![final_navn],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            break;
        }
        cnt += 1;
        final_navn = format!("{}-{}", base_navn, cnt);
    }
    let skoleaar = meta.skoleaar.unwrap_or_else(|| "2025/2026".to_string());
    let sprak = meta.sprak.unwrap_or_else(|| "Bokmål".to_string());
    conn.execute(
        "INSERT INTO fag (navn, dager, leksedager, skoleaar, sprak) VALUES (?1,?2,?3,?4,?5)",
        params![
            final_navn,
            serde_json::to_string(&meta.dager).unwrap_or_else(|_| "null".to_string()),
            serde_json::to_string(&meta.leksedager).unwrap_or_else(|_| "null".to_string()),
            skoleaar,
            sprak,
        ],
    )
    .map_err(|e| e.to_string())?;
    for p in &planer {
        conn.execute(
            "INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav) VALUES (?1,?2,?3,?4,?5,?6)",
            params![p.uke, p.ar, final_navn, p.tema, p.aktivitet, p.arbeidskrav],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(ImportResultat {
        nytt_navn: final_navn,
        antall_planer: planer.len(),
    })
}

#[tauri::command]
pub fn hent_plan(uke: i64, ar: i64, fag: String) -> Result<Option<Plan>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE uke=?1 AND år=?2 AND fag=?3",
        params![uke, ar, fag],
        map_plan,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hent_forrige_plan(uke: i64, ar: i64, fag: String) -> Result<Option<PlanForrige>, String> {
    let (pu, pa) = if uke == 1 { (52, ar - 1) } else { (uke - 1, ar) };
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let plan: Option<Plan> = conn
        .query_row(
            "SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE uke=?1 AND år=?2 AND fag=?3",
            params![pu, pa, fag],
            map_plan,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(plan.map(|p| PlanForrige {
        id: p.id,
        uke: p.uke,
        ar: p.ar,
        fag: p.fag,
        tema: p.tema,
        aktivitet: p.aktivitet,
        arbeidskrav: p.arbeidskrav,
        visnings_uke: pu,
    }))
}

#[tauri::command]
pub fn hent_planer_periode(fag: String, aar: i64, start: i64, slutt: i64) -> Result<Vec<Plan>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE fag=?1 AND år=?2 AND uke >= ?3 AND uke <= ?4 ORDER BY uke DESC",
        )
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_map(params![fag, aar, start, slutt], map_plan)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn sok_planer(fag: String, q: String) -> Result<Vec<Plan>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let trimmed = q.trim();
    let mut planer = Vec::new();
    if trimmed.is_empty() {
        let mut stmt = conn
            .prepare("SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE fag=?1 ORDER BY år DESC, uke DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![fag], map_plan).map_err(|e| e.to_string())?;
        for r in rows {
            planer.push(r.map_err(|e| e.to_string())?);
        }
    } else {
        let like = format!("%{}%", trimmed);
        let mut stmt = conn
            .prepare(
                "SELECT id, uke, år, fag, tema, aktivitet, arbeidskrav FROM planer WHERE fag=?1 AND (tema LIKE ?2 OR aktivitet LIKE ?2 OR arbeidskrav LIKE ?2) ORDER BY år DESC, uke DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![fag, like], map_plan)
            .map_err(|e| e.to_string())?;
        for r in rows {
            planer.push(r.map_err(|e| e.to_string())?);
        }
    }
    Ok(planer)
}

#[tauri::command]
pub fn hent_tidslinje(fag: String) -> Result<Vec<TidslinjeItem>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT uke, år, tema FROM planer WHERE fag=?1 ORDER BY år DESC, uke DESC")
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_map(params![fag], |row| {
            Ok(TidslinjeItem {
                uke: row.get(0)?,
                ar: row.get(1)?,
                tema: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn lagre_plan(
    uke: i64,
    ar: i64,
    fag: String,
    tema: Option<String>,
    aktivitet: Option<String>,
    arbeidskrav: Option<String>,
) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM planer WHERE uke=?1 AND år=?2 AND fag=?3",
            params![uke, ar, fag],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if existing.is_some() {
        conn.execute(
            "UPDATE planer SET tema=?1, aktivitet=?2, arbeidskrav=?3 WHERE uke=?4 AND år=?5 AND fag=?6",
            params![tema, aktivitet, arbeidskrav, uke, ar, fag],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav) VALUES (?1,?2,?3,?4,?5,?6)",
            params![uke, ar, fag, tema, aktivitet, arbeidskrav],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
