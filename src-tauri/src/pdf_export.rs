use std::collections::BTreeMap;

use printpdf::*;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const MM_TO_PT: f32 = 2.834_645_7;
const PAGE_W: f32 = 210.0 * MM_TO_PT;
const PAGE_H: f32 = 297.0 * MM_TO_PT;
const MARGIN: f32 = 12.0 * MM_TO_PT;

const COL_GAP: f32 = 6.0;
const CARD_PAD: f32 = 8.0;
const CARD_GAP: f32 = 10.0;
const HEADER_H: f32 = 20.0;
const LABEL_SIZE: f32 = 8.0;
const BODY_SIZE: f32 = 9.0;
const LINE_H: f32 = BODY_SIZE * 1.4;
const AVG_CHAR_W_RATIO: f32 = 0.52; // grov, men trygg tilnærming for Helvetica

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum PdfSegment {
    Text { text: String },
    Image { key: String },
}

#[derive(Deserialize)]
pub struct PdfBilde {
    key: String,
    #[serde(rename = "dataB64")]
    data_b64: String,
}

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
    tema: Vec<PdfSegment>,
    aktivitet: Vec<PdfSegment>,
    arbeidskrav: Vec<PdfSegment>,
}

struct Bilde {
    raw: RawImage,
}

#[tauri::command]
pub fn lagre_forhandsvisning_som_pdf(
    app: AppHandle,
    uke: i32,
    fag_liste: Vec<PdfFag>,
    bilder: Vec<PdfBilde>,
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

    let mut bilde_data: BTreeMap<String, Bilde> = BTreeMap::new();
    for b in &bilder {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        let Ok(bytes) = STANDARD.decode(&b.data_b64) else {
            continue;
        };
        let mut warnings = Vec::new();
        if let Ok(raw) = RawImage::decode_from_bytes(&bytes, &mut warnings) {
            bilde_data.insert(b.key.clone(), Bilde { raw });
        }
    }

    let mut doc = PdfDocument::new("Ukeplan");
    let mut bilde_ids: BTreeMap<String, XObjectId> = BTreeMap::new();
    for (key, b) in &bilde_data {
        bilde_ids.insert(key.clone(), doc.add_image(&b.raw));
    }

    let mut layout = Layout::new();
    for f in &fag_liste {
        layout.tegn_fag(f, &bilde_data, &bilde_ids);
    }
    layout.avslutt_side();

    let pages: Vec<PdfPage> = layout
        .sider
        .into_iter()
        .map(|ops| PdfPage::new(Mm(210.0), Mm(297.0), ops))
        .collect();

    let mut warnings = Vec::new();
    let bytes = doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut warnings);

    std::fs::write(&path_str, &bytes).map_err(|e| e.to_string())?;

    Ok(Some(path_str))
}

struct Layout {
    sider: Vec<Vec<Op>>,
    ops: Vec<Op>,
    y: f32,
}

impl Layout {
    fn new() -> Self {
        Self {
            sider: Vec::new(),
            ops: Vec::new(),
            y: PAGE_H - MARGIN,
        }
    }

    fn ny_side(&mut self) {
        if !self.ops.is_empty() {
            self.sider.push(std::mem::take(&mut self.ops));
        }
        self.y = PAGE_H - MARGIN;
    }

    fn avslutt_side(&mut self) {
        if !self.ops.is_empty() {
            self.sider.push(std::mem::take(&mut self.ops));
        }
        if self.sider.is_empty() {
            self.sider.push(Vec::new());
        }
    }

    fn tegn_fag(
        &mut self,
        f: &PdfFag,
        bilde_data: &BTreeMap<String, Bilde>,
        bilde_ids: &BTreeMap<String, XObjectId>,
    ) {
        let content_w = PAGE_W - 2.0 * MARGIN;
        let col_w = [
            (content_w - 2.0 * COL_GAP) * (1.0 / 4.5),
            (content_w - 2.0 * COL_GAP) * (2.0 / 4.5),
            (content_w - 2.0 * COL_GAP) * (1.5 / 4.5),
        ];

        let kolonner = [
            (&f.tema_label, &f.tema, [0xb8, 0x86, 0x0b]),
            (&f.aktivitet_label, &f.aktivitet, [0x3b, 0xa5, 0x5c]),
            (&f.arbeidskrav_label, &f.arbeidskrav, [0xe6, 0x7e, 0x22]),
        ];

        let has_header = matches!(&f.header_tekst, Some(h) if !h.is_empty());
        let header_h = if has_header { HEADER_H } else { 0.0 };

        let mut kolonne_h = [0.0f32; 3];
        for (i, (_, segs, _)) in kolonner.iter().enumerate() {
            kolonne_h[i] = segment_hoyde(segs, col_w[i], bilde_data) + LABEL_SIZE + 8.0;
        }
        let content_h = kolonne_h.into_iter().fold(0.0f32, f32::max);
        let card_h = header_h + content_h + 2.0 * CARD_PAD;

        if self.y - card_h < MARGIN {
            self.ny_side();
        }

        let card_top = self.y;
        let card_bottom = card_top - card_h;

        // Kortramme
        self.ops.push(Op::SetOutlineColor {
            col: rgb(0xe2, 0xe8, 0xf0),
        });
        self.ops.push(Op::SetOutlineThickness { pt: Pt(0.75) });
        self.ops.push(Op::DrawRectangle {
            rectangle: rect(
                MARGIN,
                card_bottom,
                content_w,
                card_h,
                PaintMode::Stroke,
            ),
        });

        let mut y_cursor = card_top;

        if has_header {
            self.ops.push(Op::SetFillColor {
                col: rgb(0x1e, 0x29, 0x3b),
            });
            self.ops.push(Op::DrawRectangle {
                rectangle: rect(MARGIN, card_top - header_h, content_w, header_h, PaintMode::Fill),
            });
            self.tekst(
                f.header_tekst.as_deref().unwrap_or(""),
                MARGIN + CARD_PAD,
                card_top - header_h / 2.0 - 4.0,
                BuiltinFont::HelveticaBold,
                11.0,
                [0xff, 0xff, 0xff],
            );
            let uke_w = tekstbredde(&f.uke_label, 11.0);
            self.tekst(
                &f.uke_label,
                MARGIN + content_w - CARD_PAD - uke_w,
                card_top - header_h / 2.0 - 4.0,
                BuiltinFont::HelveticaBold,
                11.0,
                [0xff, 0xff, 0xff],
            );
            y_cursor -= header_h;
        }

        y_cursor -= CARD_PAD;

        let mut x_cursor = MARGIN;
        for (i, (label, segs, farge)) in kolonner.iter().enumerate() {
            let cw = col_w[i];

            // Farget venstrekant
            self.ops.push(Op::SetFillColor {
                col: rgb(farge[0], farge[1], farge[2]),
            });
            self.ops.push(Op::DrawRectangle {
                rectangle: rect(x_cursor, card_bottom + CARD_PAD, 3.0, content_h, PaintMode::Fill),
            });

            let text_x = x_cursor + CARD_PAD;
            let text_w = cw - CARD_PAD - 4.0;
            let mut cy = y_cursor;

            self.tekst(
                &label.to_uppercase(),
                text_x,
                cy,
                BuiltinFont::HelveticaBold,
                LABEL_SIZE,
                [farge[0], farge[1], farge[2]],
            );
            cy -= LABEL_SIZE + 8.0;

            for seg in segs.iter() {
                match seg {
                    PdfSegment::Text { text } => {
                        for linje in wrap_all(text, text_w) {
                            self.tekst(
                                &linje,
                                text_x,
                                cy,
                                BuiltinFont::Helvetica,
                                BODY_SIZE,
                                [0x0f, 0x17, 0x2a],
                            );
                            cy -= LINE_H;
                        }
                    }
                    PdfSegment::Image { key } => {
                        if let (Some(bilde), Some(id)) =
                            (bilde_data.get(key), bilde_ids.get(key))
                        {
                            let img_h = bilde_visning_hoyde(bilde, text_w);
                            let dpi = if text_w > 0.0 {
                                bilde.raw.width as f32 * 72.0 / text_w
                            } else {
                                300.0
                            };
                            self.ops.push(Op::UseXobject {
                                id: id.clone(),
                                transform: XObjectTransform {
                                    translate_x: Some(Pt(text_x)),
                                    translate_y: Some(Pt(cy - img_h)),
                                    dpi: Some(dpi),
                                    ..Default::default()
                                },
                            });
                            cy -= img_h + 6.0;
                        }
                    }
                }
            }

            x_cursor += cw + COL_GAP;
        }

        self.y = card_bottom - CARD_GAP;
    }

    fn tekst(&mut self, txt: &str, x: f32, y: f32, font: BuiltinFont, size: f32, farge: [u8; 3]) {
        if txt.is_empty() {
            return;
        }
        self.ops.push(Op::StartTextSection);
        self.ops.push(Op::SetTextCursor {
            pos: Point::new(Pt(x).into(), Pt(y).into()),
        });
        self.ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(font),
            size: Pt(size),
        });
        self.ops.push(Op::SetFillColor {
            col: rgb(farge[0], farge[1], farge[2]),
        });
        self.ops.push(Op::ShowText {
            items: vec![TextItem::Text(txt.to_string())],
        });
        self.ops.push(Op::EndTextSection);
    }
}

fn rgb(r: u8, g: u8, b: u8) -> Color {
    Color::Rgb(Rgb {
        r: r as f32 / 255.0,
        g: g as f32 / 255.0,
        b: b as f32 / 255.0,
        icc_profile: None,
    })
}

fn rect(x: f32, y: f32, w: f32, h: f32, mode: PaintMode) -> Rect {
    Rect {
        x: Pt(x),
        y: Pt(y),
        width: Pt(w),
        height: Pt(h),
        mode: Some(mode),
        winding_order: None,
    }
}

fn tekstbredde(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * size * AVG_CHAR_W_RATIO
}

fn maks_tegn_per_linje(bredde_pt: f32) -> usize {
    let n = (bredde_pt / (BODY_SIZE * AVG_CHAR_W_RATIO)).floor() as isize;
    n.max(4) as usize
}

fn wrap_line(text: &str, maks_tegn: usize) -> Vec<String> {
    let mut linjer = Vec::new();
    let mut current = String::new();
    for ord in text.split_whitespace() {
        let kandidat = if current.is_empty() {
            ord.to_string()
        } else {
            format!("{} {}", current, ord)
        };
        if kandidat.chars().count() > maks_tegn && !current.is_empty() {
            linjer.push(current);
            current = ord.to_string();
        } else {
            current = kandidat;
        }
    }
    if !current.is_empty() {
        linjer.push(current);
    }
    if linjer.is_empty() {
        linjer.push(String::new());
    }
    linjer
}

fn wrap_all(text: &str, bredde_pt: f32) -> Vec<String> {
    let maks = maks_tegn_per_linje(bredde_pt);
    text.split('\n')
        .flat_map(|para| wrap_line(para, maks))
        .collect()
}

fn segment_hoyde(segs: &[PdfSegment], bredde_pt: f32, bilde_data: &BTreeMap<String, Bilde>) -> f32 {
    let mut h = 0.0;
    for seg in segs {
        match seg {
            PdfSegment::Text { text } => {
                h += wrap_all(text, bredde_pt).len() as f32 * LINE_H;
            }
            PdfSegment::Image { key } => {
                if let Some(b) = bilde_data.get(key) {
                    h += bilde_visning_hoyde(b, bredde_pt) + 6.0;
                }
            }
        }
    }
    h
}

fn bilde_visning_hoyde(b: &Bilde, bredde_pt: f32) -> f32 {
    if b.raw.width == 0 {
        return 0.0;
    }
    bredde_pt * (b.raw.height as f32 / b.raw.width as f32)
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
