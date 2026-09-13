# Generate file manifest + incremental patch zip vs previous version
# Usage: powershell -File scripts\make-patch.ps1 [-ProjectDir <root>] [-ServerBase http://host:port]
param(
    [string]$ProjectDir = "",
    [string]$ServerBase = "http://106.13.77.213:9090",
    [string]$PrevVersion = "",
    [switch]$SkipPatch
)
$ErrorActionPreference = "Stop"

if (-not $ProjectDir) { $ProjectDir = Split-Path $PSScriptRoot -Parent }
# cmd 传参 "%VAR%" 且 VAR 以 \ 结尾时，会变成 path"；先剥掉引号与尾部分隔符
$ProjectDir = "$ProjectDir".Trim().Trim('"').TrimEnd('\', '/')
if (-not $ProjectDir) { $ProjectDir = Split-Path $PSScriptRoot -Parent }
$ProjectDir = (Resolve-Path -LiteralPath $ProjectDir).Path
$LauncherDir = Join-Path $ProjectDir "launcher"
$BackendDist = Join-Path $LauncherDir "ft1-backend"
$DistDir = Join-Path $ProjectDir "dist"
# manifests must survive dist cleanup in build.bat
$ManifestDir = Join-Path $ProjectDir "versions"
$InstalledExeName = "过程SPC监控平台.exe"

$tauriConf = Get-Content (Join-Path $LauncherDir "tauri.conf.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Version = $tauriConf.version
if (-not $Version) { throw "Cannot read version from tauri.conf.json" }

if (-not (Test-Path $BackendDist)) { throw "Backend dist not found: $BackendDist" }
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Force -Path $DistDir | Out-Null }
if (-not (Test-Path $ManifestDir)) { New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null }

Write-Host "=== Build file manifest v$Version ==="

function Get-Sha256([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$fileMap = [ordered]@{}

# Main launcher exe (NSIS installed name matches portable name)
$srcExe = Join-Path $LauncherDir "target\release\SPC-Monitor.exe"
if (-not (Test-Path $srcExe)) {
    $alt = Get-ChildItem (Join-Path $DistDir "*.exe") -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'setup\.exe$' } |
        Select-Object -First 1
    if ($alt) { $srcExe = $alt.FullName }
}
if (Test-Path $srcExe) {
    $item = Get-Item -LiteralPath $srcExe
    $fileMap[$InstalledExeName] = @{
        sha256 = (Get-Sha256 $item.FullName)
        size   = $item.Length
        source = $item.FullName
    }
    Write-Host ("  + {0} ({1:N2} MB)" -f $InstalledExeName, ($item.Length / 1MB))
} else {
    Write-Host "  WARNING: main exe not found; manifest will only cover backend resources"
}

$excludeName = @('db_config.json', 'mdb_config.json', 'fta_config.json', 'server_config.json')
$excludeDir = @('__pycache__', '.git', 'logs')
# 运行时数据：不得进入清单/增量包（*.db 与日志）；data/frontend 等可发布资源仍纳入 patch
$excludeExt = @('.db', '.db-journal', '.db-wal', '.db-shm', '.log')

Get-ChildItem -LiteralPath $BackendDist -Recurse -File | ForEach-Object {
    $rel = "ft1-backend/" + ($_.FullName.Substring($BackendDist.Length) -replace '\\', '/' -replace '^/', '')
    $leaf = $_.Name
    $parts = $rel -split '/'
    if ($excludeName -contains $leaf) { return }
    foreach ($p in $parts) {
        if ($excludeDir -contains $p) { return }
    }
    foreach ($ext in $excludeExt) {
        if ($leaf.EndsWith($ext, [System.StringComparison]::OrdinalIgnoreCase)) { return }
    }

    $fileMap[$rel] = @{
        sha256 = (Get-Sha256 $_.FullName)
        size   = $_.Length
        source = $_.FullName
    }
}

Write-Host ("  total files: {0}" -f $fileMap.Count)

$manifest = [ordered]@{
    version = $Version
    files   = [ordered]@{}
}
foreach ($k in $fileMap.Keys) {
    $manifest.files[$k] = [ordered]@{
        sha256 = $fileMap[$k].sha256
        size   = $fileMap[$k].size
    }
}
$manifestPath = Join-Path $ManifestDir "manifest-$Version.json"
$manifestJson = $manifest | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "Manifest written: $manifestPath"

if ($SkipPatch) {
    Write-Host "SkipPatch set, done."
    return
}

$prevManifestPath = $null
if ($PrevVersion) {
    $cand = Join-Path $ManifestDir "manifest-$PrevVersion.json"
    if (Test-Path $cand) { $prevManifestPath = $cand }
} else {
    $prevManifestPath = Get-ChildItem $ManifestDir -Filter "manifest-*.json" |
        Where-Object { $_.Name -ne "manifest-$Version.json" } |
        Sort-Object {
            if ($_.Name -match 'manifest-(\d+(?:\.\d+)*)') {
                try { [version]$matches[1] } catch { [version]'0.0.0' }
            } else { [version]'0.0.0' }
        } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $prevManifestPath) {
    Write-Host "No previous manifest found, skip patch (first enable or manifests cleaned)"
    return
}

$prev = Get-Content $prevManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$prevVer = $prev.version
Write-Host "Diff against previous: $prevVer -> $Version"

$added = New-Object System.Collections.Generic.List[string]
$changed = New-Object System.Collections.Generic.List[string]
$deleted = New-Object System.Collections.Generic.List[string]
$patchFiles = [ordered]@{}

$prevFiles = $prev.files
$prevNames = @($prevFiles.PSObject.Properties.Name)

foreach ($k in @($fileMap.Keys)) {
    $curHash = $fileMap[$k].sha256
    $prevProp = $prevFiles.PSObject.Properties[$k]
    if (-not $prevProp) {
        $added.Add($k) | Out-Null
        $patchFiles[$k] = $fileMap[$k]
    } elseif ($prevProp.Value.sha256 -ne $curHash) {
        $changed.Add($k) | Out-Null
        $patchFiles[$k] = $fileMap[$k]
    }
}
foreach ($k in $prevNames) {
    if (-not $fileMap.Contains($k)) { $deleted.Add($k) | Out-Null }
}

Write-Host ("  added={0} changed={1} deleted={2}" -f $added.Count, $changed.Count, $deleted.Count)

if ($added.Count -eq 0 -and $changed.Count -eq 0 -and $deleted.Count -eq 0) {
    Write-Host "No file changes, skip patch"
    return
}

$patchBytes = 0L
foreach ($k in $patchFiles.Keys) { $patchBytes += [int64]$fileMap[$k].size }
Write-Host ("  patch uncompressed approx {0:N1} MB" -f ($patchBytes / 1MB))

$patchName = "patch-$prevVer-to-$Version.zip"
$patchPath = Join-Path $DistDir $patchName
if (Test-Path $patchPath) { Remove-Item $patchPath -Force }

$patchMeta = [ordered]@{
    version       = $Version
    from_versions = @($prevVer)
    added         = @($added)
    changed       = @($changed)
    deleted       = @($deleted)
    files         = [ordered]@{}
}
foreach ($k in $patchFiles.Keys) {
    $patchMeta.files[$k] = [ordered]@{
        sha256 = $fileMap[$k].sha256
        size   = $fileMap[$k].size
    }
}

$staging = Join-Path $env:TEMP ("ft1-patch-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $staging | Out-Null
try {
    $metaPath = Join-Path $staging "patch.json"
    [System.IO.File]::WriteAllText($metaPath, ($patchMeta | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))

    foreach ($k in $patchFiles.Keys) {
        $src = $fileMap[$k].source
        $dest = Join-Path $staging ($k -replace '/', '\')
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dest -Force
    }

    if (Test-Path $patchPath) { Remove-Item $patchPath -Force }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $patchPath -CompressionLevel Optimal
} finally {
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
}

$patchHash = Get-Sha256 $patchPath
$patchSize = (Get-Item $patchPath).Length
Write-Host ("Patch: {0} ({1:N2} MB) sha256={2}" -f $patchName, ($patchSize / 1MB), $patchHash)

$patchSidecar = [ordered]@{
    name          = $patchName
    url           = "$ServerBase/$patchName"
    sha256        = $patchHash
    size          = $patchSize
    from_versions = @($prevVer)
    version       = $Version
}
$sidecarPath = Join-Path $DistDir "patch-meta.json"
[System.IO.File]::WriteAllText($sidecarPath, ($patchSidecar | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
Write-Host "patch-meta.json written: $sidecarPath"

$latestPath = Join-Path $DistDir "latest.json"
if (Test-Path $latestPath) {
    try {
        $latest = Get-Content $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $latest.platforms) {
            $latest | Add-Member -NotePropertyName platforms -NotePropertyValue (New-Object PSObject) -Force
        }
        $plat = $latest.platforms.PSObject.Properties['windows-x86_64']
        if (-not $plat) {
            $latest.platforms | Add-Member -NotePropertyName 'windows-x86_64' -NotePropertyValue (New-Object PSObject) -Force
            $platValue = $latest.platforms.'windows-x86_64'
        } else {
            $platValue = $plat.Value
        }
        $patchObj = [ordered]@{
            from_versions = @($prevVer)
            url           = $patchSidecar.url
            sha256        = $patchSidecar.sha256
            size          = $patchSidecar.size
        } | ConvertTo-Json -Depth 5 | ConvertFrom-Json
        $platValue | Add-Member -NotePropertyName 'patch' -NotePropertyValue $patchObj -Force
        [System.IO.File]::WriteAllText($latestPath, ($latest | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
        Write-Host "latest.json patched"
    } catch {
        Write-Host "WARNING: failed to inject patch into latest.json: $_"
    }
} else {
    Write-Host "NOTE: dist\latest.json not present; merge patch-meta.json manually or re-run after full manifest"
}

Write-Host "Upload: $patchName + latest.json + full setup.exe (fallback)"
