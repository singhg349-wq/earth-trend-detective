# One-command local demo. Installs nothing new.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts/run_demo.ps1
# It builds the frontend on the real artifacts in data/artifacts, starts the local API
# (optional: the page also works from static files), and serves the page.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'frontend/node_modules')) {
    Write-Host 'frontend/node_modules is missing. Run "npm install" in frontend/ once, then run this script again.'
    exit 1
}

Write-Host 'Building the frontend (copies data/artifacts into frontend/public/data)...'
Push-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

# Local API on port 8000 (optional). The page checks http://localhost:8000/api/health once.
$api = $null
try {
    $api = Start-Process -FilePath python -ArgumentList '-m', 'uvicorn', 'backend.main:app', '--port', '8000' -PassThru -WindowStyle Hidden
    Write-Host "Local API started (pid $($api.Id)) on http://localhost:8000"
} catch {
    Write-Host 'Local API did not start. The page still works from static files.'
}

Write-Host 'Open http://localhost:4173 in your browser. Press Ctrl+C to stop.'
try {
    Push-Location frontend
    npm run preview -- --host 127.0.0.1 --port 4173
} finally {
    Pop-Location
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force }
}
