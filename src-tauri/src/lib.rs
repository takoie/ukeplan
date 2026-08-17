use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State, Window};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct AppState {
    pub python_process: Arc<Mutex<Option<Child>>>,
}

fn kill_python_process(state: &AppState) {
    if let Ok(mut guard) = state.python_process.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn start_python_backend(app: &AppHandle, state: &AppState) {
    let mut spawned_child: Option<Child> = None;

    let cwd = std::env::current_dir().unwrap_or_default();
    let root_dir = if cwd.join("app.py").exists() {
        cwd
    } else if cwd.join("..").join("app.py").exists() {
        cwd.join("..")
    } else {
        cwd
    };

    let py_candidates = vec![
        Some(root_dir.join("app.py")),
        app.path().resource_dir().ok().map(|p| p.join("app.py")),
        app.path().resource_dir().ok().map(|p| p.join("_up_").join("app.py")),
    ];

    for py_path in py_candidates.into_iter().flatten() {
        if py_path.exists() {
            let python_execs = ["python", "py", "python3"];
            for exec in python_execs {
                let mut cmd = Command::new(exec);
                cmd.arg(&py_path);
                if let Some(parent) = py_path.parent() {
                    cmd.current_dir(parent);
                }

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                if let Ok(child) = cmd.spawn() {
                    println!("Python backend startet med '{}' ({:?})", exec, py_path);
                    spawned_child = Some(child);
                    break;
                }
            }
            if spawned_child.is_some() {
                break;
            }
        }
    }

    if spawned_child.is_none() {
        let curr_exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()));
        let resource_dir = app.path().resource_dir().ok();

        let mut exe_candidates = Vec::new();
        if let Some(ref r) = resource_dir {
            exe_candidates.push(r.join("app.exe"));
            exe_candidates.push(r.join("_up_").join("app.exe"));
            exe_candidates.push(r.join("resources").join("app.exe"));
        }
        if let Some(ref d) = curr_exe_dir {
            exe_candidates.push(d.join("app.exe"));
            exe_candidates.push(d.join("resources").join("app.exe"));
            exe_candidates.push(d.join("resources").join("_up_").join("app.exe"));
            exe_candidates.push(d.join("_up_").join("app.exe"));
        }
        exe_candidates.push(root_dir.join("app.exe"));
        exe_candidates.push(root_dir.join("src-tauri").join("app.exe"));

        for cand in exe_candidates {
            if cand.exists() {
                let mut cmd = Command::new(&cand);
                if let Some(parent) = cand.parent() {
                    cmd.current_dir(parent);
                }

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                if let Ok(child) = cmd.spawn() {
                    println!("Python backend startet via binary {:?}", cand);
                    spawned_child = Some(child);
                    break;
                }
            }
        }
    }

    if let Some(child) = spawned_child {
        if let Ok(mut guard) = state.python_process.lock() {
            *guard = Some(child);
        }
    } else {
        eprintln!("Kunne ikke starte Python backend (hverken app.py eller app.exe ble startet).");
    }
}

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
fn app_close(app: AppHandle, state: State<'_, AppState>) {
    kill_python_process(&state);
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
fn restart_app(app: AppHandle, state: State<'_, AppState>) {
    kill_python_process(&state);
    tauri::process::restart(&app.env());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_state)
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            start_python_backend(&handle, &state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                kill_python_process(&state);
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_minimize,
            app_maximize,
            app_close,
            open_db_dialog,
            save_db_dialog,
            restart_app
        ])
        .run(tauri::generate_context!())
        .expect("Feil under kjøring av Tauri-applikasjon");
}
