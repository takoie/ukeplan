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
    //
    // MERK: Vi bruker IKKE `PrintToPdfCompletedHandler::wait_for_async_operation` her,
    // fordi den pumper en NESTET Win32-meldingsløkke (GetMessage) inne i hovedtråden
    // mens den allerede behandler `with_webview`-oppgaven - det låste seg i praksis.
    // I stedet registrerer vi completion-callbacken og returnerer fra `with_webview`
    // med det samme; den vanlige, allerede kjørende event-loopen leverer svaret senere.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let path_for_pdf = path_str.clone();

    window
        .with_webview(move |webview| {
            let tx_feil = tx.clone();
            let setup: Result<(), String> = (|| unsafe {
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
                settings.SetMarginTop(0.4).map_err(|e| e.to_string())?;
                settings.SetMarginBottom(0.4).map_err(|e| e.to_string())?;
                settings.SetMarginLeft(0.4).map_err(|e| e.to_string())?;
                settings.SetMarginRight(0.4).map_err(|e| e.to_string())?;

                let hpath = HSTRING::from(path_for_pdf.as_str());
                let tx_ferdig = tx.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(
                    move |hr: windows::core::Result<()>, success: bool| {
                        let utfall = match hr {
                            Err(e) => Err(e.to_string()),
                            Ok(()) if success => Ok(()),
                            Ok(()) => Err("PrintToPdf fullførte uten suksess".to_string()),
                        };
                        let _ = tx_ferdig.send(utfall);
                        Ok(())
                    },
                ));

                let r = core7
                    .PrintToPdf(&hpath, &settings, &handler)
                    .map_err(|e| e.to_string());

                // PrintToPdf er asynkron - fullføringen skjer et godt stykke etter at
                // selve kallet returnerer. `settings`, `hpath` og `handler` blir ellers
                // droppet (COM Release) med det samme denne lukkeren avsluttes, lenge
                // før operasjonen faktisk er ferdig - det ga en use-after-free/krasj i
                // praksis (observert som appen som låser seg / avsluttes uventet).
                // Behold derfor bevisst én ekstra referanse til hver til vi vet
                // operasjonen er ferdig (liten, engangs "lekkasje" per PDF-eksport,
                // akseptabelt for en sjelden, brukerinitiert handling).
                std::mem::forget(settings.clone());
                std::mem::forget(hpath.clone());
                std::mem::forget(handler.clone());

                r
            })();

            if let Err(e) = setup {
                let _ = tx_feil.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "Fikk ikke svar fra PrintToPdf".to_string())?
        .map(|_| Some(path_str))
}

#[tauri::command]
pub fn vis_pdf_i_utforsker(sti: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", sti))
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
