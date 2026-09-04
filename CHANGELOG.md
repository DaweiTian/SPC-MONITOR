# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [1.7.2] - 2026-09-05

### Fixed

- **修复 HTTP 更新端点**: 添加 `dangerousInsecureTransportProtocol` 配置，允许内网 HTTP 更新服务器
- **添加诊断日志**: 自定义 panic handler 和启动阶段日志，便于排查启动问题

## [1.7.1] - 2026-09-04

### Added

- **自动更新功能**: 集成 `tauri-plugin-updater`，支持应用启动时和每3天定时检查更新
- **静默下载更新**: 发现新版本后自动在后台下载，完成后弹窗提示用户安装
- **本地更新测试脚本**: 新增 `test-update-server.bat`，支持用 localhost 验证更新流程
- **构建产物清单生成**: `build.bat` 新增步骤自动生成 `latest.json` 更新清单

### Changed

- 版本号统一管理：修复 `Cargo.toml` 版本号与其他文件不同步的问题

## [1.7.0] - 2026-09-03

### Added

- **M8随机森林预测模型**: 饱和脂肪跨指标预测新增M8随机森林模型，替代原有单一线性K值公式
- **双模型自动切换**: 有酸度数据时使用M8完整模型(5特征, MAPE≈2.4%)，无酸度时自动切换M8-Lite模型(4特征, MAPE≈3.0%)
- **品项管理预测方式切换**: 预测指标区域新增"线性公式/M8随机森林"切换，默认M8随机森林
- **图表模型标注**: 实时看板和SPC控制图的预测曲线在图例和tooltip中显示模型名称(M8/M8-Lite/线性K值)
- **M8-Lite轻量模型**: 基于4特征(脂肪+品项+季节+蛋白质)训练的降级模型，覆盖无酸度数据的品项
- **数据对齐优化**: 跨指标预测优先使用同批次(sample_id)的蛋白质/酸度数据，其次同日数据，最后最新数据

### Changed

- 跨指标预测配置新增 `prediction_method` 和 `product_category` 字段，默认预测方式为随机森林
- 缺失蛋白质时使用训练集均值(3.2)兜底，缺失酸度时自动降级到M8-Lite模型
- 图表预测曲线标签从"预测值"改为"饱和脂肪(M8)"等含模型名的标签

## [1.6.3] - 2026-08-24

### Added

- **数据管理页面**: 新增"样品编号"和"备注"列显示及在线编辑功能
- **NSIS 安装预处理**: 安装前自动终止 `ft1-backend.exe` 进程，避免升级时文件被锁定
- **启动重试机制**: `useProducts`、`useIndicators`、`useAppMetadata` 钩子及 Dashboard 元数据加载增加重试逻辑（3次，间隔2秒），解决后端刚启动时数据加载失败问题

### Changed

- 实时看板指标轮换现在仅显示品项管理中勾选的指标，与SPC控制图行为一致
- SPC控制图品项下拉选项显示用户配置的品项别名
- 过程控制能力页面品项下拉选项显示用户配置的品项和项目别名
- SPC控制图页面初始化时优先使用品项管理中保存的指标列表
- 切换品项时自动选择该品项下第一个已保存的指标
- 数据管理页面"编辑"按钮功能扩展：支持编辑样品编号、备注、单位和规格限
- 开发脚本 `stop.sh` 等待端口释放后才返回，超时则 SIGKILL 强杀
- 开发脚本 `dev.sh` 启动前检查端口可用性，避免端口冲突
- 版本号更新至 v1.6.3

### Fixed

- FTA 连接后过程控制能力页面无法加载数据（回退到配置文件中的规格限）
- FTA 连接后排除备注关键词过滤不生效（`/monitor/data/recent` 端点应用排除规则）
- 从其他页面切换到 SPC 控制图后图表不自动渲染
- CSV 导出在未选择筛选条件时报"No data"错误（支持无条件导出全部数据）
- 实时看板趋势数据未过滤排除备注关键词

## [1.6.2] - 2026-08-23

### Added

- **网络设置页面** (`/settings`): 局域网共享开关、共享密码管理、防火墙一键放行、访问地址复制
- **设备管理页面** (`/devices`): 局域网设备扫描、手动添加/移除设备、设备列表管理
- **密码验证对话框** (`PasswordDialog`): 远程访问时弹出密码输入框，支持 sessionStorage 持久化
- **共享密码保护**: `POST /api/auth/verify` 密码验证端点，远程用户需输入密码才能访问
- **局域网发现** (`GET /api/network/discover`): 扫描同网段内其他 spc-monitor 实例
- **防火墙放行** (`POST /api/network/open-firewall`): 一键 Windows 防火墙端口放行（UAC 提权）
- **防火墙脚本** (`scripts/open-firewall.bat`): 手动防火墙配置工具

### Changed

- 远程用户权限限制：禁止访问 `config`、`data`、`correction`、`network`、`devices` 模块
- SQL Server 主机名解析捕获 `OSError`（兼容 Windows 非ASCII主机名）
- 服务器字符串诊断支持 `:` 分隔符（兼容 `host:port` 格式）
- 版本号更新至 v1.6.2

### Fixed

- SQL Server 中文/非ASCII主机名连接失败问题（`_resolve_host`）
- 规格限清空后未同步更新（空字符串通过 `!= null` 检查）
- 配置管理表头滚动时不可见（`position: sticky`）
- `get_server_config` 异常静默吞没（添加日志）
- 密码比较改用 `hmac.compare_digest` 防时序攻击
- 新增 API 端点添加认证和权限检查
- 设备发现超时未捕获 `TimeoutError`
- 网络故障时默认拒绝访问（原为授予全部权限）

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

## [1.5.5] - 2026-08-24

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

## [1.5.1] - 2026-08-23

### Highlights

This is the first production release of the spc-monitor platform. It migrates the desktop shell from Tauri v1 to v2, replaces PyInstaller with Nuitka for backend packaging, and adds real-time alert notifications with in-app toast, sound, and system-level push.

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

## [1.0.0] - 2026-08-14

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
