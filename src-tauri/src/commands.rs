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

// ---------------------------------------------------------------------------
// PERIODEPLAN – flere uker som deler innhold («levende kobling»).
//
// Ingen egen tabell: alle uker i en periode har samme `planer.periode_id`
// (per fag/år). Innholdet ligger i hver ukesrad som før, så Visning, PDF,
// søk og deling er uendret. Redigering av én uke propageres til de andre
// via `propager_til_periode` (kalt fra lagringen i ukeeditoren).
// ---------------------------------------------------------------------------

/// Fjerner `<tag ...>...</tag>`-par inkludert innholdet. Malen for en «nullstilt»
/// uke består bare av fete dag-/lekseoverskrifter, så vi luker dem ut før vi
/// avgjør om uka egentlig har innhold.
fn fjern_tag_par(html: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut s = html.to_string();
    loop {
        let Some(a) = s.find(&open) else { break };
        let Some(rel_gt) = s[a..].find('>') else { break };
        let Some(rel_close) = s[a..].find(&close) else { break };
        if rel_close < rel_gt {
            break;
        }
        let b = a + rel_close + close.len();
        s.replace_range(a..b, "");
    }
    s
}

fn fjern_alle_tagger(html: &str) -> String {
    let mut ut = String::with_capacity(html.len());
    let mut inne_i_tag = false;
    for c in html.chars() {
        match c {
            '<' => inne_i_tag = true,
            '>' => inne_i_tag = false,
            _ if !inne_i_tag => ut.push(c),
            _ => {}
        }
    }
    ut
}

/// True hvis uka har reelt innhold en lærer ville blitt lei seg for å miste –
/// altså mer enn den tomme standardmalen (fete dagoverskrifter + blanke linjer).
fn har_reelt_innhold(
    tema: &Option<String>,
    aktivitet: &Option<String>,
    arbeidskrav: &Option<String>,
) -> bool {
    if tema.as_deref().map(|t| !t.trim().is_empty()).unwrap_or(false) {
        return true;
    }
    for felt in [aktivitet, arbeidskrav] {
        let Some(html) = felt else { continue };
        let lav = html.to_lowercase();
        if lav.contains("<img") {
            return true;
        }
        let ren = fjern_alle_tagger(&fjern_tag_par(&lav, "strong"))
            .replace("&nbsp;", " ")
            .replace('\u{00a0}', " ");
        if !ren.trim().is_empty() {
            return true;
        }
    }
    false
}

/// Intervallet (min/maks uke) og id-en for perioden en gitt uke tilhører.
/// Brukes til banneret i ukeeditoren. Returnerer None hvis uka ikke er koblet.
#[tauri::command]
pub fn hent_periode_for_uke(
    fag: String,
    ar: i64,
    uke: i64,
) -> Result<Option<db::PeriodeInfo>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let periode_id: Option<i64> = conn
        .query_row(
            "SELECT periode_id FROM planer WHERE fag=?1 AND år=?2 AND uke=?3",
            params![fag, ar, uke],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let Some(pid) = periode_id else {
        return Ok(None);
    };

    let (start_uke, slutt_uke): (i64, i64) = conn
        .query_row(
            "SELECT MIN(uke), MAX(uke) FROM planer WHERE fag=?1 AND år=?2 AND periode_id=?3",
            params![fag, ar, pid],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    Ok(Some(db::PeriodeInfo {
        periode_id: pid,
        start_uke,
        slutt_uke,
    }))
}

/// Ukene i intervallet som allerede har innhold og ikke tilhører denne perioden.
/// Frontenden bruker lista til å la læreren velge hva som skal overskrives.
#[tauri::command]
pub fn sjekk_periode_kollisjon(
    fag: String,
    ar: i64,
    start_uke: i64,
    slutt_uke: i64,
    ekskluder_periode_id: Option<i64>,
) -> Result<Vec<i64>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let ekskluder = ekskluder_periode_id.unwrap_or(-1);
    let mut stmt = conn
        .prepare(
            "SELECT uke, tema, aktivitet, arbeidskrav FROM planer
             WHERE fag=?1 AND år=?2 AND uke>=?3 AND uke<=?4
               AND (periode_id IS NULL OR periode_id<>?5)
             ORDER BY uke ASC",
        )
        .map_err(|e| e.to_string())?;
    let rader = stmt
        .query_map(params![fag, ar, start_uke, slutt_uke, ekskluder], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut kolliderer = Vec::new();
    for rad in rader {
        let (uke, tema, akt, krav) = rad.map_err(|e| e.to_string())?;
        if har_reelt_innhold(&tema, &akt, &krav) {
            kolliderer.push(uke);
        }
    }
    Ok(kolliderer)
}

/// Skriver innholdet til hver uke i [start_uke, slutt_uke] og kobler dem sammen.
/// Uker med eksisterende innhold røres bare hvis de allerede tilhører `periode_id`
/// eller står i `overskriv_uker`. Returnerer periode-id-en.
#[allow(clippy::too_many_arguments)]
fn skriv_periode(
    tx: &rusqlite::Transaction,
    periode_id: i64,
    fag: &str,
    ar: i64,
    start_uke: i64,
    slutt_uke: i64,
    tema: &Option<String>,
    aktivitet: &Option<String>,
    arbeidskrav: &Option<String>,
    overskriv_uker: &[i64],
) -> Result<(), String> {
    for uke in start_uke..=slutt_uke {
        let eksisterende: Option<(Option<i64>, Option<String>, Option<String>, Option<String>)> = tx
            .query_row(
                "SELECT periode_id, tema, aktivitet, arbeidskrav FROM planer WHERE uke=?1 AND år=?2 AND fag=?3",
                params![uke, ar, fag],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        match eksisterende {
            None => {
                tx.execute(
                    "INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav, periode_id) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                    params![uke, ar, fag, tema, aktivitet, arbeidskrav, periode_id],
                )
                .map_err(|e| e.to_string())?;
            }
            Some((rad_periode, r_tema, r_akt, r_krav)) => {
                let tilhorer_perioden = rad_periode == Some(periode_id);
                let uten_reelt_innhold = !har_reelt_innhold(&r_tema, &r_akt, &r_krav);
                let godkjent = overskriv_uker.contains(&uke);
                if tilhorer_perioden || uten_reelt_innhold || godkjent {
                    tx.execute(
                        "UPDATE planer SET tema=?1, aktivitet=?2, arbeidskrav=?3, periode_id=?4 WHERE uke=?5 AND år=?6 AND fag=?7",
                        params![tema, aktivitet, arbeidskrav, periode_id, uke, ar, fag],
                    )
                    .map_err(|e| e.to_string())?;
                }
                // ellers: uka hadde innhold og ble ikke godkjent – la den stå urørt.
            }
        }
    }
    Ok(())
}

/// Lager en ny periodeplan fra ukeeditoren: kobler sammen ukene i intervallet
/// og legger dagens editorinnhold på alle sammen.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn opprett_periode(
    fag: String,
    ar: i64,
    start_uke: i64,
    slutt_uke: i64,
    tema: Option<String>,
    aktivitet: Option<String>,
    arbeidskrav: Option<String>,
    overskriv_uker: Vec<i64>,
) -> Result<i64, String> {
    if start_uke > slutt_uke {
        return Err("Startuke kan ikke være etter sluttuke".to_string());
    }
    if start_uke < 1 || slutt_uke > 53 {
        return Err("Ukeintervallet må være mellom 1 og 53".to_string());
    }

    let mut conn = db::get_connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let periode_id: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(periode_id), 0) + 1 FROM planer",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    skriv_periode(
        &tx,
        periode_id,
        &fag,
        ar,
        start_uke,
        slutt_uke,
        &tema,
        &aktivitet,
        &arbeidskrav,
        &overskriv_uker,
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(periode_id)
}

/// Endrer ukeintervallet til en eksisterende periode. Uker som faller utenfor
/// kobles fra (innholdet blir stående), nye uker får periodens innhold.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn endre_periode(
    fag: String,
    ar: i64,
    periode_id: i64,
    start_uke: i64,
    slutt_uke: i64,
    tema: Option<String>,
    aktivitet: Option<String>,
    arbeidskrav: Option<String>,
    overskriv_uker: Vec<i64>,
) -> Result<(), String> {
    if start_uke > slutt_uke {
        return Err("Startuke kan ikke være etter sluttuke".to_string());
    }
    if start_uke < 1 || slutt_uke > 53 {
        return Err("Ukeintervallet må være mellom 1 og 53".to_string());
    }

    let mut conn = db::get_connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE planer SET periode_id=NULL WHERE fag=?1 AND år=?2 AND periode_id=?3 AND (uke<?4 OR uke>?5)",
        params![fag, ar, periode_id, start_uke, slutt_uke],
    )
    .map_err(|e| e.to_string())?;

    skriv_periode(
        &tx,
        periode_id,
        &fag,
        ar,
        start_uke,
        slutt_uke,
        &tema,
        &aktivitet,
        &arbeidskrav,
        &overskriv_uker,
    )?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Oppløser hele periodeplanen: alle ukene blir frittstående. Innholdet blir
/// stående i hver uke.
#[tauri::command]
pub fn koble_fra_periode(fag: String, ar: i64, periode_id: i64) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE planer SET periode_id=NULL WHERE fag=?1 AND år=?2 AND periode_id=?3",
        params![fag, ar, periode_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Tar én uke ut av periodeplanen. De andre ukene henger fortsatt sammen.
/// Blir det bare én uke igjen, oppløses resten også (en periode på én uke
/// gir ingen mening). Innholdet blir stående i alle ukene.
#[tauri::command]
pub fn los_uke_fra_periode(fag: String, ar: i64, uke: i64) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let periode_id: Option<i64> = conn
        .query_row(
            "SELECT periode_id FROM planer WHERE fag=?1 AND år=?2 AND uke=?3",
            params![fag, ar, uke],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    conn.execute(
        "UPDATE planer SET periode_id=NULL WHERE fag=?1 AND år=?2 AND uke=?3",
        params![fag, ar, uke],
    )
    .map_err(|e| e.to_string())?;

    if let Some(pid) = periode_id {
        let igjen: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM planer WHERE fag=?1 AND år=?2 AND periode_id=?3",
                params![fag, ar, pid],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if igjen <= 1 {
            conn.execute(
                "UPDATE planer SET periode_id=NULL WHERE fag=?1 AND år=?2 AND periode_id=?3",
                params![fag, ar, pid],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Hvis uka er koblet til en periode: kopier innholdet til alle de andre ukene
/// i perioden. Kalles rett etter vanlig lagring i ukeeditoren. No-op ellers.
#[tauri::command]
pub fn propager_til_periode(
    fag: String,
    ar: i64,
    uke: i64,
    tema: Option<String>,
    aktivitet: Option<String>,
    arbeidskrav: Option<String>,
) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let periode_id: Option<i64> = conn
        .query_row(
            "SELECT periode_id FROM planer WHERE fag=?1 AND år=?2 AND uke=?3",
            params![fag, ar, uke],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    let Some(pid) = periode_id else {
        return Ok(());
    };

    conn.execute(
        "UPDATE planer SET tema=?1, aktivitet=?2, arbeidskrav=?3
         WHERE fag=?4 AND år=?5 AND periode_id=?6 AND uke<>?7",
        params![tema, aktivitet, arbeidskrav, fag, ar, pid, uke],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
