use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn lagre_forhandsvisning_som_pdf(
    app: AppHandle,
    window: WebviewWindow,
    uke: i32,
) -> Result<Option<String>, String> {
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

    // TODO (Task 3): faktisk PrintToPdf-kall via WebView2 COM.
    let _ = window;
    Err("Ikke implementert ennå".to_string())
}
