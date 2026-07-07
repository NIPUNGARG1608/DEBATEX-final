# start_services.ps1
# Setup and start local MongoDB and backend configuration

$rootDir = Get-Location
$mongoDir = Join-Path $rootDir "mongodb"
$mongoBin = Join-Path $mongoDir "bin\mongod.exe"
$mongoData = Join-Path $mongoDir "data"
$backendEnv = Join-Path $rootDir "backend\.env"

# 1. Download and extract MongoDB if not present
if (-not (Test-Path $mongoBin)) {
    Write-Host "=== Portable MongoDB not found. Downloading MongoDB Community Server... ===" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $mongoDir -Force | Out-Null
    
    $zipPath = Join-Path $rootDir "mongodb.zip"
    $tempExtract = Join-Path $rootDir "temp_mongo"
    
    # Download using curl.exe for speed and reliability
    & curl.exe -L -o $zipPath "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.3.zip"
    
    if (-not (Test-Path $zipPath)) {
        Write-Error "Failed to download MongoDB. Please check internet connection."
        Exit 1
    }
    
    Write-Host "=== Extracting MongoDB... ===" -ForegroundColor Cyan
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $zipPath -DestinationPath $tempExtract
    
    # Find the extracted folder inside temp_mongo and move its contents to mongodb
    $extractedFolder = Get-ChildItem -Path $tempExtract | Where-Object { $_.PSIsContainer } | Select-Object -First 1
    if ($extractedFolder) {
        Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $mongoDir -Recurse -Force
    } else {
        Write-Error "Extraction failed. Could not locate extracted folder."
        Exit 1
    }
    
    # Clean up zip and temp files
    Remove-Item $zipPath -Force
    Remove-Item $tempExtract -Recurse -Force
    Write-Host "=== MongoDB successfully installed locally. ===" -ForegroundColor Green
}

# 2. Ensure data directory exists
if (-not (Test-Path $mongoData)) {
    New-Item -ItemType Directory -Path $mongoData -Force | Out-Null
}

# 3. Start mongod.exe if not already running on port 27017
$mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
if (-not $mongoProcess) {
    Write-Host "=== Starting MongoDB on localhost:27017... ===" -ForegroundColor Cyan
    Start-Process -FilePath "$mongoBin" -ArgumentList "--dbpath `"$mongoData`" --port 27017" -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "=== MongoDB is already running. ===" -ForegroundColor Green
}

# 4. Generate backend/.env
Write-Host "=== Configuring backend/.env... ===" -ForegroundColor Cyan
$defaultEnvContent = @(
    "MONGO_URL=mongodb://localhost:27017",
    "DB_NAME=debatex",
    "JWT_SECRET=debatex-secure-jwt-secret-key-2024-production-ready-32bytes",
    "GROQ_API_KEY="
)

if (-not (Test-Path $backendEnv)) {
    $defaultEnvContent | Out-File -FilePath $backendEnv -Encoding utf8
    Write-Host "Created backend/.env with default settings." -ForegroundColor Green
} else {
    # Check and append missing variables
    $envContent = Get-Content -Path $backendEnv -ErrorAction SilentlyContinue
    $vars = @{}
    foreach ($line in $envContent) {
        if ($line -match "^([^=]+)=(.*)$") {
            $vars[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
    
    $updated = $false
    foreach ($item in $defaultEnvContent) {
        if ($item -match "^([^=]+)=(.*)$") {
            $key = $Matches[1]
            if (-not $vars.ContainsKey($key)) {
                Add-Content -Path $backendEnv -Value $item
                $updated = $true
                Write-Host "Appended missing configuration: $item" -ForegroundColor Yellow
            }
        }
    }
    if (-not $updated) {
        Write-Host "backend/.env is already fully configured." -ForegroundColor Green
    }
}

Write-Host "=== Setup completed successfully! ===" -ForegroundColor Green
