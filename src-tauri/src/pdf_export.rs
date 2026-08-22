use std::collections::BTreeMap;

use printpdf::*;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MM_TO_PT: f32 = 2.834_645_7;
const PAGE_W: f32 = 210.0 * MM_TO_PT;
const PAGE_H: f32 = 297.0 * MM_TO_PT;
const MARGIN: f32 = 10.0 * MM_TO_PT;

#[derive(Deserialize)]
pub struct PdfBilde {
    key: String,
    #[serde(rename = "dataB64")]
    data_b64: String,
}

#[derive(Deserialize)]
pub struct PdfSide {
    key: String,
}

#[tauri::command]
pub fn lagre_forhandsvisning_som_pdf(
    app: AppHandle,
    uke: i32,
    sider: Vec<PdfSide>,
    bilder: Vec<PdfBilde>,
) -> Result<Option<String>, String> {
    if sider.is_empty() {
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

    let mut bilde_data: BTreeMap<String, RawImage> = BTreeMap::new();
    for b in &bilder {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let Ok(bytes) = STANDARD.decode(&b.data_b64) else {
            continue;
        };
        let mut warnings = Vec::new();
        if let Ok(raw) = RawImage::decode_from_bytes(&bytes, &mut warnings) {
            bilde_data.insert(b.key.clone(), raw);
        }
    }

    let mut doc = PdfDocument::new("Ukeplan");
    let mut pages = Vec::new();

    for s in &sider {
        let Some(raw) = bilde_data.get(&s.key) else {
            continue;
        };
        if raw.width == 0 || raw.height == 0 {
            continue;
        }
        let id = doc.add_image(raw);

        let content_w = PAGE_W - 2.0 * MARGIN;
        let content_h = PAGE_H - 2.0 * MARGIN;
        let img_ratio = raw.height as f32 / raw.width as f32;

        let mut draw_w = content_w;
        let mut draw_h = draw_w * img_ratio;
        if draw_h > content_h {
            draw_h = content_h;
            draw_w = draw_h / img_ratio;
        }

        let x = MARGIN + (content_w - draw_w) / 2.0;
        let y = PAGE_H - MARGIN - draw_h;
        let dpi = raw.width as f32 * 72.0 / draw_w;

        let ops = vec![Op::UseXobject {
            id,
            transform: XObjectTransform {
                translate_x: Some(Pt(x)),
                translate_y: Some(Pt(y)),
                dpi: Some(dpi),
                ..Default::default()
            },
        }];

        pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
    }

    if pages.is_empty() {
        return Err("Ingen bilder å lagre".to_string());
    }

    let mut warnings = Vec::new();
    let bytes = doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut warnings);

    std::fs::write(&path_str, &bytes).map_err(|e| e.to_string())?;

    Ok(Some(path_str))
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
