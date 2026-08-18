import subprocess
import os
import sys
import time
import shutil

# Ensure utf-8 stdout encoding if possible
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

repo_dir = os.path.dirname(os.path.abspath(__file__))

# 1. Kill any running ukeplanlager.exe, ukeplan_backend.exe, app.exe, cargo.exe, rustc.exe
subprocess.run(["cmd.exe", "/c", "taskkill /F /IM ukeplanlager.exe /IM ukeplan_backend.exe /IM app.exe /IM cargo.exe /IM rustc.exe /T"], capture_output=True)
time.sleep(1)

# 2. Compile Python backend to standalone ukeplan_backend.exe with PyInstaller
print("\n--- Kompilerer Python backend (ukeplan_backend.exe via PyInstaller)... ---")
py_cmd = [sys.executable, "-m", "PyInstaller", "--onefile", "--noconsole", "--name", "ukeplan_backend", "--clean", "app.py"]
py_res = subprocess.run(py_cmd, cwd=repo_dir)
if py_res.returncode != 0:
    print('[INFO] sys.executable feilet, prøver "py"...')
    py_res = subprocess.run(["py", "-m", "PyInstaller", "--onefile", "--noconsole", "--name", "ukeplan_backend", "--clean", "app.py"], cwd=repo_dir)

if py_res.returncode != 0:
    print("[FEIL] Kunne ikke kompilere ukeplan_backend.exe med PyInstaller!")
    sys.exit(1)

dist_backend_exe = os.path.join(repo_dir, "dist", "ukeplan_backend.exe")
root_backend_exe = os.path.join(repo_dir, "ukeplan_backend.exe")
if os.path.exists(dist_backend_exe):
    shutil.copy2(dist_backend_exe, root_backend_exe)
    print(f"[OK] ukeplan_backend.exe generert og oppdatert: {root_backend_exe}")
    shutil.rmtree(os.path.join(repo_dir, "build"), ignore_errors=True)
    shutil.rmtree(os.path.join(repo_dir, "dist"), ignore_errors=True)
else:
    print("[FEIL] dist/ukeplan_backend.exe ble ikke funnet etter PyInstaller!")
    sys.exit(1)

# 3. Run copy_icons.js (Klargjør dist/ for Tauri frontendDist, vendor-filer og ikoner)
print("\n--- Klargjør ikoner, dist og ressurser... ---")
subprocess.run(["node", "copy_icons.js"], cwd=repo_dir)

# 4. Setup environment and signing keys
env = os.environ.copy()
env["CARGO_TARGET_DIR"] = os.path.join(repo_dir, "src-tauri", "target_build")

key_path = os.path.expanduser(r"~\.tauri-keys\ukeplanlager_updater.key")
pass_path = os.path.expanduser(r"~\.tauri-keys\ukeplanlager_updater.password.txt")

if os.path.exists(key_path) and "TAURI_SIGNING_PRIVATE_KEY" not in env:
    with open(key_path, "r", encoding="utf-8") as f:
        env["TAURI_SIGNING_PRIVATE_KEY"] = f.read().strip()
    if os.path.exists(pass_path) and "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" not in env:
        with open(pass_path, "r", encoding="utf-8") as f:
            env["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"] = f.read().strip()
    print("[OK] Fant og lastet inn signeringsnøkkel fra ~/.tauri-keys/")

print("\n--- Starter npx tauri build (Vennligst vent ~30-45 sekunder mens Windows komprimerer og pakker installasjonsfilen)... ---")
res = subprocess.run(["npx.cmd", "tauri", "build"], cwd=repo_dir, env=env)
if res.returncode == 0:
    # Copy latest.json from bundle if created
    nsis_dir = os.path.join(repo_dir, "src-tauri", "target_build", "release", "bundle", "nsis")
    bundle_latest = os.path.join(nsis_dir, "latest.json")
    root_latest = os.path.join(repo_dir, "latest.json")
    if os.path.exists(bundle_latest):
        shutil.copy2(bundle_latest, root_latest)
        print(f"[OK] Kopierte nysignert latest.json til {root_latest}")
    print("\n🎉 GRATULERER! Byggingen er fullført! Installasjonsfilene ligger i src-tauri/target_build/release/bundle/nsis/")
sys.exit(res.returncode)
