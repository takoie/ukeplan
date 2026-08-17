const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const repoDir = __dirname;

// 1. Kill any running instances
try {
    execSync('taskkill /F /IM ukeplanlager.exe /IM app.exe /IM cargo.exe /IM rustc.exe /T', { stdio: 'ignore' });
} catch (e) { }

// 2. Run copy_icons.js
console.log('--- Klargjør ikoner... ---');
spawnSync('node', ['copy_icons.js'], { cwd: repoDir, stdio: 'inherit', shell: true });

// 3. Setup environment and signing keys
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
