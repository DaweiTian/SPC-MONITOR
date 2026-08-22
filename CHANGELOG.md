# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [1.5.1] - 2025-08-23

### Highlights

This is the first production release of the FT1-MONITOR platform. It migrates the desktop shell from Tauri v1 to v2, replaces PyInstaller with Nuitka for backend packaging, and adds real-time alert notifications with in-app toast, sound, and system-level push.

### Added

- **Alert notifications**: In-app toast popups with severity-based styling and slide-in/out animation
- **System notifications**: Tauri native notifications (desktop) and browser Notification API (fallback)
- **Alert sound**: Web Audio API beep with `AudioContext.resume()` for modern browser autoplay policies
- **Floating TOC**: Scrollspy-enabled table of contents for help manual pages (sticky + float positioning)
- **Help manuals as React components**: GlossaryPage and VisualGuidePage replace iframe-embedded HTML, eliminating asset protocol issues
- **Tauri v2 notification plugin**: `tauri-plugin-notification` with permission configuration
- **MDB sample-boundary truncation**: `init_limit` now limits by sample count instead of raw record count, preventing partial indicator truncation
- **Widget SPC data endpoint**: `/monitor/widget_spc` for dashboard widget chart data
- **Backend window hiding**: `EnumWindows` + `ShowWindow(SW_HIDE)` to hide the Python console window on Windows
- **Launcher port validation**: Forces port 18080, ignoring any user-configured port
- **Nuitka build pipeline**: `build.bat` one-click build with `pefile` icon removal for backend exe
- **PowerShell packaging script**: `package.ps1` for flexible packaging
- **Vite dev proxy**: `/api` proxied to `localhost:18080` for development mode

### Changed

- **Tauri v1 → v2**: `Cargo.toml`, `tauri.conf.json`, capabilities, `lib.rs`, `tray.rs` migrated
- **Vite base path**: Changed from `/app/` to `./` to fix Tauri white screen (absolute paths incompatible with `tauri://localhost/`)
- **BrowserRouter basename**: Three-state logic — no basename for Vite dev or Tauri client, `/app` for browser production
- **API service**: `isTauri` detection with absolute URL construction for Tauri, relative for browser
- **CSP policy**: Added `tauri.localhost`, `asset:`, and `frame-src` directives
- **Launcher service**: `current_dir` set to app directory, stderr redirected to log file
- **Health check**: Changed from `reqwest::blocking` to async `reqwest` directly, removing `tokio` dependency
- **Chart colors**: Line color brightened from `#334155` to `#94a3b8` for better visibility
- **ECharts hook**: Registered `ScatterChart`, `BoxplotChart`, `MarkAreaComponent`

### Fixed

- **`import sys` missing**: Backend startup crash when compiled with Nuitka
- **Tauri white screen**: Absolute `/app/` asset paths not resolving under `tauri://localhost/`
- **Browser refresh 404**: SPA catch-all route serves `index.html` for non-API GET requests
- **Navigation icons not loading**: Absolute paths `/favicon.ico` and `/icons/...` changed to relative `./favicon.ico` and `./icons/...`
- **Tray "Show window" not working**: Added `unminimize()` call before `set_focus()`
- **MDB breakpoint not cleared on instrument switch**: Import `BREAKPOINT_FILE` constant and clear on switch
- **Dashboard widget state sync**: Added `collecting` field to dashboard API response
- **AudioContext suspended**: Call `audioCtx.resume()` before playing alert sound
- **CSS `borderColor` override**: Reordered inline styles — shorthand before longhand
- **`-(x - mu) ** 2` Babel error**: Wrapped exponentiation in parentheses `(-((x - mu) ** 2))`
- **MarkLine label position**: Removed incorrect `position: 'end'` override
- **ctypes callback return type**: Changed from `c_bool` to `wintypes.BOOL` for 64-bit correctness

### Security

- API key authentication on all `/api/*` routes
- CSP configured for Tauri asset protocol and localhost origins
- WebSocket uses query-param API key (no auth dependency on WS router)

## [1.0.0] - 2025-08-14

### Added

- Initial project structure
- FastAPI backend with SQLite storage
- React 18 + TypeScript + Ant Design 5 frontend
- SPC control charts (I-MR) with 8 Nelson rules
- Process capability analysis (Cp/Cpk/Pp/Ppk)
- Real-time data collection with adaptive scheduling
- WebSocket push for live updates
- Mock, SQL Server, MDB, and FTA data source connectors
- Tauri v1 desktop launcher
- Configuration management UI
- Data management and export
- Prediction module
