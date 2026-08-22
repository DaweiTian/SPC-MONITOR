$ErrorActionPreference = "Stop"

$PROJECT_DIR = "D:\OpenCode-workspace\LAB\FT1-MONITOR"
$LAUNCHER_DIR = Join-Path $PROJECT_DIR "launcher"
$BACKEND_DIST = Join-Path $LAUNCHER_DIR "ft1-backend"
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist"

# 创建输出目录
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# 免安装版
$PORTABLE = Join-Path $OUTPUT_DIR "FT1-MONITOR-Portable"
if (Test-Path $PORTABLE) { Remove-Item -Recurse -Force $PORTABLE }
New-Item -ItemType Directory -Path $PORTABLE | Out-Null

# 复制 launcher exe
Copy-Item (Join-Path $LAUNCHER_DIR "target\release\ft1-monitor-launcher.exe") $PORTABLE

# 用 robocopy 复制后端（避免 PowerShell Copy-Item 的目录 bug）
$portableBackend = Join-Path $PORTABLE "ft1-backend"
robocopy $BACKEND_DIST $portableBackend /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -gt 3) {
    Write-Host "robocopy 复制后端失败，退出码: $LASTEXITCODE"
    exit 1
}

# 打包 zip
$zipPath = Join-Path $OUTPUT_DIR "液奶过程监控系统_免安装版.zip"
Compress-Archive -Path (Join-Path $PORTABLE "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $PORTABLE
Write-Host "免安装版: $zipPath"

# 复制 NSIS 安装器
$nsisDir = Join-Path $LAUNCHER_DIR "target\release\bundle\nsis"
$nsisExe = Get-ChildItem "$nsisDir\*.exe" | Select-Object -First 1
if ($nsisExe) {
    Copy-Item $nsisExe.FullName $OUTPUT_DIR
    Write-Host "安装器: $($nsisExe.FullName)"
} else {
    Write-Host "警告: 未找到 NSIS 安装器"
}

# 列出产物
Write-Host "`n打包完成:"
Get-ChildItem "$OUTPUT_DIR\*" | Select-Object Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}
