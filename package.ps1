$ErrorActionPreference = "Stop"

$PROJECT_DIR = $PSScriptRoot
$LAUNCHER_DIR = Join-Path $PROJECT_DIR "launcher"
$BACKEND_DIST = Join-Path $LAUNCHER_DIR "ft1-backend"
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist"

# Clean output directory
if (Test-Path $OUTPUT_DIR) { Remove-Item -Recurse -Force $OUTPUT_DIR }
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

# Generate update artifacts (latest.json + *.exe.sig)
# Read version from tauri.conf.json first
$tauriConf = Get-Content (Join-Path $LAUNCHER_DIR "tauri.conf.json") -Raw | ConvertFrom-Json
$version = $tauriConf.version

# Extract changelog notes for this version from CHANGELOG.md
$changelogPath = Join-Path $PROJECT_DIR "CHANGELOG.md"
$notes = "版本 $version 更新"
if (Test-Path $changelogPath) {
    $lines = Get-Content $changelogPath -Encoding utf8
    $inSection = $false
    $noteLines = @()
    foreach ($line in $lines) {
        if ($line -match "^## \[$version\]") { $inSection = $true; continue }
        if ($inSection -and $line -match "^## \[") { break }
        if ($inSection -and $line -match "^- ") { $noteLines += $line.Substring(2) }
    }
    if ($noteLines.Count -gt 0) { $notes = $noteLines -join "; " }
}

$setupSig = Get-ChildItem -Path $nsisDir -Filter "*$version*-setup.exe.sig" -ErrorAction SilentlyContinue | Select-Object -First 1
$setupExe = Get-ChildItem -Path $nsisDir -Filter "*$version*-setup.exe" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '\.sig$' } | Select-Object -First 1

if ($setupSig) {
    Copy-Item $setupSig.FullName $OUTPUT_DIR
    if ($setupExe) { Copy-Item $setupExe.FullName $OUTPUT_DIR }
    Write-Host "Updater signature: $($setupSig.Name)"

    $signature = (Get-Content $setupSig.FullName -Raw).Trim()
    $exeName = if ($setupExe) { $setupExe.Name } else { "setup.exe" }
    $pubDate = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")

    $latestJson = @"
{
  "version": "$version",
  "notes": "$notes",
  "pub_date": "$pubDate",
  "platforms": {
    "windows-x86_64": {
      "signature": "$signature",
      "url": "http://106.13.77.213:9090/$exeName"
    }
  }
}
"@
    # Write without BOM so Tauri updater / JSON consumers parse cleanly
    [System.IO.File]::WriteAllText((Join-Path $OUTPUT_DIR "latest.json"), $latestJson, [System.Text.UTF8Encoding]::new($false))
    Write-Host "latest.json generated (version: $version)"
    Write-Host "Upload to server: scp $OUTPUT_DIR\latest.json $OUTPUT_DIR\*-setup.exe $OUTPUT_DIR\*-setup.exe.sig root@106.13.77.213:/var/www/spc-monitor-updates/"
} else {
    Write-Host "Warning: Updater signature not found, skipping latest.json"
}

# List outputs
Write-Host ""
Write-Host "Done:"
Get-ChildItem "$OUTPUT_DIR\*" | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) ($sizeMB MB)"
}
