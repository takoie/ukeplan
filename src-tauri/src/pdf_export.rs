use std::collections::BTreeMap;

use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
pub struct PdfFag {
    #[serde(rename = "headerTekst")]
    header_tekst: Option<String>,
    #[serde(rename = "ukeLabel")]
    uke_label: String,
    #[serde(rename = "temaLabel")]
    tema_label: String,
    #[serde(rename = "aktivitetLabel")]
    aktivitet_label: String,
    #[serde(rename = "arbeidskravLabel")]
    arbeidskrav_label: String,
    tema: String,
    aktivitet: String,
    arbeidskrav: String,
}

#[tauri::command]
pub fn lagre_forhandsvisning_som_pdf(
    app: AppHandle,
    uke: i32,
    fag_liste: Vec<PdfFag>,
) -> Result<Option<String>, String> {
    if fag_liste.is_empty() {
        return Err("Ingen fag valgt".to_string());
    }

    let sti = app
        .dialog()
        .file()
        .set_title("Lagre som PDF")
        .set_file_name(&format!("Ukeplan - Uke{}.pdf", uke))
        .add_filter("PDF", &["pdf"])
        .blocking_save_file();

    let Some(path) = sti else {
        return Ok(None); // brukeren avbrøt dialogen
    };

    let path_str = match path {
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
        _ => return Err("Ugyldig filsti".to_string()),
    };

    let html = bygg_html(&fag_liste);

    let images: BTreeMap<String, printpdf::Base64OrRaw> = BTreeMap::new();
    let fonts: BTreeMap<String, printpdf::Base64OrRaw> = BTreeMap::new();
    let options = printpdf::GeneratePdfOptions {
        page_width: Some(210.0),
        page_height: Some(297.0),
        margin_top: Some(12.0),
        margin_bottom: Some(12.0),
        margin_left: Some(12.0),
        margin_right: Some(12.0),
        ..Default::default()
    };

    let mut warnings = Vec::new();
    let doc = printpdf::PdfDocument::from_html(&html, &images, &fonts, &options, &mut warnings)
        .map_err(|e| e.to_string())?;

    let mut save_warnings = Vec::new();
    let bytes = doc.save(&printpdf::PdfSaveOptions::default(), &mut save_warnings);

    std::fs::write(&path_str, &bytes).map_err(|e| e.to_string())?;

    Ok(Some(path_str))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn text_to_html(s: &str) -> String {
    html_escape(s).replace('\n', "<br/>")
}

fn bygg_html(fag_liste: &[PdfFag]) -> String {
    let mut cards = String::new();

    for f in fag_liste {
        let header = match &f.header_tekst {
            Some(h) if !h.is_empty() => format!(
                r#"<div class="header"><span>{}</span><span>{}</span></div>"#,
                html_escape(h),
                html_escape(&f.uke_label)
            ),
            _ => String::new(),
        };

        cards.push_str(&format!(
            r#"<div class="card">{header}<div class="grid">
<div class="col col-tema"><div class="h">{tema_label}</div><div class="txt">{tema}</div></div>
<div class="col col-akt"><div class="h">{akt_label}</div><div class="txt">{akt}</div></div>
<div class="col col-krav"><div class="h">{krav_label}</div><div class="txt">{krav}</div></div>
</div></div>"#,
            header = header,
            tema_label = html_escape(&f.tema_label),
            tema = text_to_html(&f.tema),
            akt_label = html_escape(&f.aktivitet_label),
            akt = text_to_html(&f.aktivitet),
            krav_label = html_escape(&f.arbeidskrav_label),
            krav = text_to_html(&f.arbeidskrav),
        ));
    }

    format!(
        r#"<html><head><style>
body {{ font-family: Helvetica; color: #0f172a; font-size: 9pt; }}
.card {{ border: 1px solid #e2e8f0; margin-bottom: 14px; break-inside: avoid; }}
.header {{ display: flex; justify-content: space-between; background-color: #1e293b; color: #ffffff; padding: 6px 14px; font-weight: bold; font-size: 11pt; border-bottom: 3px solid #6366f1; }}
.grid {{ display: flex; }}
.col {{ flex: 1; padding: 10px 14px; border-right: 1px solid #e2e8f0; border-left: 4px solid #faa61a; }}
.col-akt {{ flex: 2; border-left: 4px solid #3ba55c; }}
.col-krav {{ flex: 1.5; border-left: 4px solid #e67e22; border-right: none; }}
.h {{ font-weight: bold; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #f1f5f9; }}
.col-tema .h {{ color: #b8860b; }}
.col-akt .h {{ color: #3ba55c; }}
.col-krav .h {{ color: #e67e22; }}
.txt {{ font-size: 9pt; line-height: 1.5; }}
</style></head><body>{cards}</body></html>"#,
        cards = cards
    )
}

#[tauri::command]
pub fn apne_pdf_fil(sti: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&sti)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&sti)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&sti)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn vis_pdf_i_utforsker(sti: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // explorer.exe sin egen kommandolinje-parsing for /select, er kresen på
        // mellomrom i stien - Rusts vanlige (og korrekte) automatiske sitering av
        // hele argumentet ("/select,C:\... med mellomrom") forvirrer explorer,
        // som da faller tilbake til en standardmappe. Bygg derfor `/select,"<sti>"`
        // som ett rått argument, slik explorer selv forventer det.
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", sti))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &sti])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mappe = std::path::Path::new(&sti)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(sti);
        std::process::Command::new("xdg-open")
            .arg(mappe)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
