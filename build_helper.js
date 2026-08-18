const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const repoDir = __dirname;

// 1. Kill any running instances
try {
    execSync('taskkill /F /IM ukeplanlager.exe /IM ukeplan_backend.exe /IM app.exe /IM cargo.exe /IM rustc.exe /T', { stdio: 'ignore' });
} catch (e) { }

// 2. Compile Python backend to standalone ukeplan_backend.exe with PyInstaller
console.log('\n--- Kompilerer Python backend (ukeplan_backend.exe via PyInstaller)... ---');
let pyCmd = 'py';
let pyArgs = ['-m', 'PyInstaller', '--onefile', '--noconsole', '--name', 'ukeplan_backend', '--clean', 'app.py'];
let pyRes = spawnSync(pyCmd, pyArgs, { cwd: repoDir, stdio: 'inherit', shell: true });

if (pyRes.status !== 0) {
    console.log('[INFO] "py" feilet eller finnes ikke, prøver "python"...');
    pyCmd = 'python';
    pyRes = spawnSync(pyCmd, pyArgs, { cwd: repoDir, stdio: 'inherit', shell: true });
}

if (pyRes.status !== 0) {
    console.error('[FEIL] Kunne ikke kompilere ukeplan_backend.exe med PyInstaller!');
    process.exit(1);
}

const distBackendExe = path.join(repoDir, 'dist', 'ukeplan_backend.exe');
const rootBackendExe = path.join(repoDir, 'ukeplan_backend.exe');
if (fs.existsSync(distBackendExe)) {
    fs.copyFileSync(distBackendExe, rootBackendExe);
    console.log(`[OK] ukeplan_backend.exe generert og oppdatert: ${rootBackendExe}`);
    try {
        fs.rmSync(path.join(repoDir, 'build'), { recursive: true, force: true });
        fs.rmSync(path.join(repoDir, 'dist'), { recursive: true, force: true });
    } catch (e) { }
} else {
    console.error('[FEIL] dist/ukeplan_backend.exe ble ikke funnet etter PyInstaller!');
    process.exit(1);
}

// 3. Run copy_icons.js (Klargjør dist/ for Tauri frontendDist, vendor-filer og ikoner)
console.log('\n--- Klargjør ikoner, dist og ressurser... ---');
spawnSync('node', ['copy_icons.js'], { cwd: repoDir, stdio: 'inherit', shell: true });

// 4. Setup environment and signing keys
const env = { ...process.env };
env.CARGO_TARGET_DIR = path.join(repoDir, 'src-tauri', 'target_build');

const keyPath = path.join(os.homedir(), '.tauri-keys', 'ukeplanlager_updater.key');
const passPath = path.join(os.homedir(), '.tauri-keys', 'ukeplanlager_updater.password.txt');

if (fs.existsSync(keyPath) && !env.TAURI_SIGNING_PRIVATE_KEY) {
    env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf-8').trim();
    if (fs.existsSync(passPath) && !env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
        env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = fs.readFileSync(passPath, 'utf-8').trim();
    }
    console.log('[OK] Fant og lastet inn signeringsnøkkel fra ~/.tauri-keys/');
}

console.log('\n--- Starter npx tauri build (Vennligst vent mens Windows kompilerer og pakker installasjonsfilen)... ---');
const res = spawnSync('npx.cmd', ['tauri', 'build'], { cwd: repoDir, env, stdio: 'inherit', shell: true });

if (res.status === 0) {
    const nsisDir = path.join(repoDir, 'src-tauri', 'target_build', 'release', 'bundle', 'nsis');
    const bundleLatest = path.join(nsisDir, 'latest.json');
    const rootLatest = path.join(repoDir, 'latest.json');
    if (fs.existsSync(bundleLatest)) {
        fs.copyFileSync(bundleLatest, rootLatest);
        console.log(`[OK] Kopierte nysignert latest.json til ${rootLatest}`);
    }
    console.log('\n🎉 GRATULERER! Byggingen er fullført! Installasjonsfilene ligger i src-tauri/target_build/release/bundle/nsis/');
}

process.exit(res.status || 0);
