# 🚀 Release & Byggemanual for UkeplanLager

Denne guiden beskriver hvordan du publiserer nye oppdateringer og installasjonsprogrammer for **UkeplanLager** raskt og smertefritt.

UkeplanLager er en ren Tauri/Rust-app (SQLite-databasen kjøres direkte i Rust — ingen separat Python-backend eller PyInstaller-steg lenger).

---

## ⚡ Rask 1-2-3 Guide

### 1. Oppdater versjonsnummer
Når du skal lage en ny versjon (f.eks. `2.7.1`), oppdater versjonen i følgende filer:
- `package.json` (`"version": "2.7.1"`)
- `src-tauri/tauri.conf.json` (`"version": "2.7.1"`)
- `src-tauri/Cargo.toml` (`version = "2.7.1"`)
- `index.html` (begge versjonsmerkene: `#app-version-badge` og `#sidebar-version`, til `v2.7.1`)

### 2. Kompiler og signer installasjonsfilene
Kjør i terminalen:

```powershell
npm run build:exe
```

Dette klargjør ikoner og ressurser, kompilerer Tauri/Rust-koden (inkludert det innebygde SQLite-databaselaget), signerer med nøkkelen fra `~/.tauri-keys/` og genererer:
- `src-tauri/target_build/release/bundle/nsis/UkeplanLager_<VERSJON>_x64-setup.exe` (NSIS-installer)
- `src-tauri/target_build/release/bundle/nsis/UkeplanLager_<VERSJON>_x64-setup.exe.sig` (kryptografisk signatur)
- `latest.json` (kopiert til rotmappen for sømløs in-app-oppdatering)

### 3. Publiser til GitHub
Kjør følgende kommandoer for å pushe og opprette releasen på GitHub:

```powershell
# 1. Commit og tagg
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock index.html latest.json
git commit -m "release: v2.7.1"
git tag -a v2.7.1 -m "UkeplanLager v2.7.1"

# 2. Push til GitHub
git push origin main --tags

# 3. Last opp installasjonsfilen og latest.json til GitHub Releases
gh release create v2.7.1 "src-tauri/target_build/release/bundle/nsis/UkeplanLager_2.7.1_x64-setup.exe" "latest.json" --title "UkeplanLager v2.7.1" --notes "### 🚀 Endringslogg for v2.7.1"
```

Eksisterende installasjoner oppdager den nye releasen automatisk via in-app-oppdatereren.

---

## ⚠️ GitHub Actions-workflowen er ikke i bruk
Repoet har en CI-workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) som trigges automatisk ved push av en `v*`-tag eller push til `main`. Den **feiler for øyeblikket alltid** på signeringssteget, fordi `TAURI_SIGNING_PRIVATE_KEY` ikke er satt som GitHub Secret i repoet — bekreftet på både `v2.6.0`- og `v2.7.0`-kjøringene. Ikke vent på eller stol på denne jobben for å publisere en release; følg steg 2–3 over i stedet.

Hvis CI-signering ønskes senere, må disse legges inn under repoets **Settings → Secrets and variables → Actions**:
- `TAURI_SIGNING_PRIVATE_KEY` — innholdet i `~/.tauri-keys/ukeplanlager_updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — innholdet i `~/.tauri-keys/ukeplanlager_updater.password.txt`

---

## 💡 Hjelp fra AI Agent
Du kan når som helst bare be agenten:
> *"Lag en ny release v2.7.1, bygg exe og push til GitHub"*

Agenten vil automatisk følge instruksene definert i [`.agents/rules/release-guide.md`](file:///.agents/rules/release-guide.md).
