# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [1.6.1] - 2026-08-23

### Added

- **EWMA 控制图** `GET /spc/{product}/{indicator}?chart_type=ewma`: 指数加权移动平均控制图，支持 λ 滑块调参（0.05~0.5，默认 0.2），检测 0.5σ~1.5σ 小偏移，与 I-MR 图互补
- **EWMA 越界点表**: EWMA 模式下替换 Nelson 规则表，显示越界点的序号、时间、检测值、EWMA 值、控制限、状态
- **Mann-Kendall 趋势检验**: 非参数趋势检验 + Sen 斜率估计，集成到预测模块自动模型选择，所有预测模型均返回 `trend_analysis` 字段
- **趋势分析 KPI 卡片**: 预测页面新增趋势方向（上升/下降/无趋势）、p 值显著性标注（***、**、*、n.s.）、Sen 斜率

### Fixed

- SPC 页面切换 EWMA/I-MR tab 时 `i_chart is undefined` 崩溃
- SPC 页面 I-MR 标签显示增加 `i_chart`/`mr_chart` 可选链，防止竞态条件
- λ 滑块快速拖动时 Axios `CanceledError` 日志刷屏（静默忽略取消请求）
- 预测页面趋势分析卡片数据空白（`setResult` 漏存 `trend_analysis` 字段）
- 预测页面 5 个 KPI 卡片布局调整为同一行（grid 从 4 列改为 5 列）

## [1.6.0] - 2026-08-24

### Added

- **预测模块全面升级 (P0-P3)**: 评估体系重构、越限概率、自动模型选择、CUSUM漂移检测、GBDT特征工程
- **MASE + 方向准确率**: 替代失效的R²作为核心评估指标，MASE<1表示优于朴素基准
- **越限概率计算**: 基于预测分布的概率法，同时考虑USL/LSL方向，四级风险等级(LOW/MEDIUM/HIGH/CRITICAL)
- **自动模型选择**: ADF平稳性检验 + 双拟合d=0/d=1 + ETS vs ARIMA自动择优
- **模型对比接口** `GET /predict/models/compare`: 四模型MASE对比，自动推荐最优模型
- **Cpk滑动窗口趋势**: 自适应窗口计算Cpk趋势曲线，过程能力页面新增趋势图
- **越限风险接口** `GET /predict/risk/breach`: 独立越限概率分析
- **Cpk风险接口** `GET /predict/risk/cpk`: 滑动窗口Cpk + 能力评估 + 趋势判定
- **CUSUM漂移检测** `GET /predict/risk/drift`: 分段CUSUM，支持换料/换罐标记解析
- **指标关联分析** `GET /predict/correlation`: Pearson相关矩阵 + 热力图展示
- **GBDT特征重要性** `GET /predict/feature/importance`: GradientBoosting回归 + 特征排序
- **预测页面风险监控面板**: 四指标卡片(Cpk/越限概率/漂移幅度/能力评估) + CRITICAL弹窗告警
- **预测页面关联热力图 + 特征重要性柱状图**
- **后端5分钟TTL缓存**: 预测/SPC/过程能力端点全部加缓存，重复请求提速186倍
- **预测模块排除备注过滤**: 与SPC控制图保持一致的排除逻辑(基准样等)
- **数据库新增3张表**: `prediction_results`、`risk_predictions`、`process_segments`
- **新增依赖**: `scikit-learn>=1.3.0`、`pandas>=2.1.0`

### Changed

- **KPI卡片**: MAPE+R² → MASE+方向准确率，MAPE降级为灰色"仅供参考"
- **方法选择器**: 移除MA(验证MASE 5-12，无增量价值)，新增"自动选择"
- **越限风险**: 从点值比较改为概率法，修复酸度98.6%被判low的严重漏判
- **ARIMA d参数**: 从硬编码d=1改为双拟合d=0/d=1取MASE更优
- **CI计算**: 统一为`residual_std * sqrt(step)`衰减模型
- **残差分析**: 从`data-mean`修复为`actual-趋势`(线性回归残差)
- **过程能力Cpk趋势**: 后端新增`cpk_history`滑动窗口数据
- **SPC过程状态**: 判定逻辑改为只看最近10个数据点的违规(旧违规不累积)
- **SPC过程状态颜色**: 失控红色、基本受控橙色、受控绿色(原为始终绿色)
- **spec_limits.json**: 新增砖高钙低脂奶蛋白质规格限

### Fixed

- **NaN%越限概率**: 后端字段名`breach_probability`/`level`与前端`breach_prob`/`risk_level`不匹配
- **Cpk趋势空白**: `useChart`初始化effect只执行一次，条件渲染的图表ref无法挂载 — 改为始终渲染div
- **Cpk趋势时间倒序**: 数据降序导致X轴从右到左，添加`.reverse()`
- **Cpk趋势纵坐标小数**: `Math.min/max`改为`Math.floor/ceil`显示整数
- **漂移幅度NaN%**: CUSUM单位是σ不是百分比，移除`*100`
- **Cpk趋势"数据窗口不足"**: 非重叠窗口96点只产出1个Cpk值，改为自适应滑动窗口
- **过程能力Cpk趋势null**: 后端缺少`cpk_history`字段，新增滑动窗口计算
- **方向准确率卡片溢出**: 内层div误用`kpiCard`class导致padding撑大
- **模型对比图标签溢出**: `grid.right`从20px增加到100px
- **特征重要性标签溢出**: `grid.right`从20px增加到60px
- **热力图VisualMap未注册**: 添加`VisualMapComponent`导入和注册
- **Cpk sigma=0时inf**: 返回`None`替代`float('inf')`
- **JSON序列化NaN/inf**: 新增`_sanitize()`递归替换为`None`

## [1.5.5] - 2025-08-24

### Added

- **交叉预测引擎**: 基于"源指标→目标指标"的通用实时预测框架，首期支持脂肪→饱和脂肪，预测系数由用户在品项管理中配置
- **品项管理 — 样品类别**: 新增产品类别下拉（14种乳制品类别），选择后自动填入推荐预测系数
- **品项管理 — 预测指标模块**: 可配置源指标、目标指标和预测系数，支持开关控制
- **品项管理 — 模糊搜索**: 卡片标题右侧新增搜索输入框，支持按名称/编码实时过滤
- **SPC控制图 — 预测曲线叠加**: 查看脂肪指标时自动叠加预测饱和脂肪曲线（橙色虚线+右Y轴），tooltip同步显示预测值
- **实时看板 — 预测曲线叠加**: 轮播到源指标时趋势图自动叠加预测曲线，逻辑与SPC一致
- **SPC — 分析模式切换**: 筛选栏新增"过程分析/稳定性分析"下拉，稳定性模式只看基准样/稳定样，隐藏规格限标签
- **帮助页面 — 交叉预测章节**: 预测系数参考表（14种类别）+ 方法对比精度分析（5种方法×5种类型）+ 误差分布 + ML对比结论
- **帮助页面 — 固定左侧导航栏**: 替代原浮动目录，支持滚动高亮跟踪
- **prediction_config.json / product_categories.json**: 新增两个配置文件存储产品类别映射和预测指标配置
- **后端API**: `GET/PUT /config/product-categories`、`GET/PUT /config/prediction-config`、`GET /config/prediction-categories`、`GET /predict/cross-indicator`
- **数据采集后自动触发预测**: `collect_with_alert` 中新增 `_run_cross_predictions`，采集脂肪后自动生成预测饱和脂肪记录

### Changed

- **预测模型比较API返回格式**: `/predict/models/compare` 改为返回 `{models, recommended_model, recommendation_reason}` 对象结构，每个model标记`recommended`字段
- **指标相关性热力图**: 使用用户配置的别名显示指标名称（而非原始code）
- **GBDT特征重要性图**: 使用用户配置的别名显示指标名称
- **useChart hook**: `option` 为 `null` 时调用 `chart.clear()` 清空图表（修复筛选无结果时残留旧图）
- **预测残差分析图表**: 高度调整为405px，顶部间距优化
- **排除备注关键词卡片**: 重新设计布局，使用独立CSS类替代内联样式，增加内边距

### Fixed

- **HH:MM时间碰撞导致预测曲线错位**: SPC和Dashboard的预测数据匹配从HH:MM截断改为完整时间戳Map精确匹配，消除不同日期相同时分的误匹配
- **save_predicted_data覆盖真实数据**: `INSERT OR REPLACE` 改为 `INSERT ... WHERE NOT EXISTS`，防止覆盖已有的实测数据
- **save_predicted_data缺少logger**: storage.py 添加 `import logging` 和 logger 实例，修复 `NameError`
- **预测循环无异常处理**: `_run_cross_predictions` 内层循环添加 `try/except`，单个产品失败不影响其他产品
- **公式显示英文code**: 新增 `SOURCE_INDICATOR_META`，公式改为显示中文指标名（"饱和脂肪 = 脂肪 × 0.6278"）
- **predict.py使用手动open()**: 改用 `_load_json_config` helper函数
- **coefficient零值被忽略**: 前端 coefficient 检查从 truthiness 改为 `!= null`
- **handleAddProduct未重置预测状态**: 新增品项时重置 selectedCategory/predictSaturatedFat/predCoefficient
- **CSS类conceptTable不存在**: 改为正确的 `s.table`
- **breach_time.slice崩溃**: Prediction页面添加 `typeof` 类型检查，非字符串值不调用 `.slice()`
- **模型比较面板空白**: 后端返回格式与前端接口不匹配，已修复为对象结构
- **过程能力直方图筛选不刷新**: useChart hook 在 option 为 null 时调用 `chart.clear()`

### Code Review

- 10轮审查覆盖后端API、存储层、前端Config/SPC/Dashboard/Help页面
- 发现并修复6个CRITICAL、8个WARNING、7个INFO级别问题

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
