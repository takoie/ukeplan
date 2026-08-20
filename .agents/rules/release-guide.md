# UkeplanLager Release & Deployment Guide

Når brukeren ber om å opprette en ny release, oppdatere versjonen eller publisere en oppdatering (f.eks. "sett versjon til x.y.z og push til git"), skal du følge denne prosedyren:

## 1. Versjonshåndtering
Oppdater versjonsnummeret konsekvent i følgende filer:
1. `package.json`: `"version": "<VERSJON>"`
2. `src-tauri/tauri.conf.json`: `"version": "<VERSJON>"`
3. `src-tauri/Cargo.toml`: `version = "<VERSJON>"`
4. `index.html`: Versjonsmerket i Om-seksjonen (`#app-version-badge`) til `v<VERSJON>`

## 2. Commit, tagg og push
```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock index.html
git commit -m "release: v<VERSJON>"
git tag -a v<VERSJON> -m "UkeplanLager v<VERSJON>"
git push origin main --tags
```

## 3. Bygging og publisering skjer automatisk i CI
En push av en `v*`-tag trigger GitHub Actions-workflowen [`release.yml`](../../.github/workflows/release.yml), som bygger Tauri/Rust-appen, signerer installasjonsfilen (hvis `TAURI_SIGNING_PRIVATE_KEY` er satt som GitHub Secret) og oppretter en GitHub Release med installer, signatur og `latest.json` automatisk.

**Du skal ikke** kjøre `npm run build:exe` eller `gh release create` manuelt for en vanlig release — det duplikerer det CI allerede gjør, og CI-bygget er alltid det som faktisk publiseres. Lokal bygging med `npm run build:exe` er kun for å teste en installasjonsfil før du pusher, ikke en del av selve utgivelsesløpet.

Etter push: informer brukeren om at pushen var vellykket og at byggingen nå kjører automatisk i GitHub Actions (kan følges under Actions-fanen på repoet). Ikke vent på eller poll CI-jobben med mindre brukeren eksplisitt ber om det.

Dette trigger at eksisterende installasjoner automatisk oppdager den nye versjonen via GitHub Releases og oppdaterer seg selv.
