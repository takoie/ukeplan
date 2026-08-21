# Lagre som PDF (Forhåndsvisning) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Lagre som PDF" button to the Forhåndsvisning view that saves exactly what's currently shown (respecting "Vis alle fag" and "Skjul header") as a clean PDF, with no WebView2 print header/footer (page numbers, localhost URL, date).

**Architecture:** Frontend clones the currently-rendered `#preview-container` into the existing hidden `#print-area` (already styled correctly by the `@media print` CSS used by the existing PDF-export feature). A new Tauri command then asks WebView2 directly — via COM, bypassing the interactive print dialog entirely — to render the current page to a PDF file with `ShouldPrintHeaderAndFooter = false`. This mirrors the existing `save_db_dialog` pattern (Rust owns the native save dialog too, not JS).

**Tech Stack:** Tauri 2.11, `webview2-com` 0.38.2 + `windows` 0.61.3 (pinned to match versions already resolved transitively via `wry`/`tauri`, see `docs/plans/2026-08-21-lagre-som-pdf-design.md`), vanilla JS (`renderer.js`), `tauri-plugin-dialog` (already a dependency, used from Rust).

**Design doc:** `docs/plans/2026-08-21-lagre-som-pdf-design.md`

**No automated test framework exists in this project** (no test script in `package.json`, no Rust `#[test]` harness wired to a runner). Every task below ends with a manual verification step instead of an automated test — this is a deliberate, already-agreed deviation from TDD, not an oversight.

---

### Task 1: Add pinned `webview2-com` / `windows` dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Confirm the exact resolved versions haven't changed**

Run: `cd src-tauri && cargo tree -i webview2-com`
Expected: still shows `webview2-com v0.38.2` pulled in via `tauri`/`wry` (confirmed during design). If the version differs, use whatever version is now shown instead of 0.38.2 below.

**Step 2: Add the dependencies**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
webview2-com = "0.38.2"
windows = { version = "0.61.3", features = [
    "Win32_Foundation",
    "Win32_System_Com",
    "Win32_Web_WebView2",
] }
```

**Step 3: Verify it still compiles and doesn't duplicate the crate**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors. Then run `cargo tree -i webview2-com` again — expected: still exactly **one** `webview2-com v0.38.2` in the tree (not two different versions). If cargo pulls a second version, tighten the version pin in Cargo.toml (e.g. `=0.38.2`) and re-check.

**Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build: add webview2-com/windows deps for native PDF export"
```

---

### Task 2: Create the `pdf_export` module skeleton and wire it up

**Files:**
- Create: `src-tauri/src/pdf_export.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create the skeleton command**

`src-tauri/src/pdf_export.rs`:

```rust
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
```

**Step 2: Wire the module into `lib.rs`**

In `src-tauri/src/lib.rs`, add near the other `mod` declarations:

```rust
mod pdf_export;
```

Add `pdf_export::lagre_forhandsvisning_som_pdf` to the `tauri::generate_handler![...]` list (after `commands::lagre_plan,`).

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (the command exists and is registered, even though it always errors for now).

**Step 4: Commit**

```bash
git add src-tauri/src/pdf_export.rs src-tauri/src/lib.rs
git commit -m "feat: skeleton lagre_forhandsvisning_som_pdf command"
```

---

### Task 3: Implement the actual PrintToPdf call

**Files:**
- Modify: `src-tauri/src/pdf_export.rs`

This is the technically risky part flagged in the design doc — the exact accessor chain from `WebviewWindow` down to `ICoreWebView2Environment6` was not fully confirmed during design (docs.rs excerpts were incomplete on this one link). Treat the snippet below as a strong starting point, not gospel — confirm each type against `docs.rs/webview2-com/0.38.2` (or the vendored source under `~/.cargo/registry/src/.../webview2-com-0.38.2/`) as you go, since the local checked-out source is the fastest ground truth.

**Step 1: Look up the exact accessor for the environment**

Run: `find ~/.cargo/registry/src -maxdepth 1 -iname 'webview2-com-0.38.2'`
Then grep that directory for `fn Environment` / `CreatePrintSettings` / `PrintToPdf` to get exact, version-matched signatures instead of relying on docs.rs summaries:

Run: `grep -rn "CreatePrintSettings\|fn PrintToPdf\|fn Environment" <path-from-above>/src`

**Step 2: Implement the command body**

Replace the `TODO` in `lagre_forhandsvisning_som_pdf` with something along these lines (adjust exact type/interface names per what Step 1 found):

```rust
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_16, ICoreWebView2Environment6, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

// ... inside lagre_forhandsvisning_som_pdf, after computing path_str:

let mut result: Result<(), String> = Err("PrintToPdf ble aldri kalt".to_string());

window
    .with_webview(|webview| {
        let core = webview.controller().CoreWebView2().expect("CoreWebView2 mangler");
        let core16: ICoreWebView2_16 = core.cast().expect("ICoreWebView2_16 ikke støttet");

        // Bekreft nøyaktig kall her ut fra Step 1 sitt søk:
        let environment: ICoreWebView2Environment6 = /* hent fra core/controller */ todo!();
        let settings = environment.CreatePrintSettings().expect("CreatePrintSettings feilet");

        settings.SetShouldPrintHeaderAndFooter(false).unwrap();
        settings.SetShouldPrintBackgrounds(true).unwrap();
        settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT).unwrap();

        let hpath = HSTRING::from(path_str.as_str());
        let op_result = PrintToPdfCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| unsafe { core16.PrintToPdf(&hpath, &settings, &handler) }.map_err(Into::into)),
            Box::new(|hr, success| {
                hr.ok()?;
                if success.as_bool() { Ok(()) } else { Err(windows::core::Error::from_win32()) }
            }),
        );
        result = op_result.map_err(|e| e.to_string());
    })
    .map_err(|e| e.to_string())?;

result.map(|_| Some(path_str))
```

**Step 3: Manual verification**

1. Run `npm run dev`.
2. Go to Forhåndsvisning, pick a subject/week with data.
3. Add a temporary button or reuse dev tools console to call `invoke('lagre_forhandsvisning_som_pdf', { uke: <week> })` directly (Task 4/5 wire up the real button — this step just proves the Rust side works before touching the UI).
4. Confirm the save dialog appears, pick a location, confirm a PDF file is created at that path.
5. Open the PDF: confirm there is **no** header/footer (no page number, no `localhost` URL, no date).

If it doesn't compile or the environment accessor is wrong, iterate here — this is expected per the design doc's flagged risk. Don't move to Task 4 until a PDF is successfully produced this way.

**Step 4: Commit**

```bash
git add src-tauri/src/pdf_export.rs
git commit -m "feat: implement native PrintToPdf without header/footer"
```

---

### Task 4: Add the "Lagre som PDF" button to the UI

**Files:**
- Modify: `index.html:194-196`

**Step 1: Add the button next to "Kopier bilde"**

```html
<button class="btn btn-success" id="kopier-bilde-btn"
    style="height: 36px; box-sizing: border-box;"><i class="fas fa-copy"></i> Kopier bilde</button>
<button class="btn btn-success" id="lagre-pdf-btn"
    style="height: 36px; box-sizing: border-box;"><i class="fas fa-file-pdf"></i> Lagre som PDF</button>
```

**Step 2: Manual verification**

Run `npm run dev`, go to Forhåndsvisning, confirm the button renders next to "Kopier bilde" (it won't do anything yet — no click handler until Task 5).

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add Lagre som PDF button to forhåndsvisning"
```

---

### Task 5: Wire up the click handler in `renderer.js`

**Files:**
- Modify: `renderer.js` (add near the existing `kopier-bilde-btn` handler at line 1337)

**Step 1: Add the handler**

```javascript
document.getElementById('lagre-pdf-btn')?.addEventListener('click', async () => {
    const printArea = document.getElementById('print-area');
    const previewContainer = document.getElementById('preview-container');
    const uke = document.getElementById('preview-uke-input')?.value || document.getElementById('uke-input').value;
    const status = document.getElementById('bilde-status');

    if (!previewContainer || !previewContainer.innerHTML.trim()) {
        if (status) { status.textContent = 'Ingen plan å lagre.'; status.style.color = '#e74c3c'; }
        return;
    }

    printArea.innerHTML = previewContainer.innerHTML;

    try {
        const result = await invokeCommand('lagre_forhandsvisning_som_pdf', { uke: Number(uke) });
        if (result) {
            if (status) { status.textContent = `Lagret: ${result}`; status.style.color = '#43b581'; }
        }
        // result === null betyr at brukeren avbrøt lagre-dialogen — ingen feilmelding.
    } catch (e) {
        if (status) { status.textContent = 'Kunne ikke lagre PDF: ' + (e.message || e); status.style.color = '#e74c3c'; }
    } finally {
        printArea.innerHTML = '';
    }
});
```

Check what `invokeCommand` actually is in this codebase before pasting (grep `function invokeCommand` in `renderer.js`) — use whatever wrapper the rest of the file already uses around `@tauri-apps/api/core`'s `invoke`, don't introduce a second way of calling commands.

**Step 2: Manual verification**

1. Run `npm run dev`.
2. Forhåndsvisning → single subject → click "Lagre som PDF" → pick a location → confirm status message shows the saved path, and the PDF has no header/footer.
3. Toggle "Skjul header" on → repeat → confirm the PDF also has no in-content subject/week header.
4. Toggle "Vis alle fag" on → repeat → confirm the PDF contains all subjects stacked (no forced page breaks between subjects, but no subject split awkwardly across a page break either — `break-inside: avoid` on `.preview-card` should hold).
5. Cancel the save dialog → confirm no error toast appears.
6. Try with no data for the selected week/subject → confirm the "Ingen plan å lagre" message shows and no PDF is generated.

**Step 3: Commit**

```bash
git add renderer.js
git commit -m "feat: wire Lagre som PDF button to native PDF export"
```

---

### Task 6: Polish PDF margins if needed

**Files:**
- Modify: `styles.css` (inside the existing `@media print` block, ~line 1038)

**Step 1: Judge the output from Task 5's manual test**

If the generated PDF looks cramped (content touching page edges) because `SetMarginTop/Bottom/Left/Right` weren't set in Task 3 (defaulting to WebView2's own defaults), add explicit margins there instead of touching CSS — margins set via `ICoreWebView2PrintSettings` are the correct place, not `@page` (the print-to-PDF path does honor `@page` margin CSS too, but keep one source of truth — prefer the Rust settings since Task 3 already touches that object).

If it already looks fine, skip this task entirely — don't add speculative styling nobody asked for.

**Step 2: Commit (only if a change was made)**

```bash
git add src-tauri/src/pdf_export.rs
git commit -m "fix: adjust PDF margins"
```

---

### Task 7: Update the knowledge graph

Per this project's `CLAUDE.md`, after adding new files / changing code relations, remind the user to run:

```powershell
graphify . --code-only; graphify cluster-only .
```

(Or run it yourself if asked to.)
