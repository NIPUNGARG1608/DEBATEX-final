# run_backend.ps1
# Start the FastAPI backend server

$rootDir = Get-Location
$backendDir = Join-Path $rootDir "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Error "Virtual environment not found. Please run start_services.ps1 first."
    Exit 1
}

Write-Host "=== Starting FastAPI Backend on http://localhost:8000... ===" -ForegroundColor Cyan
Set-Location -Path $backendDir
& $venvPython -m uvicorn server:app --reload --port 8000
