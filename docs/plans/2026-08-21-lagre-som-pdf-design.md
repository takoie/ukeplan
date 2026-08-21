# Lagre som PDF (Forhåndsvisning) — Design

## Formål

I Forhåndsvisning-visningen (`#preview-container`) kan læreren i dag se ukeplan for ett fag eller alle fag (`toggle-all-fag`), med eller uten fag/uke-header (`toggle-hide-header`). Læreren mangler en måte å ta med seg ukeplanen fysisk. Ny funksjon: en «Lagre som PDF»-knapp som lagrer nøyaktig det som vises, som en ren PDF uten Windows/WebView2 sin standard topp-/bunntekst (sidetall, URL/localhost, dato).

## UI/UX

- Ny knapp **«Lagre som PDF»** i Forhåndsvisning, plassert ved siden av eksisterende «Kopier bilde»-knapp (`index.html` ~linje 194-196).
- Klikk:
  1. Åpne Tauri sin lagre-dialog (`@tauri-apps/plugin-dialog`, allerede en avhengighet) med forslått filnavn **`Ukeplan - Uke{N}.pdf`** (N = valgt uke) og filter for `.pdf`.
  2. Avbrytes dialogen → ingenting skjer.
  3. Innholdet som skal bli PDF er nøyaktig det som er rendret i `#preview-container` akkurat nå — inkluderer allerede riktig tilstand for `toggle-all-fag` og `toggle-hide-header`, siden det er det brukeren ser.
  4. Fagene stables under hverandre som i dag (ingen tvungne sideskift mellom fag, samme som eksisterende `@media print`-regler i `styles.css` allerede gir for `.preview-card`).
  5. Ved suksess/feil: vis status via eksisterende toast/notification-mønster i appen.

## Dataflyt

```
[Lagre som PDF-knapp]
   → plugin-dialog.save() → sti (eller avbrutt)
   → klon #preview-container sitt innhold inn i skjult #print-area
     (gjenbruker eksisterende @media print CSS: hvit bakgrunn, svart tekst,
     break-inside: avoid per .preview-card)
   → invoke('lagre_forhandsvisning_som_pdf', { sti })
   → Rust: hent WebView2-kontrolleren for vinduet, kall PrintToPdf
     med ShouldPrintHeaderAndFooter = false
   → vent på completion-callback (async, via kanal)
   → returner Ok/Err til frontend
   → tøm #print-area igjen, vis status til bruker
```

## Backend (Rust / WebView2)

Ny Tauri-kommando, sannsynligvis `src-tauri/src/pdf_export.rs`:

```rust
#[tauri::command]
async fn lagre_forhandsvisning_som_pdf(window: tauri::WebviewWindow, sti: String) -> Result<(), String>
```

- Bruker `window.with_webview(...)` til å hente den rå WebView2-kontrolleren (kun Windows).
- Kaller WebView2 sitt native `PrintToPdf`-API direkte via COM, med eksplisitte print-innstillinger:
  - `ShouldPrintHeaderAndFooter = false` (løser problemet med sidetall/localhost/dato — dette er ikke styrbart via CSS, kun via denne native APIen)
  - `ShouldPrintBackgrounds = true` (så fargede kort-kanter/bakgrunner tas med)
  - Fornuftige marger og A4-format
- Nye avhengigheter i `Cargo.toml`: `webview2-com` og `windows`, **låst til samme versjon** som Tauri/wry allerede drar inn transitivt (`webview2-com 0.38.2`, `windows 0.61.3`) for å unngå duplikate/inkompatible COM-bindinger.
- Async completion fra COM-callbacken kobles tilbake til Tauri-kommandoen via en kanal (f.eks. `tokio::sync::oneshot`), siden `PrintToPdf` selv er non-blocking og fullfører senere på WebView2 sin egen event-loop.

**Risiko/usikkerhet (bevisst akseptert av bruker):** Dette er lavnivå Windows COM-interop. Nøyaktige interface-/metodenavn i `webview2-com`-bindingene bekreftes først under selve implementeringen — kan kreve litt iterasjon.

## CSS

Gjenbruker eksisterende `@media print`-blokk i `styles.css` (linje 1038-1068) uendret — den skjuler alt unntatt `#print-area`, gir hvit bakgrunn/svart tekst og unngår sideskift midt i et fag-kort. Ingen endring nødvendig her utover ev. justering av marger (`@page`) om PDF-en ser for tettpakket ut ved test.

## Feilhåndtering

- Avbrutt lagre-dialog → stille no-op.
- Tom forhåndsvisning (ingen plan-data) → samme «Ingen plan funnet»-melding som allerede finnes i `renderPreview()`, ingen PDF genereres.
- `PrintToPdf` feiler (HRESULT-feil) → fanges i Rust, returneres som lesbar feiltekst, vises som feil-toast i UI.

## Testing

Ingen automatisert testoppsett finnes i prosjektet (ingen test-script i `package.json`). Verifiseres manuelt:
- Enkeltfag, med og uten header
- «Vis alle fag» på, med og uten header
- Åpne den lagrede PDF-en og bekreft at det ikke er sidetall/URL/dato-header/footer
- Filnavnforslag stemmer med `Ukeplan - Uke{N}.pdf`
