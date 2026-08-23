use std::collections::BTreeMap;

use printpdf::*;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MM_TO_PT: f32 = 2.834_645_7;
const PAGE_W: f32 = 210.0 * MM_TO_PT;
const PAGE_H: f32 = 297.0 * MM_TO_PT;
const MARGIN: f32 = 10.0 * MM_TO_PT;
const KORT_MELLOMROM: f32 = 6.0 * MM_TO_PT;
const TITTEL_MELLOMROM: f32 = 5.0 * MM_TO_PT;
const FOOTER_MELLOMROM: f32 = 2.0 * MM_TO_PT;
const FOOTER_DPI: f32 = 300.0;
const FOOTER_MAKS_BREDDE: f32 = 22.0 * MM_TO_PT;

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
    tittel_key: Option<String>,
    footer_key: Option<String>,
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

    let content_w = PAGE_W - 2.0 * MARGIN;
    let content_h_full = PAGE_H - 2.0 * MARGIN;

    // Skalerer et bilde til en gitt maks-bredde (bevarer sideforhold) og lager
    // UseXobject-operasjonen som plasserer det sentrert horisontalt ved gitt
    // avstand `y_from_top` fra toppen av innholdsområdet.
    let make_op = |doc: &mut PdfDocument, raw: &RawImage, max_w: f32, y_from_top: f32| -> (Op, f32) {
        let img_ratio = raw.height as f32 / raw.width as f32;
        let draw_w = max_w;
        let draw_h = draw_w * img_ratio;
        let id = doc.add_image(raw);
        let x = MARGIN + (content_w - draw_w) / 2.0;
        let y = PAGE_H - MARGIN - y_from_top - draw_h;
        let dpi = raw.width as f32 * 72.0 / draw_w;
        (
            Op::UseXobject {
                id,
                transform: XObjectTransform {
                    translate_x: Some(Pt(x)),
                    translate_y: Some(Pt(y)),
                    dpi: Some(dpi),
                    ..Default::default()
                },
            },
            draw_h,
        )
    };

    // Footeren tegnes i sin naturlige størrelse ved en fast DPI (ikke strukket
    // til å fylle en bredde) - ellers ville krymping av skriften i skjermbildet
    // ikke hatt noen effekt på hvor stor logoen ble på papiret.
    let footer_natural = |raw: &RawImage| -> (f32, f32) {
        let w = raw.width as f32 * 72.0 / FOOTER_DPI;
        let h = raw.height as f32 * 72.0 / FOOTER_DPI;
        if w > FOOTER_MAKS_BREDDE {
            let skala = FOOTER_MAKS_BREDDE / w;
            (w * skala, h * skala)
        } else {
            (w, h)
        }
    };

    let tittel_raw = tittel_key.as_ref().and_then(|k| bilde_data.get(k));
    let footer_raw = footer_key.as_ref().and_then(|k| bilde_data.get(k));

    // Footeren reserverer samme plass nederst på hver side.
    let footer_reserve = footer_raw
        .map(|raw| footer_natural(raw).1 + FOOTER_MELLOMROM)
        .unwrap_or(0.0);
    let content_h = content_h_full - footer_reserve;

    let finalize_page = |doc: &mut PdfDocument, mut ops: Vec<Op>| -> PdfPage {
        if let Some(raw) = footer_raw {
            let (draw_w, draw_h) = footer_natural(raw);
            let id = doc.add_image(raw);
            let x = MARGIN + (content_w - draw_w) / 2.0;
            let y = PAGE_H - MARGIN - content_h - FOOTER_MELLOMROM - draw_h;
            let dpi = raw.width as f32 * 72.0 / draw_w;
            ops.push(Op::UseXobject {
                id,
                transform: XObjectTransform {
                    translate_x: Some(Pt(x)),
                    translate_y: Some(Pt(y)),
                    dpi: Some(dpi),
                    ..Default::default()
                },
            });
        }
        PdfPage::new(Mm(210.0), Mm(297.0), ops)
    };

    let mut page_ops: Vec<Op> = Vec::new();
    let mut cursor_y = 0.0_f32; // avstand fra toppen av innholdsområdet, nedover

    if let Some(raw) = tittel_raw {
        let (op, draw_h) = make_op(&mut doc, raw, content_w, 0.0);
        page_ops.push(op);
        cursor_y = draw_h + TITTEL_MELLOMROM;
    }

    for s in &sider {
        let Some(raw) = bilde_data.get(&s.key) else {
            continue;
        };
        if raw.width == 0 || raw.height == 0 {
            continue;
        }
        let img_ratio = raw.height as f32 / raw.width as f32;
        let mut max_w = content_w;
        let mut draw_h = max_w * img_ratio;
        if draw_h > content_h {
            // Ett enkelt fagkort er høyere enn en hel side - skaler ned i stedet
            // for å dele det opp over flere sider.
            draw_h = content_h;
            max_w = draw_h / img_ratio;
        }

        // Hvis kortet ikke får plass i resten av gjeldende side, start ny side
        // i stedet for å risikere at kortet blir delt opp.
        if cursor_y > 0.0 && cursor_y + draw_h > content_h {
            pages.push(finalize_page(&mut doc, std::mem::take(&mut page_ops)));
            cursor_y = 0.0;
        }

        let (op, draw_h) = make_op(&mut doc, raw, max_w, cursor_y);
        page_ops.push(op);
        cursor_y += draw_h + KORT_MELLOMROM;
    }

    if !page_ops.is_empty() {
        pages.push(finalize_page(&mut doc, page_ops));
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
