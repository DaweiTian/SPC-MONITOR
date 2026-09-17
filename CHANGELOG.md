# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

## [1.7.6] - 2026-09-17

### Fixed

- **品项可见性统一**: 修正值、实时看板、SPC、过程能力、数据管理、指标预测、预警中心均隐藏「品项管理中停用」或「取消全部指标勾选」的品项；修正值编辑/列表只展示仍勾选的监测指标
- **空勾选语义**: 取消全部指标勾选时后端保留空数组（不再删除 key），避免前端回退为显示全部指标
- **品项编码含 `/` 导致配置失效**: 前端 API 路径对品项/指标编码做安全编码（`/` 双重编码），后端路径参数统一解码；规格限、修正值、监测指标、预测、类别、别名、SPC 等接口可正常读写含 `/` 的编码
- **品项编码与仪器一致性**: 品项编码即仪器数据库样品名称（采集键），编辑时置灰只读（disabled），不可随意修改；界面显示名请用「品项别名」；保存失败时通过 Toast 明确提示，不再静默失败

### Added

- **文件级增量热更新**: 构建时生成文件清单与相对上一版的 `patch-*.zip`；`latest.json` 增加 `platforms.windows-x86_64.patch` 字段；客户端优先下载校验增量包（SHA256），覆盖安装目录后重启，失败自动回退全量 NSIS 安装
- **`scripts/make-patch.ps1`**: 扫描主程序 + `ft1-backend/**`，对比 `versions/manifest-<ver>.json`，产出增量 zip 与 `patch-meta.json`，并注入 `latest.json`；排除运行时 DB/日志，避免覆盖用户数据
- **安装更新弹窗**: 展示增量包类型与大致下载体积；安装失败在弹窗内展示错误

### Changed

- **包体清理**: `build.bat` 复制后端后清理嵌套垃圾目录（叶子名 `ft1-backend`/`dist`/`run.dist`，避免误删整个后端）
- 更新命令 `check_for_update` / `download_update` 返回增加 `isIncremental`、`downloadSize`
- **配置保存反馈**: 品项管理保存成功/部分失败均弹出 Toast；编码含特殊字符时给出明确错误提示
- **版本号统一为 1.7.6**: 前端 package.json / package-lock、后端 FastAPI metadata、Tauri/Cargo、启动页 splash、NSIS sidebar、CHANGELOG

### Security

- 增量路径校验加固：拒绝绝对路径/盘符/`..` 越界；安装前复验暂存 zip SHA256；`patch.url` 与更新端点同源校验
- 维护模式：增量覆盖期间健康检查线程不再自动拉起后端
- 运行中主程序 copy 失败时从 `.exe.old` 回滚；安装失败可重试（pending 回写）
- `build.bat` / `package.ps1` 的 `latest.json` 改用 `ConvertTo-Json`，避免 changelog 引号破坏 JSON

## [1.7.5] - 2026-09-10

### Fixed

- **首启误弹共享密码**: 后端未就绪时前端不再 fail-closed 为「已启用密码保护」，改为启动等待页并轮询；仅在服务端确认 `passwordRequired` 且非本机时弹出密码框
- **后端慢启动被误杀**: launcher 健康检查按当前进程实例区分「启动中」与「卡死」；从未健康时首启宽限 120s（原先约 15s 即杀进程重启，工厂新机 Nuitka 解压易被反复打断）
- **启动重试**: 应用拉起后端失败重试 3 次；进程消失时 spawn 内再重试；`run.py` 端口占用重试 5→8 次
- **splash 超时卡死**: 超时后继续慢速轮询（5s），后端稍后就绪仍可进入；权限就绪后主动隐藏 splash
- **就绪信号丢失**: 监听 Tauri `backend-ready` 与 splash `ft1-backend-ready`；请求在途时补拉一次；后端从不可达恢复时刷新权限
- **密码框错误文案**: 区分「无法连接后端」与「密码错误」，避免后端未起时误导用户重输密码
- **等待页可操作**: 权限拉取连续失败约 15s 后显示排查提示与「立即重试」

### Changed

- 版本号统一为 1.7.5（前端 package.json、后端 FastAPI metadata、Tauri/Cargo、启动页、NSIS sidebar、CHANGELOG）
- `getPermissions` / `verifyPassword` 使用短超时（5s / 8s），降低启动竞态卡顿

## [1.7.4] - 2026-09-10

### Added

- **手动检查更新**: 侧边栏版本号支持左键/右键打开菜单，可手动检查更新
- **更新确认弹窗**: 发现新版本后先确认是否下载，避免静默占用带宽
- **历史更新日志**: 内嵌完整 CHANGELOG 弹窗（60% 屏宽居中），当前版本高亮

### Changed

- 版本号统一为 1.7.4（含后端 FastAPI metadata、启动页、安装图）
- 版本号菜单改用原生 `contextmenu` 拦截，避免浏览器右键菜单抢占
- NSIS 安装器 header/sidebar 品牌图重绘（对齐应用主 UI 风格）

### Fixed

- **下载防重入**: 「立即下载」改用 ref 防双击；已下载同版本直接复用，避免重复拉包
- **更新版本一致性**: 下载前校验 `expected_version`，服务器版本变化时拒绝并提示重新检查
- **弹窗叠层**: 后台静默下载完成时自动关闭「发现新版本」确认框，避免与安装弹窗并存
- **键盘操作**: 更新日志 / 版本菜单支持 Esc 关闭
- **安装失败可恢复**: 先确认有安装包再停后端；安装失败自动尝试重新拉起后端
- **版本号单一来源**: 前端版本从 `package.json` 构建注入（含启动页），升版不再漏改
- **折叠侧栏 tooltip**: 收起侧栏时版本摘要向右展开，不再被裁切
- **菜单定位**: 右键菜单按实测尺寸贴边夹紧，避免贴屏底/贴右边被裁

## [1.7.3] - 2026-09-09

### Fixed

- **ODBC 连接串编码错误**: `build_connection_string` 改为 `odbc_connect` 显式拼接，修复 `host\instance,port` 被 URL 编码成 `%5C`/`%2C` 导致 ODBC 回退命名管道、报错 [53] 的问题
- **ODBC 驱动自动选择**: 优先 18→17→11→Native Client，排除已废弃的 DBNETLIB「SQL Server」驱动
- **ODBC 连接属性**: `timeout` 改为 `Connection Timeout`，并附加 `TrustServerCertificate=yes`
- **flat 模式尊重 pymssql 驱动选择**: `from_config` 不再强制 ODBC；flat 采集与产品列表支持 pymssql 分支
- **规格限为 0 时漏报**: 告警引擎与前端保存逻辑改用 `is not None` / `Number.isFinite`，USL/LSL=0 可正常判定
- **过程能力 Ca 语义**: 改为传统偏移度 `|mean-target|/(T/2)`；零方差不再输出非法 `Infinity`；样本不足直接报错
- **突破概率与越限时刻**: 均值已越限时直接判定高风险；`breach_time` 按采样间隔外推，不再误用历史时间戳
- **滑动窗口 Cpk**: 改用 within-sigma（MR̄/1.128），与能力分析口径一致；Cpk 分级统一为 1.33/1.0
- **后端崩溃自动重启**: 进程退出后按指数退避自动拉起（原先仅 HTTP 失败才重启）
- **端口清理误杀风险**: 仅处理 LISTENING，精确匹配端口，并对 `ft1-backend.exe`/`python.exe` 做进程名白名单
- **开机自启覆盖用户设置**: 启动时不再无条件 enable OS 自启

### Security

- **远程访问强制鉴权**: 非本机请求拒绝公开默认 API Key；`config`/`data`/`correction` 模块服务端 403
- **共享密码会话 token**: `/api/auth/verify` 成功后签发 HMAC 短时 token，前端写入 sessionStorage（不再落 localStorage）
- **局域网设备扫描**: `/api/network/discover` 增加 API Key + 仅本机限制
- **构建产物脱敏**: `build.bat` 仅复制安全 conf 文件，不再打包数据库口令等运行时配置
- **签名密钥保护**: `.gitignore` 排除 `keys/`、`*.key`、`key-output*`；构建前强制校验 `TAURI_SIGNING_PRIVATE_KEY*`
- **移除 updater 调试残留**: 删除硬编码 HTTP 探测与 5 秒首检；恢复 60 秒首次检查；例行日志降为 info
- **Release 关闭 DevTools**: Tauri feature 仅保留 `tray-icon`

### Changed

- 版本号统一为 1.7.3（含后端 FastAPI metadata）
- 更新测试脚本与 nginx 缓存规则对齐实际 NSIS `*-setup.exe` 产物
- `package.ps1` 生成 `latest.json` 使用无 BOM UTF-8
- 手动采集与定时采集共用并发锁，避免重复采集
- 无规格限的交叉预测品项默认关闭告警

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

### 亮点

这是 spc-monitor 平台的首个生产发布版本：桌面壳从 Tauri v1 升级到 v2，后端打包从 PyInstaller 切换为 Nuitka，并新增实时预警通知（应用内 Toast、提示音与系统级推送）。

### 新增

- **预警通知**: 应用内 Toast 弹窗，按严重级别着色并带滑入/滑出动画
- **系统通知**: Tauri 原生通知（桌面端），浏览器 Notification API 兜底
- **预警提示音**: Web Audio API 蜂鸣；调用 `AudioContext.resume()` 以符合现代浏览器自动播放策略
- **浮动目录**: 帮助手册页启用 Scrollspy 目录（sticky + 浮动定位）
- **帮助手册组件化**: GlossaryPage / VisualGuidePage 替代 iframe 内嵌 HTML，消除资源协议问题
- **Tauri v2 通知插件**: 集成 `tauri-plugin-notification` 并完成权限配置
- **MDB 按样品边界截断**: `init_limit` 改为按样品数限制而非原始记录数，避免指标被截断一半
- **看板小组件 SPC 接口**: 新增 `/monitor/widget_spc`，供桌面看板组件取图
- **隐藏后端窗口**: Windows 下用 `EnumWindows` + `ShowWindow(SW_HIDE)` 隐藏 Python 控制台窗口
- **Launcher 端口校验**: 强制使用 18080，忽略用户配置的其他端口
- **Nuitka 构建流水线**: `build.bat` 一键构建，`pefile` 去除后端 exe 图标资源
- **PowerShell 打包脚本**: `package.ps1` 支持灵活打包
- **Vite 开发代理**: 开发模式将 `/api` 代理到 `localhost:18080`

### 变更

- **Tauri v1 → v2**: 迁移 `Cargo.toml`、`tauri.conf.json`、capabilities、`lib.rs`、`tray.rs`
- **Vite base 路径**: 由 `/app/` 改为 `./`，修复 Tauri 白屏（绝对路径与 `tauri://localhost/` 不兼容）
- **BrowserRouter basename**: 三态逻辑——Vite 开发与 Tauri 客户端不设 basename，浏览器生产环境用 `/app`
- **API 服务层**: 通过 `isTauri` 判断，Tauri 使用绝对 URL，浏览器使用相对路径
- **CSP 策略**: 增加 `tauri.localhost`、`asset:` 与 `frame-src` 指令
- **Launcher 服务**: `current_dir` 设为应用目录，stderr 重定向到日志文件
- **健康检查**: 由 `reqwest::blocking` 改为直接异步 `reqwest`，移除 `tokio` 依赖
- **图表颜色**: 折线色由 `#334155` 调亮为 `#94a3b8`，提升可读性
- **ECharts hook**: 注册 `ScatterChart`、`BoxplotChart`、`MarkAreaComponent`

### 修复

- **缺少 `import sys`**: Nuitka 编译后后端启动崩溃
- **Tauri 白屏**: 绝对路径 `/app/` 在 `tauri://localhost/` 下无法解析
- **浏览器刷新 404**: SPA 兜底路由对非 API 的 GET 请求返回 `index.html`
- **导航图标不加载**: 绝对路径 `/favicon.ico`、`/icons/...` 改为相对路径 `./favicon.ico`、`./icons/...`
- **托盘「显示窗口」无效**: 在 `set_focus()` 前增加 `unminimize()`
- **切换仪器未清 MDB 断点**: 导入 `BREAKPOINT_FILE` 常量并在切换时清除
- **看板小组件状态同步**: 仪表盘 API 响应增加 `collecting` 字段
- **AudioContext 被挂起**: 播放预警音前调用 `audioCtx.resume()`
- **CSS `borderColor` 被覆盖**: 调整内联样式顺序——简写属性在前、详写属性在后
- **`-(x - mu) ** 2` Babel 报错**: 将指数运算加括号写成 `(-((x - mu) ** 2))`
- **MarkLine 标签位置**: 去掉错误的 `position: 'end'` 覆盖
- **ctypes 回调返回类型**: 由 `c_bool` 改为 `wintypes.BOOL`，保证 64 位正确性

### 安全

- 全部 `/api/*` 路由启用 API Key 鉴权
- CSP 配置适配 Tauri 资源协议与 localhost 源
- WebSocket 使用查询参数传递 API Key（WS 路由不挂鉴权依赖）

## [1.0.0] - 2026-08-14

### 新增

- 初始项目结构
- FastAPI 后端 + SQLite 存储
- React 18 + TypeScript + Ant Design 5 前端
- SPC 控制图（I-MR）及 8 条 Nelson 判异准则
- 过程能力分析（Cp/Cpk/Pp/Ppk）
- 实时数据采集与自适应调度
- WebSocket 推送实时更新
- Mock / SQL Server / MDB / FTA 数据源连接器
- Tauri v1 桌面启动器
- 配置管理界面
- 数据管理与导出
- 预测模块
