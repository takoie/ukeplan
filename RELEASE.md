# 🚀 Release & Byggemanual for UkeplanLager

Denne guiden beskriver hvordan du publiserer nye oppdateringer og installasjonsprogrammer for **UkeplanLager** raskt og smertefritt.

---

## ⚡ Rask 1-2-3 Guide

### 1. Oppdater versjonsnummer
Når du skal lage en ny versjon (f.eks. `2.3.1`), oppdater versjonen i følgende filer:
- `package.json` (`"version": "2.3.1"`)
- `src-tauri/tauri.conf.json` (`"version": "2.3.1"`)
- `src-tauri/Cargo.toml` (`version = "2.3.1"`)
- `index.html` (`<span id="app-version-badge">v2.3.1</span>` i Om-visningen)

---

### 2. Kompiler og signer installasjonsfilene
Kjør i terminalen:

```powershell
npm run build:exe
```

Dette kompilerer automatisk Python backend (`ukeplan_backend.exe`) med PyInstaller, klargjør ikoner og ressurser, kompilerer Tauri/Rust-koden, signerer med kryptografisk nøkkel og genererer:
- `src-tauri/target_build/release/bundle/nsis/UkeplanLager_<VERSJON>_x64-setup.exe` (NSIS-installer)
- `src-tauri/target_build/release/bundle/nsis/UkeplanLager_<VERSJON>_x64-setup.exe.sig` (Kryptografisk signatur)
- `latest.json` (Automatisk generert og kopiert til rotmappen for sømløs in-app oppdatering)

---

### 3. Publiser til GitHub
Kjør følgende kommandoer for å pushe og opprette releasen på GitHub:

```powershell
# 1. Commit og tagg
git commit -am "release: v2.3.1"
git tag -a v2.3.1 -m "UkeplanLager v2.3.1"

# 2. Push til GitHub
git push origin main --tags

# 3. Last opp installasjonsfilen og latest.json til GitHub Releases
gh release create v2.3.1 "src-tauri/target_build/release/bundle/nsis/UkeplanLager_2.3.1_x64-setup.exe" "latest.json" --title "UkeplanLager v2.3.1" --notes "### 🚀 Endringslogg for v2.3.1"
```

---

## 💡 Hjelp fra AI Agent
Du kan når som helst bare be agenten:
> *"Lag en ny release v2.3.1, bygg exe og push til GitHub"*

Agenten vil automatisk følge instruksene definert i [`.agents/rules/release-guide.md`](file:///.agents/rules/release-guide.md).
