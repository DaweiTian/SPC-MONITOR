import React, { useState } from 'react'
import { ManualPage } from './ManualPage'
import { UserGuidePage } from './UserGuidePage'
import styles from './Help.module.css'

const modules = [
  {
    title: '实时监控仪表盘',
    desc: '系统主页面，提供液奶生产质量的全局实时视图。包含 5 大 KPI 指标卡（今日检验量、待处理告警、平均 Cpk、变异系数 CV%、偏移量），实时质量趋势图（带 USL/LSL 规格限标线），产品 Cpk 矩阵以卡片形式展示各指标能力指数并以红黄绿色标分级。系统每 30 秒自动轮播 Top 3 产品，每 10 秒切换指标，实现无人值守的全局巡检。采集状态面板实时展示当前采集频率、运行状态、上次/下次采集时间、日成功率和数据源连接状态。',
    tags: ['实时刷新', '自动轮播', 'KPI 看板'],
  },
  {
    title: 'SPC 控制图分析',
    desc: '基于统计过程控制 (SPC) 理论，提供 I-MR（个体值-移动极差）控制图分析。支持两种分析模式：过程分析模式（分析全部数据）和稳定性分析模式（仅分析基准样/标准样）。系统自动计算 UCL、CL、LCL 控制限，并在图上叠加 USL/LSL 规格限标线。内置完整 8 条 Nelson 判异规则自动检测引擎，违规数据点在控制图上以红色圆点高亮标注，下方表格详细列出每条违规的规则编号、规则名称、描述和严重级别。',
    tags: ['I-MR 控制图', 'Nelson 8 条规则', '双模式分析'],
  },
  {
    title: '过程能力分析',
    desc: '量化评估生产过程满足规格要求的能力。计算四大核心能力指数：Cp（过程潜力）、Cpk（过程能力，含偏移修正）、Pp（整体过程潜力）、Ppk（整体过程能力），并支持 Ca（偏移系数）计算。Sigma 水平仪表盘直观展示当前过程的西格玛水平 (1σ~6σ+)，配套显示 PPM 缺陷率和合格率。直方图+正态曲线叠加展示质量数据的频率分布，Cpk 历史趋势图追踪能力指数的变化走势。支持单侧规格限（仅有 USL 或仅有 LSL）的自动检测和计算。',
    tags: ['Cp/Cpk/Pp/Ppk', 'Sigma 水平', '直方图'],
  },
  {
    title: '智能预测预警',
    desc: '内置多模型预测引擎，支持 ETS（指数平滑）、ARIMA（自回归积分移动平均）、MA（移动平均+线性趋势）三种预测模型，通过 ADF 平稳性检验自动选择最优模型（MASE 指标对比）。预测结果包含点预测值和 95% 置信区间。风险监测面板包含 Cpk 滑动窗口趋势分析、越限概率分析（LOW/MEDIUM/HIGH/CRITICAL 四级）、CUSUM 漂移检测。还提供指标相关性分析（Pearson 热力图）、GBDT 特征重要性排序、跨指标预测等深度分析能力。',
    tags: ['ETS/ARIMA', '越限概率', 'CUSUM 漂移'],
  },
  {
    title: '告警管理中心',
    desc: '统一管理所有质量告警事件。告警来源包括 Nelson 规则违规、Cpk 低于阈值、规格限越限三大类，每条告警自动生成唯一编号。告警分为 CRITICAL（严重）、WARNING（警告）、INFO（信息）三级，不同级别以红/橙/蓝色标区分。系统内置 24 小时去重窗口，支持单条和批量处置（确认/作废数据）。7 天告警趋势图和规则类型分布饼图帮助分析告警模式。WebSocket 实时推送新告警，配合系统通知和声音告警确保及时响应。',
    tags: ['三级告警', '24h 去重', '批量处置'],
  },
  {
    title: '多源数据采集',
    desc: '系统的核心数据底座，无缝对接三类乳品分析仪：FT1（SQL Server 关系型数据库）、FT120（Access MDB 文件）、FTA Perten（独立 SQL Server 数据库）。自适应采集调度器内置频率梯度 [5, 15, 30, 60, 120, 300] 分钟，在有新数据时保持高频采集（5 分钟），当连续无新数据时自动降频节能，数据恢复时自动提频。断点续传机制确保系统重启后不重复采集。修正值系统支持按产品+指标设置校准偏移量。',
    tags: ['FT1/FT120/FTA', '自适应调度', '断点续传'],
  },
  {
    title: '数据管理与配置',
    desc: '提供 17+ 项运行时配置能力，均支持热更新（无需重启服务）。包括：仪器源切换、规格限配置（USL/LSL/目标值）、Nelson 规则启用/禁用和严重级别调整、产品状态管理、修正值配置、产品分类管理、别名配置、排除备注关键词等。数据管理页面提供分页数据浏览、修正值在线编辑、数据作废/恢复、CSV 导出等功能。',
    tags: ['17+ 配置项', '零停机热更新', 'CSV 导出'],
  },
]

const nelsonRules = [
  { rule: '规则1', desc: '1点超出3σ控制限', type: '突发异常' },
  { rule: '规则2', desc: '连续9点在中心线同侧', type: '均值偏移' },
  { rule: '规则3', desc: '连续6点递增或递减', type: '趋势异常' },
  { rule: '规则4', desc: '连续14点交替上下', type: '数据分层' },
  { rule: '规则5', desc: '连续3点中2点在2σ外', type: '中等偏移' },
  { rule: '规则6', desc: '连续5点中4点在1σ外', type: '小偏移' },
  { rule: '规则7', desc: '连续15点在1σ内', type: '数据异常集中' },
  { rule: '规则8', desc: '连续8点无1点在1σ内', type: '数据过度分散' },
]

type TabKey = 'overview' | 'manual' | 'guide'

export const HelpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '系统说明' },
    { key: 'manual', label: '数据分析手册' },
    { key: 'guide', label: '系统使用帮助' },
  ]

  return (
    <div className={styles.pageLayout}>
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className={styles.contentScroll}>
          <div className={styles.brandHeader}>
            <img src="./icons/powered-by-yili2.svg" alt="YILI" className={styles.brandLogo} />
            <div className={styles.brandInfo}>
              <div className={styles.brandTitle}>液奶过程监控系统</div>
              <div className={styles.brandSub}>由液态奶中心实验室开发</div>
            </div>
          </div>

          <h3 className={styles.sectionTitle}>系统简介</h3>
          <p>
            液奶过程监控系统 (SPC-MONITOR) 是一套面向乳制品生产过程的实时 SPC 分析与智能预警平台。系统集成多源仪器数据自动采集、统计过程控制 (SPC) 分析、过程能力评估、AI 指标预测和分级预警功能，帮助质量管理人员实时掌握生产过程稳定性，将质量管控从"事后检验"升级为"实时监控、智能预警、主动预防"。
          </p>
          <p>
            系统无缝对接 FT1、FT120、FTA 三类乳品分析仪，通过自适应频率调度实现 7×24 小时不间断数据采集。内置 SPC 分析引擎（I-MR 控制图 + Nelson 8 条判异规则）和 AI 预测引擎（ETS/ARIMA 多模型自动择优 + 越限风险分析），覆盖数据采集、实时监控、过程分析、智能预警、数据管理全链路。
          </p>

          <h3 className={styles.sectionTitle}>功能模块说明</h3>
          {modules.map((m) => (
            <div key={m.title} className={styles.featureCard}>
              <div className={styles.featureTitle}>{m.title}</div>
              <div className={styles.featureTags}>
                {m.tags.map(t => <span key={t} className={styles.featureTag}>{t}</span>)}
              </div>
              <p>{m.desc}</p>
            </div>
          ))}

          <h3 className={styles.sectionTitle}>系统架构</h3>
          <p>系统采用四层架构设计，模块化解耦，各层独立演进：</p>

          {/* Layer 1 */}
          <div className={styles.archLayer}>
            <div className={styles.archLayerHead}>
              <span className={styles.archLayerBadge}>桌面应用层</span>
              <span className={styles.archLayerTech}>Tauri v2 + Rust</span>
            </div>
            <p>基于 Tauri v2 构建的桌面原生应用，安装包 &lt;10MB。提供系统托盘常驻、原生通知推送、开机自启动管理、后端进程生命周期管理（自动启动/停止 Python 后端服务）、声音告警等原生能力。</p>
          </div>

          {/* Layer 2 */}
          <div className={styles.archLayer}>
            <div className={styles.archLayerHead}>
              <span className={styles.archLayerBadge}>前端展示层</span>
              <span className={styles.archLayerTech}>React 18 + TypeScript + Vite 5</span>
            </div>
            <p>9 个功能页面、10+ 个公共组件，采用 ECharts 5 渲染交互式图表，Ant Design 5 提供企业级 UI 组件，WebSocket 实现实时数据推送。深色科技主题，支持响应式布局。</p>
          </div>

          {/* Layer 3 */}
          <div className={styles.archLayer}>
            <div className={styles.archLayerHead}>
              <span className={styles.archLayerBadge}>后端服务层</span>
              <span className={styles.archLayerTech}>FastAPI + Python 3.11</span>
            </div>
            <p>7 个 API 模块（监控、SPC、预测、告警、数据、配置、WebSocket），API Key 认证。核心分析引擎基于 NumPy + SciPy + statsmodels + scikit-learn，实现 SPC 控制图计算、Nelson 规则检测、过程能力分析、时序预测（ETS/ARIMA）、CUSUM 漂移检测、GBDT 特征重要性分析。APScheduler 实现自适应采集调度。</p>
          </div>

          {/* Layer 4 */}
          <div className={styles.archLayer}>
            <div className={styles.archLayerHead}>
              <span className={styles.archLayerBadge}>数据存储层</span>
              <span className={styles.archLayerTech}>SQLite + SQL Server + MDB</span>
            </div>
            <p>SQLite (WAL 模式) 用于本地数据存储和配置管理；SQL Server 对接 FT1 仪器数据源；MDB 文件解析对接 FT120 仪器；独立 SQL Server 对接 FTA Perten 数据库。三类数据源统一采集、统一存储。</p>
          </div>

          <div className={styles.archFlow}>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>FT1</span>
              <span className={styles.archFlowDesc}>SQL Server</span>
            </div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>FT120</span>
              <span className={styles.archFlowDesc}>MDB 文件</span>
            </div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>FTA</span>
              <span className={styles.archFlowDesc}>Perten DB</span>
            </div>
            <div className={styles.archFlowArrow}>→</div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>采集调度</span>
              <span className={styles.archFlowDesc}>自适应频率</span>
            </div>
            <div className={styles.archFlowArrow}>→</div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>分析引擎</span>
              <span className={styles.archFlowDesc}>SPC + AI</span>
            </div>
            <div className={styles.archFlowArrow}>→</div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>WebSocket</span>
              <span className={styles.archFlowDesc}>实时推送</span>
            </div>
            <div className={styles.archFlowArrow}>→</div>
            <div className={styles.archFlowItem}>
              <span className={styles.archFlowLabel}>前端展示</span>
              <span className={styles.archFlowDesc}>React + ECharts</span>
            </div>
          </div>

          <h3 className={styles.sectionTitle}>技术栈</h3>
          <table className={styles.rulesTable}>
            <thead><tr><th>层次</th><th>技术选型</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td className={styles.ruleName}>桌面壳</td><td>Tauri v2 + Rust</td><td>体积小 (&lt;10MB)、内存低、原生系统集成</td></tr>
              <tr><td className={styles.ruleName}>前端框架</td><td>React 18 + TypeScript + Vite 5</td><td>类型安全、热更新快、生态成熟</td></tr>
              <tr><td className={styles.ruleName}>UI / 图表</td><td>Ant Design 5 + ECharts 5</td><td>企业级组件 + 交互式可视化</td></tr>
              <tr><td className={styles.ruleName}>后端框架</td><td>FastAPI + Uvicorn</td><td>异步高性能、自动 API 文档</td></tr>
              <tr><td className={styles.ruleName}>分析引擎</td><td>NumPy + SciPy + statsmodels</td><td>SPC 计算、时序预测、统计检验</td></tr>
              <tr><td className={styles.ruleName}>机器学习</td><td>scikit-learn</td><td>GBDT 特征重要性分析</td></tr>
              <tr><td className={styles.ruleName}>调度器</td><td>APScheduler</td><td>自适应频率调度、后台运行</td></tr>
              <tr><td className={styles.ruleName}>数据层</td><td>SQLite (WAL) + pymssql</td><td>本地存储 + SQL Server 对接</td></tr>
            </tbody>
          </table>

          <h3 className={styles.sectionTitle}>SPC判异规则（Nelson Rules）</h3>
          <table className={styles.rulesTable}>
            <thead>
              <tr>
                <th>规则</th>
                <th>描述</th>
                <th>异常类型</th>
              </tr>
            </thead>
            <tbody>
              {nelsonRules.map((r) => (
                <tr key={r.rule}>
                  <td className={styles.ruleName}>{r.rule}</td>
                  <td>{r.desc}</td>
                  <td>{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'manual' && <ManualPage />}
      {activeTab === 'guide' && <UserGuidePage />}
    </div>
  )
}

export default HelpPage
