import subprocess
import os
import sys
import time

repo_dir = r"f:\stian.taknes.no\Git\ukeplan"

# 1. Kill any running ukeplanlager.exe, app.exe, cargo.exe, rustc.exe
subprocess.run(["cmd.exe", "/c", "taskkill /F /IM ukeplanlager.exe /IM app.exe /IM cargo.exe /IM rustc.exe /T"], capture_output=True)
time.sleep(1)

# 2. Run copy_icons.js
subprocess.run(["node", "copy_icons.js"], cwd=repo_dir)

# 3. Set CARGO_TARGET_DIR=target_build and run npx tauri build
env = os.environ.copy()
env["CARGO_TARGET_DIR"] = os.path.join(repo_dir, "src-tauri", "target_build")

print("\n--- Starter npx tauri build (Vennligst vent ~30-45 sekunder mens Windows komprimerer og pakker installasjonsfilen)... ---")
res = subprocess.run(["npx.cmd", "tauri", "build"], cwd=repo_dir, env=env)
if res.returncode == 0:
    print("\n GRATULERER! Byggingen er fullført! Installasjonsfilene ligger i src-tauri/target_build/release/bundle/nsis/")
sys.exit(res.returncode)
