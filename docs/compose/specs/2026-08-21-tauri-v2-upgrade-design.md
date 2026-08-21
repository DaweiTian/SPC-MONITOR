# 液奶过程监控系统 — Tauri v2 升级 + 桌面小组件 设计规格

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/tauri-v2-upgrade.md)

> **版本**: 1.0 | **日期**: 2026-08-21 | **状态**: 待审批

---

## [S1] 问题陈述

当前启动器基于 Tauri v1.5 构建，存在以下问题：

1. **无窗口透明度支持**：`set_opacity` 是 v2 API，v1 不可用
2. **无原生窗口特效**：Windows 11 Mica/Acrylic 效果无法实现，标题栏颜色固定
3. **后端打包体积大**：PyInstaller 打包 numpy/scipy 后产物 100-300MB，启动慢（2-5s）
4. **缺少桌面小组件**：无法在桌面悬浮显示 SPC/Cpk 等关键指标
5. **启动体验差**：后端启动期间前端白屏，无等待动画

---

## [S2] 整体方案

### 技术栈升级

| 组件 | 当前 | 升级后 |
|------|------|--------|
| Tauri | v1.5 | v2.x |
| Tauri CLI | 1.6.6 | 2.x |
| Rust | 1.88.0 | 最新稳定版 |
| 后端打包 | PyInstaller | Nuitka |
| 窗口特效 | 无 | window-vibrancy (Mica) |

### 产出物

| 格式 | 说明 |
|------|------|
| 安装版 `.exe` | NSIS 安装包，含 Mica 安装界面 |
| 免安装版 `.zip` | 解压即用 |
| 后端 exe | Nuitka 编译，~50-100MB |

---

## [S3] Tauri v2 迁移

### [S3.1] 配置文件重构

`tauri.conf.json` 结构变化：

```
v1: package.productName, package.version, tauri.allowlist, tauri.bundle, tauri.windows, tauri.systemTray
v2: productName, version, bundle, app.windows, app.trayIcon, app.security (无 allowlist)
```

新增 `capabilities/default.json` 权限文件替代 `allowlist`。

### [S3.2] 托盘 API 重构

v1: `SystemTray` + `on_system_tray_event`（菜单和图标事件统一处理）
v2: `TrayIconBuilder` + `on_menu_event`（菜单）+ `on_tray_icon_event`（图标点击）

菜单创建：`CustomMenuItem` → `MenuItem::with_id(app, ...)`
分隔符：`SystemTrayMenuItem::Separator` → `PredefinedMenuItem::separator(app)`

### [S3.3] 主入口异步化

v1: `fn main()` 同步
v2: 推荐 `lib.rs` 导出 `pub async fn run()`，`main.rs` 调用 `tauri::async_runtime::block_on(lib::run())`

### [S3.4] 窗口 API 变更

- `app.get_window("main")` → `app.get_webview_window("main")`
- `window.on_window_event()` → 同名但类型路径变化
- `#[tauri::command]` 和 `tauri::State<T>` **不变**

### [S3.5] 插件注册

v1 features 变为 v2 插件：
- `shell-open` → `tauri-plugin-opener`
- `dialog` → `tauri-plugin-dialog`
- `system-tray` → 内置（无需 feature）

### [S3.6] 兼容性矩阵

| 文件 | 改动程度 | 说明 |
|------|----------|------|
| `config.rs` | 无 | 零 Tauri API |
| `service.rs` | 无 | 零 Tauri API |
| `build.rs` | 版本号 | `tauri-build = "2"` |
| `Cargo.toml` | 中等 | 版本 + 插件 |
| `tauri.conf.json` | 重写 | 结构变化 |
| `main.rs` | 较大 | 异步 + 窗口 API |
| `tray.rs` | 重写 | 整个 API 替换 |
| `capabilities/default.json` | 新增 | 权限清单 |

---

## [S4] Windows Mica 窗口特效

### [S4.1] 实现方案

使用 `window-vibrancy` crate（Tauri 官方维护），在 setup 时对窗口应用 Mica 效果：

```rust
#[cfg(target_os = "windows")]
{
    use window_vibrancy::apply_mica;
    apply_mica(&window, Some(true)).ok();
}
```

### [S4.2] 配置要求

`tauri.conf.json` 窗口配置：
```json
{
  "transparent": true,
  "decorations": true
}
```

### [S4.3] 降级处理

Windows 10 不支持 Mica，回退到 `apply_blur`（亚克力模糊效果）：
```rust
#[cfg(target_os = "windows")]
{
    use window_vibrancy::{apply_mica, apply_blur};
    if apply_mica(&window, Some(true)).is_err() {
        apply_blur(&window, Some((18, 18, 18, 125))).ok();
    }
}
```

---

## [S5] 启动等待动画

### [S5.1] 双窗口方案

| 窗口 | 标签 | 用途 |
|------|------|------|
| 启动窗口 | `splash` | 显示加载动画，无边框，居中 |
| 主窗口 | `main` | 应用主界面，初始不可见 |

### [S5.2] 流程

1. 应用启动 → 显示 `splash` 窗口（加载动画）
2. 后端启动 → 轮询 `/api/health` 直到返回 200
3. 后端就绪 → 隐藏 `splash`，显示 `main`
4. 首次显示后 `splash` 销毁

### [S5.3] 动画设计

深色背景 + 青色脉冲圆环 + "正在启动后端服务..." 文字 + 渐变进度条。
纯 CSS 动画，无额外依赖。匹配应用科技风主题。

### [S5.4] 前端等待页面

`splash.html` 作为独立页面，嵌入 `splash` 窗口：
- CSS `@keyframes` 脉冲动画
- 背景色 `#0a0e1a`，主色 `#00d4ff`
- 无需 React，纯 HTML+CSS

---

## [S6] 桌面半透明小组件

### [S6.1] 窗口配置

独立窗口 `widget`，配置：
```json
{
  "label": "widget",
  "title": "FT1 看板",
  "width": 320,
  "height": 480,
  "resizable": true,
  "alwaysOnTop": true,
  "decorations": false,
  "transparent": true,
  "skipTaskbar": true
}
```

### [S6.2] 功能

用户可配置显示哪些卡片：
- 今日检测量 / 预警数 / 采集状态
- 平均 Cpk（带趋势箭头）
- 变异系数 CV%
- 最近 3 条预警
- SPC 迷你控制图（最近 20 个点）

### [S6.3] 外观

- 半透明深色背景（CSS `backdrop-filter: blur(20px)` + `rgba(10,14,26,0.85)`）
- 圆角 12px，无边框
- 可拖拽（`data-tauri-drag-region`）
- 用户可调节透明度（10%~100% 滑块）
- 位置记忆（保存到 config）

### [S6.4] 交互

- 托盘右键新增"显示小组件"/"隐藏小组件"
- 小组件右上角关闭按钮（隐藏到托盘）
- 鼠标悬浮时显示完整数据，离开时折叠
- 双击小组件打开主窗口

### [S6.5] 数据流

小组件通过 IPC 命令从 Rust 后端获取数据：
- `get_widget_data` → 返回聚合的看板数据
- 数据每 10 秒自动刷新（前端定时器）
- WebSocket 接收实时预警推送

### [S6.6] 配置持久化

用户配置保存到 `config.json`：
```json
{
  "widget": {
    "enabled": true,
    "opacity": 0.9,
    "x": null,
    "y": null,
    "cards": ["cpk", "cv", "alerts", "spc_mini"]
  }
}
```

---

## [S7] Nuitka 后端打包

### [S7.1] 优势对比

| 维度 | PyInstaller | Nuitka |
|------|-------------|--------|
| 产物大小 | 100-300MB | 50-100MB |
| 启动速度 | 2-5s | <1s |
| 杀毒误报 | 频繁 | 极少 |
| 编译方式 | 打包字节码 | 编译为 C |
| numpy/scipy | 依赖 hook | 专用插件 |

### [S7.2] Nuitka 构建命令

```bash
python -m nuitka \
  --standalone \
  --onefile \
  --output-filename=ft1-backend.exe \
  --windows-console-mode=force \
  --enable-plugin=numpy \
  --enable-plugin=scipy \
  --include-package=fastapi \
  --include-package=uvicorn \
  --include-package=backend \
  --include-package=sqlalchemy \
  --include-package=pydantic \
  --include-package=statsmodels \
  --include-package=pymssql \
  --include-data-dir=data=data \
  --nofollow-import-to=tkinter \
  --nofollow-import-to=matplotlib \
  --nofollow-import-to=PIL \
  run.py
```

### [S7.3] 入口文件适配

Nuitka 的冻结检测用 `__compiled__`（不是 PyInstaller 的 `sys.frozen`）。`run.py` 需要兼容：

```python
if getattr(sys, 'frozen', False) or '__compiled__' in globals():
    os.chdir(os.path.dirname(sys.executable))
```

### [S7.4] 依赖安装

`requirements.txt` 新增：
```
nuitka>=2.0.0
ordered-set>=4.1.0
zstandard>=0.22.0
```

---

## [S8] 构建流程

### 最终 `build.bat` 流程

```
[1/5] 构建前端 (npm run build)
[2/5] Nuitka 编译后端 (python -m nuitka ...)
[3/5] 复制后端到 launcher 目录
[4/5] cargo tauri build (生成安装版 + 免安装版)
[5/5] 打包免安装版 zip
```

### 产出物

```
dist/
  液奶过程监控系统_x.x.x_x64-setup.exe   ← 安装版
  液奶过程监控系统_免安装版.zip            ← 免安装版
```

---

## [S9] 风险与降级

| 风险 | 影响 | 降级方案 |
|------|------|----------|
| Mica 不支持 Win10 | 标题栏无特效 | 自动回退到 blur 效果 |
| Nuitka numpy 插件兼容性 | 编译失败 | 回退 PyInstaller |
| Tauri v2 破坏性变更 | 编译错误 | 逐步迁移，每步可编译 |
| 透明窗口性能 | 低端机卡顿 | 用户可在设置中关闭透明 |
| 小组件数据刷新 | API 压力 | 降低刷新频率到 30s |
