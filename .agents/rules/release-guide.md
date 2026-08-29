# UkeplanLager Release & Deployment Guide

Når brukeren ber om å opprette en ny release, bygge installasjonsfiler eller pushe en oppdatering, skal du følge denne prosedyren:

## 1. Versjonshåndtering
Oppdater versjonsnummeret konsekvent i følgende filer:
1. `package.json`: `"version": "<VERSJON>"`
2. `src-tauri/tauri.conf.json`: `"version": "<VERSJON>"`
3. `src-tauri/Cargo.toml`: `version = "<VERSJON>"`
4. `index.html`: begge versjonsmerkene (`#app-version-badge` og `#sidebar-version`) til `v<VERSJON>`

## 1b. Endringslogg
Oppdater `changelog.json` i repo-roten: legg en **ny blokk øverst** i `versions`-lista med `version`, `date` (ISO `ÅÅÅÅ-MM-DD`) og alle endringer som `entries` med `type` (`Nyhet` | `Feilretting` | `Forbedring` | `Stabilitet`), `title` og `description`. Denne blokken driver endringslogg-visningen og «Hva er nytt»-popupen i appen. Filen skal med i `git add` (se seksjon 3).

## 2. Byggeprosessen
Kjør:
```powershell
npm run build:exe
```
Dette kjører `node build_helper.js`, som:
- Lukker eventuelle kjørende app- og cargo-prosesser
- Kjører `node copy_icons.js` for å synkronisere ikoner og web-ressurser
- Kjører `npx tauri build` med `CARGO_TARGET_DIR=src-tauri/target_build`
- Signerer med nøkkelen fra `~/.tauri-keys/` (hvis den finnes på maskinen)
- Genererer installasjonsfiler i `src-tauri/target_build/release/bundle/nsis/`
- Kopierer automatisk den nysignerte `latest.json` til rotmappen

## 3. GitHub Git & Release
For å publisere en release:
```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock index.html latest.json changelog.json
git commit -m "release: v<VERSJON>"
git tag -a v<VERSJON> -m "UkeplanLager v<VERSJON>"
git push origin main --tags
gh release create v<VERSJON> "src-tauri/target_build/release/bundle/nsis/UkeplanLager_<VERSJON>_x64-setup.exe" "latest.json" --title "UkeplanLager v<VERSJON>" --notes "<Endringsbeskrivelse>"
```

Dette trigger at eksisterende installasjoner automatisk oppdager den nye versjonen via GitHub releases og oppdaterer seg selv.

## Viktig: GitHub Actions-workflowen kjører ikke automatisk lenger
`.github/workflows/release.yml` trigget tidligere automatisk ved push av en `v*`-tag eller push til `main`, men **feilet alltid** på signeringssteget («A public key has been found, but no private key») fordi `TAURI_SIGNING_PRIVATE_KEY` ikke er satt som GitHub Secret i repoet (bekreftet på flere kjøringer: `v2.6.0` og `v2.7.0`). Den automatiske triggeren er derfor fjernet — workflowen har nå kun `workflow_dispatch` og kjører aldri av seg selv ved push. Ikke vent på, poll, eller anta at en push trigger noen CI-jobb — den lokale byggingen og `gh release create` over er det som faktisk publiserer releasen. Brukeren har eksplisitt bedt om at releaser bygges lokalt, ikke via CI, og at workflowen ikke skal kjøre automatisk på GitHub.
