use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

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

    // `with_webview` bare poster en oppgave til hovedtråden når den kalles fra en
    // annen tråd (som Tauri-kommandoer som regel kjører på) - den venter IKKE på at
    // lukket fullfører. Derfor må vi selv blokkere på svaret via en kanal.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let path_for_pdf = path_str.clone();

    window
        .with_webview(move |webview| {
            let outcome: Result<(), String> = (|| unsafe {
                let core = webview
                    .controller()
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?;
                let core7: ICoreWebView2_7 = core.cast().map_err(|e| e.to_string())?;
                let environment: ICoreWebView2Environment6 = webview
                    .environment()
                    .cast()
                    .map_err(|e| e.to_string())?;
                let settings = environment
                    .CreatePrintSettings()
                    .map_err(|e| e.to_string())?;

                settings
                    .SetShouldPrintHeaderAndFooter(false)
                    .map_err(|e| e.to_string())?;
                settings
                    .SetShouldPrintBackgrounds(true)
                    .map_err(|e| e.to_string())?;
                settings
                    .SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)
                    .map_err(|e| e.to_string())?;

                let hpath = HSTRING::from(path_for_pdf.as_str());
                PrintToPdfCompletedHandler::wait_for_async_operation(
                    Box::new(move |handler| {
                        core7
                            .PrintToPdf(&hpath, &settings, &handler)
                            .map_err(Into::into)
                    }),
                    Box::new(|hr: windows::core::Result<()>, success: bool| {
                        hr?;
                        if success {
                            Ok(())
                        } else {
                            Err(windows::core::Error::from_win32())
                        }
                    }),
                )
                .map_err(|e| e.to_string())
            })();

            let _ = tx.send(outcome);
        })
        .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "Fikk ikke svar fra PrintToPdf".to_string())?
        .map(|_| Some(path_str))
}
