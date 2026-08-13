# Start Python backend og Tauri dev-modus samtidig

Write-Host "🚀 Starter UkeplanLager dev-miljø..." -ForegroundColor Green
Write-Host ""

# Start Python i bakgrunn
Write-Host "📦 Starter Flask-server..." -ForegroundColor Cyan
$pythonProcess = Start-Process python -ArgumentList "app.py" -PassThru -NoNewWindow

Start-Sleep -Seconds 2

# Start Tauri dev
Write-Host "🎨 Starter Tauri dev-modus..." -ForegroundColor Cyan
npm run dev

# Cleanup når brukeren avslutter
Write-Host ""
Write-Host "🛑 Avslutter..." -ForegroundColor Yellow
Stop-Process -Id $pythonProcess.Id -ErrorAction SilentlyContinue
