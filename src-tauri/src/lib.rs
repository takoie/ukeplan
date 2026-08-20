mod commands;
mod db;

use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn app_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn app_maximize(window: Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn app_close(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_db_dialog(app: AppHandle) -> Option<String> {
    let file = app.dialog().file().add_filter("Database", &["db"]).blocking_pick_file();
    file.and_then(|p| match p {
        tauri_plugin_dialog::FilePath::Path(path) => Some(path.to_string_lossy().to_string()),
        _ => None,
    })
}

#[tauri::command]
fn save_db_dialog(app: AppHandle) -> Option<String> {
    let file = app.dialog()
        .file()
        .set_title("Opprett ny database")
        .set_file_name("ukeplaner_database.db")
        .add_filter("Database", &["db"])
        .blocking_save_file();
    file.and_then(|p| match p {
        tauri_plugin_dialog::FilePath::Path(path) => Some(path.to_string_lossy().to_string()),
        _ => None,
    })
}

#[tauri::command]
fn prepare_for_update() {}

#[tauri::command]
fn restart_app(app: AppHandle) {
    tauri::process::restart(&app.env());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = db::init_db(&db::get_active_db_path()) {
        eprintln!("[FEIL] Kunne ikke initialisere database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_minimize,
            app_maximize,
            app_close,
            open_db_dialog,
            save_db_dialog,
            prepare_for_update,
            restart_app,
            commands::get_db_path,
            commands::set_db_path,
            commands::move_db,
            commands::open_export_folder,
            commands::hent_fag,
            commands::lagre_nytt_fag,
            commands::endre_navn_fag,
            commands::slett_fag,
            commands::eksporter_fag,
            commands::importer_fag,
            commands::hent_plan,
            commands::hent_forrige_plan,
            commands::hent_planer_periode,
            commands::sok_planer,
            commands::hent_tidslinje,
            commands::lagre_plan,
        ])
        .run(tauri::generate_context!())
        .expect("Feil under kjøring av Tauri-applikasjon");
}
