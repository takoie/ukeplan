# 🚀 Release & Byggemanual for UkeplanLager

Denne guiden beskriver hvordan du publiserer nye oppdateringer og installasjonsprogrammer for **UkeplanLager** raskt og smertefritt.

UkeplanLager er en ren Tauri/Rust-app (SQLite-databasen kjøres direkte i Rust — ingen separat Python-backend eller PyInstaller-steg lenger). Bygging, signering og publisering til GitHub Releases skjer **automatisk via GitHub Actions** når du pusher en versjonstag.

---

## ⚡ Rask 1-2-3 Guide

### 1. Oppdater versjonsnummer
Når du skal lage en ny versjon (f.eks. `2.7.0`), oppdater versjonen i følgende filer:
- `package.json` (`"version": "2.7.0"`)
- `src-tauri/tauri.conf.json` (`"version": "2.7.0"`)
- `src-tauri/Cargo.toml` (`version = "2.7.0"`)
- `index.html` (`<span id="app-version-badge">v2.7.0</span>` i Om-visningen)

### 2. Commit, tagg og push
```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock index.html
git commit -m "release: v2.7.0"
git tag -a v2.7.0 -m "UkeplanLager v2.7.0"
git push origin main --tags
```

### 3. Ferdig — GitHub Actions gjør resten
En push av en `v*`-tag trigger [`.github/workflows/release.yml`](.github/workflows/release.yml), som automatisk:
- Bygger Tauri/Rust-appen (`npx tauri build`)
- Signerer installasjonsfilen (forutsetter at signeringsnøkkelen er lagt inn som GitHub Secret — se under)
- Oppretter en GitHub Release med `.exe`, `.sig` og `latest.json` vedlagt

Følg fremdriften under **Actions**-fanen på GitHub-repoet. Når jobben er ferdig, ligger releasen under **Releases**, og eksisterende installasjoner oppdager den automatisk via in-app-oppdatereren.

---

## 🔑 Engangsoppsett: signeringsnøkkel i GitHub Secrets
For at CI skal kunne signere installasjonsfilen (nødvendig for at auto-oppdatering skal fungere for brukerne), må disse to secrets være satt under repoets **Settings → Secrets and variables → Actions**:
- `TAURI_SIGNING_PRIVATE_KEY` — innholdet i `~/.tauri-keys/ukeplanlager_updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — innholdet i `~/.tauri-keys/ukeplanlager_updater.password.txt`

Uten disse bygger CI fortsatt en installasjonsfil, men den blir usignert, og eksisterende brukere vil ikke oppdage oppdateringen automatisk.

---

## 🛠️ Lokal bygging (valgfritt — for å teste før du pusher)
Hvis du vil bygge og teste installasjonsfilen lokalt før du oppretter en release:
```powershell
npm run build:exe
```
Dette klargjør ikoner og ressurser, kompilerer Tauri/Rust-koden (inkludert det innebygde SQLite-databaselaget), signerer med nøkkelen fra `~/.tauri-keys/` (hvis den finnes på maskinen) og legger installasjonsfilen i `src-tauri/target_build/release/bundle/nsis/`. Dette steget er ikke nødvendig for en vanlig release — CI bygger uansett på nytt fra ren tilstand når du pusher taggen.

---

## 💡 Hjelp fra AI Agent
Du kan når som helst bare be agenten:
> *"Sett versjon til v2.7.0 og push til git"*

Agenten vil automatisk følge instruksene definert i [`.agents/rules/release-guide.md`](file:///.agents/rules/release-guide.md): oppdatere versjonsnumrene, committe, tagge og pushe. Selve byggingen og publiseringen på GitHub skjer deretter automatisk via GitHub Actions.
