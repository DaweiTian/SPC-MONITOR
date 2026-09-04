$ErrorActionPreference = "Stop"

$PROJECT_DIR = $PSScriptRoot
$LAUNCHER_DIR = Join-Path $PROJECT_DIR "launcher"
$BACKEND_DIST = Join-Path $LAUNCHER_DIR "ft1-backend"
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist"

# Create output directory
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# Portable version
$PORTABLE = Join-Path $OUTPUT_DIR "spc-monitor-Portable"
if (Test-Path $PORTABLE) { Remove-Item -Recurse -Force $PORTABLE }
New-Item -ItemType Directory -Path $PORTABLE | Out-Null

# Copy launcher exe
$launcherExe = Join-Path $LAUNCHER_DIR "target\release\SPC-Monitor.exe"
if (-not (Test-Path $launcherExe)) {
    Write-Host "Error: Launcher exe not found at $launcherExe"
    exit 1
}
Copy-Item $launcherExe (Join-Path $PORTABLE "过程SPC监控平台.exe")

# Copy backend with robocopy
$portableBackend = Join-Path $PORTABLE "ft1-backend"
robocopy $BACKEND_DIST $portableBackend /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -gt 3) {
    Write-Host "robocopy failed, exit code: $LASTEXITCODE"
    exit 1
}

# Create zip
$zipPath = Join-Path $OUTPUT_DIR "过程SPC监控平台_免安装版.zip"
Compress-Archive -Path (Join-Path $PORTABLE "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $PORTABLE
Write-Host "Portable: $zipPath"

# Copy NSIS installer
$nsisDir = Join-Path $LAUNCHER_DIR "target\release\bundle\nsis"
if (Test-Path $nsisDir) {
    $nsisExe = Get-ChildItem -Path $nsisDir -Filter "*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($nsisExe) {
        Copy-Item $nsisExe.FullName $OUTPUT_DIR
        Write-Host "Installer: $($nsisExe.Name)"
    } else {
        Write-Host "Warning: No NSIS installer exe found in $nsisDir"
    }
} else {
    Write-Host "Warning: NSIS directory not found at $nsisDir"
}

# Generate update artifacts (latest.json + .nsis.zip + .nsis.zip.sig)
$nsisZip = Get-ChildItem -Path $nsisDir -Filter "*.nsis.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsisSig = Get-ChildItem -Path $nsisDir -Filter "*.nsis.zip.sig" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($nsisZip -and $nsisSig) {
    Copy-Item $nsisZip.FullName $OUTPUT_DIR
    Copy-Item $nsisSig.FullName $OUTPUT_DIR
    Write-Host "Update package: $($nsisZip.Name)"

    $signature = (Get-Content $nsisSig.FullName -Raw).Trim()
    $zipName = $nsisZip.Name
    $pubDate = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

    # Read version from tauri.conf.json
    $tauriConf = Get-Content (Join-Path $LAUNCHER_DIR "tauri.conf.json") -Raw | ConvertFrom-Json
    $version = $tauriConf.version

    $latestJson = @"
{
  "version": "$version",
  "notes": "请填写更新日志",
  "pub_date": "$pubDate",
  "platforms": {
    "windows-x86_64": {
      "signature": "$signature",
      "url": "http://106.13.77.213:9090/$zipName"
    }
  }
}
"@
    $latestJson | Out-File -Encoding utf8 (Join-Path $OUTPUT_DIR "latest.json")
    Write-Host "latest.json generated (version: $version)"
    Write-Host "Upload to server: scp $OUTPUT_DIR\latest.json $OUTPUT_DIR\*.nsis.zip $OUTPUT_DIR\*.nsis.zip.sig root@106.13.77.213:/var/www/spc-monitor-updates/"
} else {
    Write-Host "Warning: NSIS update package not found, skipping latest.json"
}

# List outputs
Write-Host ""
Write-Host "Done:"
Get-ChildItem "$OUTPUT_DIR\*" | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) ($sizeMB MB)"
}
