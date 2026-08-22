$ErrorActionPreference = "Stop"

$PROJECT_DIR = "D:\OpenCode-workspace\LAB\FT1-MONITOR"
$LAUNCHER_DIR = Join-Path $PROJECT_DIR "launcher"
$BACKEND_DIST = Join-Path $LAUNCHER_DIR "ft1-backend"
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist"

# Create output directory
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# Portable version
$PORTABLE = Join-Path $OUTPUT_DIR "FT1-MONITOR-Portable"
if (Test-Path $PORTABLE) { Remove-Item -Recurse -Force $PORTABLE }
New-Item -ItemType Directory -Path $PORTABLE | Out-Null

# Copy launcher exe
Copy-Item (Join-Path $LAUNCHER_DIR "target\release\ft1-monitor-launcher.exe") $PORTABLE

# Copy backend with robocopy
$portableBackend = Join-Path $PORTABLE "ft1-backend"
robocopy $BACKEND_DIST $portableBackend /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -gt 3) {
    Write-Host "robocopy failed, exit code: $LASTEXITCODE"
    exit 1
}

# Create zip
$zipPath = Join-Path $OUTPUT_DIR "portable.zip"
Compress-Archive -Path (Join-Path $PORTABLE "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $PORTABLE
Write-Host "Portable: $zipPath"

# Copy NSIS installer
$nsisDir = Join-Path $LAUNCHER_DIR "target\release\bundle\nsis"
$nsisExe = Get-ChildItem "$nsisDir\*.exe" | Select-Object -First 1
if ($nsisExe) {
    Copy-Item $nsisExe.FullName $OUTPUT_DIR
    Write-Host "Installer: $($nsisExe.FullName)"
} else {
    Write-Host "Warning: NSIS installer not found"
}

# List outputs
Write-Host ""
Write-Host "Done:"
Get-ChildItem "$OUTPUT_DIR\*" | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) ($sizeMB MB)"
}
