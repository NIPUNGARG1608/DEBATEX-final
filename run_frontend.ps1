# run_frontend.ps1
# Start the React frontend development server

$rootDir = Get-Location
$frontendDir = Join-Path $rootDir "frontend"

Write-Host "=== Starting React Frontend on http://localhost:3000... ===" -ForegroundColor Cyan
Set-Location -Path $frontendDir
npm start
