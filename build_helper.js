const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const repoDir = __dirname;

// 1. Kill any running instances
try {
    execSync('taskkill /F /IM ukeplanlager.exe /IM cargo.exe /IM rustc.exe /T', { stdio: 'ignore' });
} catch (e) { }

// 2. Run copy_icons.js (Klargjør dist/ for Tauri frontendDist, vendor-filer og ikoner)
console.log('\n--- Klargjør ikoner, dist og ressurser... ---');
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
    const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf-8'));
    const version = pkg.version;
    const nsisDir = path.join(repoDir, 'src-tauri', 'target_build', 'release', 'bundle', 'nsis');
    const sigFile = path.join(nsisDir, `UkeplanLager_${version}_x64-setup.exe.sig`);
    const exeFile = path.join(nsisDir, `UkeplanLager_${version}_x64-setup.exe`);
    const rootLatest = path.join(repoDir, 'latest.json');
    const bundleLatest = path.join(nsisDir, 'latest.json');

    if (fs.existsSync(sigFile) && fs.existsSync(exeFile)) {
        const signature = fs.readFileSync(sigFile, 'utf-8').trim();
        const latestData = {
            version: version,
            notes: `UkeplanLager v${version}`,
            pub_date: new Date().toISOString(),
            platforms: {
                "windows-x86_64": {
                    signature: signature,
                    url: `https://github.com/takoie/ukeplan/releases/download/v${version}/UkeplanLager_${version}_x64-setup.exe`
                }
            }
        };
        const jsonStr = JSON.stringify(latestData, null, 2);
        fs.writeFileSync(rootLatest, jsonStr, 'utf-8');
        fs.writeFileSync(bundleLatest, jsonStr, 'utf-8');
        console.log(`[OK] Genererte fersk og nysignert latest.json (v${version}) til ${rootLatest}`);
    } else {
        console.warn('[ADVARSEL] Fant ikke .sig-filen for å generere latest.json!');
    }
    console.log('\n🎉 GRATULERER! Byggingen er fullført! Installasjonsfilene ligger i src-tauri/target_build/release/bundle/nsis/');
}

process.exit(res.status || 0);
