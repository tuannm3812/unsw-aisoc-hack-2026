<#
    Bring up Spatial Brain: install what is missing, seed the board, start both servers.

        .\start.ps1              # start, keeping any existing board
        .\start.ps1 -Reset       # wipe and reseed first, for a clean rehearsal
        .\start.ps1 -Check       # install, seed, run the tests, then exit

    Backend on http://127.0.0.1:8010, canvas on http://localhost:3100.
#>
param(
    [switch]$Reset,
    [switch]$Check
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

function Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }

if (-not (Test-Path $python)) {
    Step "Creating the backend virtual environment"
    python -m venv (Join-Path $backend ".venv")
}

Step "Installing backend dependencies"
& $python -m pip install --quiet --disable-pip-version-check -r (Join-Path $backend "requirements.txt")

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Step "Installing frontend dependencies"
    Push-Location $frontend
    npm install --no-fund --no-audit
    Pop-Location
}

Step $(if ($Reset) { "Resetting and seeding the demo board" } else { "Seeding the demo board" })
Push-Location $backend
if ($Reset) { & $python -m app.seed --reset } else { & $python -m app.seed }
Pop-Location

if ($Check) {
    Step "Running the unit tests"
    Push-Location $backend
    & $python -m pytest
    Pop-Location

    Step "Typechecking the frontend"
    Push-Location $frontend
    npx tsc --noEmit
    Pop-Location

    Write-Host "`nChecks passed. Start for real with .\start.ps1" -ForegroundColor Green
    exit 0
}

# A killed uvicorn reloader can leave its worker behind, still holding the port and
# still serving the code it loaded hours ago. That looks exactly like a mysterious
# bug, so clear the port before binding it rather than trusting it is free.
function Clear-Port($port) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($owner in $owners) {
        $process = Get-Process -Id $owner -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        Write-Host "    freeing port $port from $($process.ProcessName) ($owner)" -ForegroundColor DarkGray
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
    if ($owners) { Start-Sleep -Seconds 2 }
}

# Ports 8010 and 3100 rather than the usual 8000 and 3000, which are often already
# taken on a laptop that has been running other projects all day.
Step "Starting the API on http://127.0.0.1:8010"
Clear-Port 8010
Start-Process -FilePath $python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010", "--reload" `
    -WorkingDirectory $backend

Step "Starting the canvas on http://localhost:3100"
Clear-Port 3100
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $frontend

Write-Host ""
Write-Host "Canvas    http://localhost:3100" -ForegroundColor Green
Write-Host "API docs  http://127.0.0.1:8010/docs" -ForegroundColor Green
Write-Host "Sign in   priya@spatialbrain.dev / spatial" -ForegroundColor Green
Write-Host ""
Write-Host "Both servers run in their own windows. Close them to stop."
