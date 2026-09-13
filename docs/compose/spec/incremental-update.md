---
feature: incremental-update
status: delivered
updated: 2026-09-11
branch: master
commits: # uncommitted on master at delivery — 10-round review + critical fixes
---

# Incremental Update

## Report

**What was built** — 文件级增量热更新：构建侧 `make-patch.ps1` 生成 `versions/manifest-<ver>.json` 与相对上一版的 `patch-*.zip`，注入 `latest.json` 的 `platforms.windows-x86_64.patch`；客户端优先下载校验增量包（流式落盘 + SHA256），覆盖 `install_root` 后重启，失败回退全量 NSIS。审查后加固：路径穿越防护、运行时 DB/日志保护、维护模式防健康线程竞态、安装前复验 zip、主程序 `.exe.old` 回滚、安装失败 pending 回写可重试、下载并发闸、`latest.json` 用 `ConvertTo-Json` 防 notes 注入、`build.bat` 后端清理只删叶子名并恢复 UTF-8 中文。

**Verification** — `cargo check --manifest-path launcher/Cargo.toml` PASS；`cargo test --lib` 15 passed（含 updater 6 个新测试：路径穿越/运行时保护/版本比较/同源校验）；`npm run build --prefix frontend` PASS。10 轮专项审查 + 1 轮修复复审：11 项 prior critical 均 FIXED。

**Journey log**
1. 原 `build.bat` 清理 PowerShell 把 `%BACKEND_DIST%` 全路径当目录名，`Join-Path` 右侧为绝对路径时会丢弃左侧，导致整棵后端被自删——必须只删叶子名。
2. 工作副本 `build.bat` 中文曾被写成 GBK/乱码字节；从 HEAD 恢复后用 edit 改增量步骤，保持 UTF-8。
3. 增量通道无 minisign（S3 明确 out of scope）：仅靠 latest.json 内嵌 SHA256 + 同源校验；HTTPS/签名升级仍建议后续做。
4. `make-patch` 排除列表要区分运行时数据（`*.db`、logs）与可发布资源（`data/frontend`），整目录排除会让纯前端变更永远打不出 patch。
5. 并发下载用进程内 AtomicBool 即可；跨安装完整性靠 apply 时再验 zip hash，而不是只在下载时验。

## [S1] Problem
全量 NSIS 安装包体积过大，后端 Nuitka 产物中 `ft1-backend.exe` 单文件约 700MB+。用户每次升级都要重新下载完整安装包，带宽与时长成本高。需要相对上一版本的文件级增量包，客户端校验后覆盖安装目录并重启，失败自动回退全量。

## [S2] Design
1. **构建侧** `scripts/make-patch.ps1`：扫描主程序 + `ft1-backend/**`，排除凭据配置、`*.db`/logs；写出 `versions/manifest-<ver>.json`；按语义化版本选上一版 manifest diff；打包 `dist/patch-<prev>-to-<ver>.zip`（含 `patch.json`）；注入 `latest.json` patch 字段。
2. **协议** `latest.json` patch：`{ from_versions, url, sha256, size }`。包内 `patch.json`：`{ version, from_versions, added, changed, deleted, files }`。
3. **客户端** `launcher/src/updater.rs`：
   - `check_for_update`：自定义 latest.json；失败回退官方 updater；语义化版本比较；`isIncremental`/`downloadSize`。
   - `download_update`：优先 patch；同源校验；流式写盘 + size/SHA256；`DOWNLOAD_IN_FLIGHT` 防并发；失败回退全量。
   - `install_update`：`UPDATE_MAINTENANCE` 维护模式 → 停后端 → spawn_blocking `apply_patch`（复验 zip hash、路径校验、保护 `.db`/logs、主程序 rename-old + 失败回滚）→ spawn 新 exe → exit；失败回写 pending 可重试。
4. **前端**：弹窗展示增量类型与体积；安装失败内联报错。
5. **构建入口**：`build.bat` [7/7] make-patch 失败则 exit 1；`package.ps1` 同样硬失败；`latest.json` 经 `ConvertTo-Json`。

## [S3] Out of Scope
- 多版本连续 patch 链 / bsdiff 二进制差分
- 增量包 Tauri minisign 签名（已知残留风险：HTTP 渠道；全量 NSIS 路径仍有官方签名）
- 非 Windows 平台的 patch 应用路径
- 服务器上传自动化
- 多文件覆盖失败时的完整事务回滚（主程序 exe 有回滚，其余文件建议失败后走全量）

## Tasks
- [x] T1: 10 轮专项代码审查（安全/正确性/构建/性能/质量/前端/协议/恢复/依赖/边界）— acceptance: 每轮有 critical/major/minor 结论与证据 (covers: S2)
- [x] T2: 修复全部 critical — acceptance: 修复 diff + 复验命令通过 (covers: S2; depends: T1)
- [x] T3: Verify：cargo check/test + 前端 tsc/build — acceptance: 命令退出码与错误可解释 (covers: S2)
- [x] T4: Finalize feature 文档 Report — acceptance: status=delivered，记录验证与 journey (covers: S1; depends: T2,T3)
