---
feature: tauri-v2-upgrade
status: delivered
specs:
  - docs/compose/specs/2026-08-21-tauri-v2-upgrade-design.md
plans:
  - docs/compose/plans/2026-08-21-tauri-v2-upgrade.md
branch: master
commits: 7057298..d3b5340
---

# Tauri v2 Upgrade + Desktop Widget — Final Report

## What Was Built

spc-monitor launcher upgraded from Tauri v1.5 to Tauri v2, with three new features: Windows Mica/blur window effects, a splash loading screen with backend health monitoring, and a semi-transparent desktop widget for SPC/Cpk dashboard data. Backend packaging switched from PyInstaller to Nuitka for smaller binary size and faster startup.

The upgrade touches 14 files across 4 areas: Rust launcher (config + source), frontend (splash + widget HTML/JS), backend (Nuitka packaging), and build tooling. All Tauri v1 APIs (`SystemTray`, `CustomMenuItem`, `get_window`, `allowlist`) have been replaced with their v2 equivalents (`TrayIconBuilder`, `MenuItem::with_id`, `get_webview_window`, capabilities system).

## Architecture

### Multi-Window Layout

Three windows managed by Tauri v2:

| Window | Label | URL | Purpose |
|--------|-------|-----|---------|
| Splash | `splash` | `splash.html` | Loading animation, auto-closes on `backend-ready` event |
| Main | `main` | `index.html` | React app (primary UI), initially hidden |
| Widget | `widget` | `widget.html` | Semi-transparent SPC dashboard, always-on-top |

### Data Flow

1. App starts → splash window visible, main hidden
2. `lib.rs` health check thread polls `http://127.0.0.1:18080/api/health` every 3s
3. On first success → `app_handle.emit("backend-ready", ())` broadcasts to all windows
4. `splash.js` catches event → shows main window, closes splash
5. Widget independently calls `invoke('get_widget_data')` every 10s via Tauri IPC

### Key Files

| File | Role |
|------|------|
| `launcher/Cargo.toml` | Tauri v2 deps, plugins, window-vibrancy |
| `launcher/tauri.conf.json` | v2 config: 3 windows, trayIcon, security CSP |
| `launcher/capabilities/default.json` | Permissions replacing v1 allowlist |
| `launcher/src/lib.rs` | App logic: setup, Mica effect, commands, health check |
| `launcher/src/main.rs` | Thin entry: `fn main() { ft1_monitor_launcher::run(); }` |
| `launcher/src/tray.rs` | Tauri v2 tray: TrayIconBuilder + menu events |
| `frontend/public/splash.html` + `.js` | Loading animation + window transition |
| `frontend/public/widget.html` + `.js` | Desktop widget: cards, SPC chart, opacity |
| `backend/run.py` | Dual frozen detection (PyInstaller + Nuitka) |
| `backend/nuitka.config` | Nuitka build configuration |
| `build.bat` | 5-step build: frontend → Nuitka → copy → Tauri → zip |

### Design Decisions

- **Synchronous `pub fn run()`** instead of spec-recommended `pub async fn run()`: Tauri v2's `Builder::run()` internally manages its own async runtime; wrapping in `block_on()` risks nested tokio conflicts.
- **Separate `.js` files** for splash/widget: Project CSP has `script-src 'self'` without `'unsafe-inline'`, so all JS must be in external files.
- **`_tray` handle stored as local variable**: Tauri v2's `TrayIconBuilder::build()` registers the tray with `App` internally; the handle keeps it alive within the setup closure.
- **Widget uses `hide()` not `close()`**: Closing destroys the window; hiding preserves state for re-show via tray toggle.

## Usage

### Building

```cmd
.\build.bat
```

Outputs to `dist/`:
- `液奶过程监控系统_*_x64-setup.exe` — NSIS installer
- `液奶过程监控系统_免安装版.zip` — Portable zip

### Prerequisites (Windows)

```cmd
rustup default 1.88.0
cargo install tauri-cli --version "^2"
pip install nuitka ordered-set zstandard
```

### Widget Controls

- **Drag**: Header area (data-tauri-drag-region)
- **Close**: X button (hides to tray)
- **Double-click**: Opens main window
- **Opacity**: Settings gear → slider (10%-100%)
- **Tray**: Right-click → "桌面小组件" to toggle

## Verification

- Zero remaining v1 API references in `launcher/src/` (grep verified)
- No `allowlist`, `package.productName`, `distDir`, `devPath` in tauri.conf.json
- All JSON configs pass syntax validation
- 7 commits, each independently reviewable
- Spec compliance review passed for Tasks 1-4, 6-7
- Task 5 (widget) partial: core features implemented, advanced features (card config, position memory, WebSocket, config persistence) deferred

### Not Verified (requires Windows)

- `cargo check` / `cargo tauri build` (Windows-specific APIs)
- Mica/blur effect rendering
- Splash → main window transition at runtime
- Widget data fetching from live backend
- Nuitka compilation of Python backend
- NSIS installer creation

## Journey Log

- [lesson] Tauri v2 `Builder::run()` manages its own tokio runtime — no need for `block_on()` wrapper despite docs suggesting async entry point
- [lesson] Project CSP `script-src 'self'` blocks inline `<script>` tags — all window JS must be in separate files
- [lesson] `app_handle.emit()` broadcasts to ALL windows — useful for cross-window events but can cause noise if not guarded
- [pivot] Splash window needs explicit `url: "splash.html"` in tauri.conf.json — without it, defaults to loading index.html (the React app)
- [lesson] `event:default` capability permission is required for Rust→frontend event emission — without it, `emit()` calls are silently blocked

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-21-tauri-v2-upgrade-design.md` | Design spec | S3-S9 sections |
| `docs/compose/plans/2026-08-21-tauri-v2-upgrade.md` | Implementation plan | 8 tasks |
