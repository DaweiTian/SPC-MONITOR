import React, { useState, useEffect, useCallback } from 'react'
import s from './UserGuide.module.css'

/* ─── Reusable bits ─── */
const Section: React.FC<{ id: string; icon: React.ReactNode; title: string; subtitle?: string; tag?: string; tagClass?: string; children: React.ReactNode }> =
  ({ id, icon, title, subtitle, tag, tagClass, children }) => (
    <section id={id}>
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardHeaderIcon}>{icon}</div>
          <div>
            <span className={s.cardTitle}>{title}</span>
            {subtitle && <span className={s.cardSubtitle}>{subtitle}</span>}
          </div>
          {tag && <span className={`${s.cardTag} ${tagClass ?? ''}`}>{tag}</span>}
        </div>
        {children}
      </div>
    </section>
  )

const Step: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className={s.step}>
    <div className={s.stepTitle}>{title}</div>
    <div className={s.stepBody}>{children}</div>
  </div>
)

const Tip: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={s.tipBox}>{children}</div>
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={s.noteBox}>{children}</div>

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className={s.kbd}>{children}</kbd>

/* ─── Icons ─── */
const svgGear = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
const svgMonitor = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const svgTarget = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
const svgTrend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
const svgBell = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
const svgDB = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
const svgEdit = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const svgLine = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>

/* ─── TOC ─── */
const tocItems = [
  { id: 'overview', title: '系统概览' },
  { id: 'config-instrument', title: '仪器数据源配置' },
  { id: 'config-product', title: '品项管理' },
  { id: 'config-spec', title: '规格限配置' },
  { id: 'config-nelson', title: '预警规则配置' },
  { id: 'config-frequency', title: '采集频率配置' },
  { id: 'config-alias', title: '别名与排除配置' },
  { id: 'config-prediction', title: '交叉预测配置' },
  { id: 'page-dashboard', title: '实时看板' },
  { id: 'page-spc', title: 'SPC 控制图' },
  { id: 'page-capability', title: '过程能力分析' },
  { id: 'page-prediction', title: '智能预测' },
  { id: 'page-alerts', title: '预警中心' },
  { id: 'page-correction', title: '修正值管理' },
  { id: 'page-data', title: '数据管理' },
]

/* ════════════════════ MAIN COMPONENT ════════════════════ */
export const UserGuidePage: React.FC = () => {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio)
          else visible.delete(entry.target.id)
        })
        let bestId = ''
        let bestRatio = 0
        visible.forEach((ratio, id) => { if (ratio > bestRatio) { bestRatio = ratio; bestId = id } })
        if (bestId) setActiveId(bestId)
      },
      { threshold: [0, 0.25, 0.5], rootMargin: '-80px 0px -60% 0px' }
    )
    tocItems.forEach(({ id }) => { const el = document.getElementById(id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  const handleNav = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className={s.page}>
      {/* Fixed Left Sidebar */}
      <nav className={s.sidebar}>
        <div className={s.sidebarTitle}>目录</div>
        {tocItems.map(item => (
          <button
            key={item.id}
            className={`${s.sidebarItem} ${activeId === item.id ? s.sidebarItemActive : ''}`}
            onClick={() => handleNav(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>

      {/* Scrollable Content */}
      <div className={s.content}>
        {/* Hero */}
        <div className={s.hero}>
          <div className={s.heroTitle}>系统使用帮助</div>
          <div className={s.heroSub}>配置管理 · 功能操作 · 分析指南 · 常见问题</div>
          <div className={s.heroMeta}>
            <div><div className={s.heroMetaNum}>8</div><div className={s.heroMetaLbl}>配置模块</div></div>
            <div><div className={s.heroMetaNum}>7</div><div className={s.heroMetaLbl}>功能页面</div></div>
            <div><div className={s.heroMetaNum}>17+</div><div className={s.heroMetaLbl}>配置项</div></div>
          </div>
        </div>

        {/* ─── 系统概览 ─── */}
        <Section id="overview" icon={svgMonitor} title="系统概览" subtitle="快速了解系统功能布局与操作逻辑" tag="入门" tagClass={s.tagGreen}>
          <p>液奶过程监控系统采用左侧导航栏 + 顶部标签页的布局结构。导航栏分为三个功能组：</p>
          <table className={s.table}>
            <thead><tr><th>功能组</th><th>页面</th><th>用途</th></tr></thead>
            <tbody>
              <tr><td rowSpan={5}><strong>监控中心</strong></td><td>实时看板</td><td>全局质量概览，KPI 指标卡 + 趋势图 + Cpk 矩阵</td></tr>
              <tr><td>SPC 控制图</td><td>I-MR / EWMA 控制图分析，Nelson 规则检测</td></tr>
              <tr><td>过程能力</td><td>Cp/Cpk/Pp/Ppk 计算，直方图，Sigma 水平</td></tr>
              <tr><td>指标预测</td><td>时序预测、风险监测、相关性分析</td></tr>
              <tr><td>预警中心</td><td>告警列表、处置、趋势分析</td></tr>
              <tr><td rowSpan={3}><strong>数据管理</strong></td><td>修正值管理</td><td>按品项/指标设置校准偏移量</td></tr>
              <tr><td>数据管理</td><td>数据浏览、编辑、作废、导出</td></tr>
              <tr><td>配置管理</td><td>仪器源、品项、规格限、规则等全部配置</td></tr>
              <tr><td><strong>其他</strong></td><td>帮助说明</td><td>系统说明、数据分析手册、本使用帮助</td></tr>
            </tbody>
          </table>
          <Tip>所有配置修改均支持<strong>热更新</strong>，保存后立即生效，无需重启服务。</Tip>
        </Section>

        {/* ═══════════════════ 配置管理 ═══════════════════ */}

        {/* ─── 仪器数据源配置 ─── */}
        <Section id="config-instrument" icon={svgGear} title="仪器数据源配置" subtitle="选择和配置数据采集来源" tag="配置" tagClass={s.tagBlue}>
          <p>系统支持四种数据源类型，通过配置管理页面底部的「仪器选择」区域切换：</p>
          <table className={s.table}>
            <thead><tr><th>数据源</th><th>类型</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><strong>Mock 模拟数据</strong></td><td>模拟</td><td>用于演示和测试，自动生成模拟检测数据，无需真实仪器连接</td></tr>
              <tr><td><strong>FT1 乳品分析仪</strong></td><td>SQL Server</td><td>连接 FT1 仪器的 SQL Server 数据库，支持 Windows 认证和 SQL Server 认证两种方式</td></tr>
              <tr><td><strong>FT120 乳品分析仪</strong></td><td>MDB 文件</td><td>读取 FT120 仪器导出的 Access MDB 文件，需配置文件路径和表/字段映射</td></tr>
              <tr><td><strong>FTA 乳品分析仪</strong></td><td>FTA SQL Server</td><td>连接 FTA (Perten) 仪器的独立 SQL Server 数据库</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>FT1 数据库配置</h3>
          <p>选择 FT1 后，需填写以下数据库连接信息：</p>
          <table className={s.table}>
            <thead><tr><th>配置项</th><th>说明</th><th>示例</th></tr></thead>
            <tbody>
              <tr><td><strong>服务器地址</strong> (必填)</td><td>SQL Server 实例地址，格式：主机名\实例名,端口</td><td>XTZJ-20230331ga\MSCFT1SQLSERVER,49382</td></tr>
              <tr><td><strong>数据库名称</strong> (必填)</td><td>FT1 默认数据库名</td><td>MSCFT1</td></tr>
              <tr><td><strong>认证方式</strong></td><td>Windows 认证 (SSPI) 或 SQL Server 认证</td><td>Windows 认证无需填写账号密码</td></tr>
              <tr><td><strong>用户名 / 密码</strong></td><td>仅 SQL Server 认证时需要填写</td><td>—</td></tr>
              <tr><td><strong>连接超时</strong></td><td>连接等待时间，范围 5~120 秒</td><td>默认 30 秒</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>FT120 MDB 文件配置</h3>
          <p>选择 FT120 后，需配置 MDB 文件路径和表结构映射：</p>
          <table className={s.table}>
            <thead><tr><th>配置项</th><th>说明</th><th>默认值</th></tr></thead>
            <tbody>
              <tr><td><strong>MDB 文件路径</strong></td><td>Access 数据库文件的完整路径</td><td>—</td></tr>
              <tr><td><strong>样品表名</strong></td><td>存储检测数据的表名</td><td>Sample</td></tr>
              <tr><td><strong>产品表名</strong></td><td>存储产品信息的表名</td><td>Product</td></tr>
              <tr><td><strong>成分表名</strong></td><td>存储成分/指标信息的表名</td><td>Component</td></tr>
              <tr><td><strong>时间列名</strong></td><td>检测时间字段名</td><td>DateTime</td></tr>
              <tr><td><strong>产品引用列</strong></td><td>产品表中的引用字段</td><td>ProdRef</td></tr>
              <tr><td><strong>成分引用列</strong></td><td>成分表中的引用字段</td><td>CompRef</td></tr>
              <tr><td><strong>数值列名</strong></td><td>检测数值字段名</td><td>Value</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>FTA 数据库配置</h3>
          <p>选择 FTA 后，配置方式与 FT1 类似，但连接的是 Perten 仪器的独立 SQL Server 实例。默认数据库名为 <code>Pert_Application</code>，默认使用 SQL Server 认证。</p>

          <Step title="操作步骤">
            <ol className={s.stepList}>
              <li>在仪器选择区域点击目标数据源卡片</li>
              <li>填写对应的连接配置信息</li>
              <li>点击「测试连接」验证配置是否正确</li>
              <li>测试通过后点击「保存配置」</li>
              <li>系统将自动连接数据源并预览最近数据</li>
              <li>确认数据无误后，系统开始自动采集</li>
            </ol>
          </Step>
          <Tip>首次连接新数据源时，系统会自动识别产品和指标，并在品项管理中展示。切换数据源后，原有配置（规格限、修正值等）不受影响。</Tip>
        </Section>

        {/* ─── 品项管理 ─── */}
        <Section id="config-product" icon={svgDB} title="品项管理" subtitle="管理检测产品及其监测指标" tag="配置" tagClass={s.tagBlue}>
          <p>品项管理位于配置管理页面顶部，以表格形式展示所有已识别的产品（品项）。每个品项包含以下信息：</p>
          <table className={s.table}>
            <thead><tr><th>列名</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><strong>品项名称</strong></td><td>产品的显示名称，可自定义别名</td></tr>
              <tr><td><strong>编码</strong></td><td>产品的唯一标识码，来自数据源</td></tr>
              <tr><td><strong>样品类别</strong></td><td>产品所属的检测类别（如常温奶、低温奶等）</td></tr>
              <tr><td><strong>监测指标数</strong></td><td>该产品已启用的检测指标数量</td></tr>
              <tr><td><strong>规格限</strong></td><td>已配置的 USL/LSL 规格限摘要</td></tr>
              <tr><td><strong>状态</strong></td><td>启用（绿色）或停用（橙色）</td></tr>
            </tbody>
          </table>

          <Step title="编辑品项">
            <p>点击操作列的「编辑」按钮，打开品项编辑弹窗，可配置以下内容：</p>
            <ul className={s.bulletList}>
              <li><strong>基本信息</strong>：品项名称、编码、启用/停用状态</li>
              <li><strong>品项别名</strong>：为产品设置更易读的显示名称</li>
              <li><strong>样品类别</strong>：选择产品所属类别，影响交叉预测的系数</li>
              <li><strong>监测指标</strong>：勾选需要监测的指标，设置各指标的规格限（USL/LSL/目标值）</li>
              <li><strong>交叉预测</strong>：配置脂肪→饱和脂肪酸的交叉预测参数</li>
            </ul>
          </Step>

          <Step title="搜索品项">
            <p>品项表格右上角提供搜索框，支持按品项名称或编码模糊搜索，快速定位目标品项。</p>
          </Step>
          <Note>停用品项后，该品项的数据将不再参与 SPC 分析和告警生成，但历史数据仍保留在数据库中。</Note>
        </Section>

        {/* ─── 规格限配置 ─── */}
        <Section id="config-spec" icon={svgTarget} title="规格限配置" subtitle="设置各指标的上下规格限和目标值" tag="配置" tagClass={s.tagBlue}>
          <p>规格限是产品质量判定的核心参数，定义了每个检测指标的合格范围。在品项编辑弹窗中，为每个启用的指标设置：</p>
          <table className={s.table}>
            <thead><tr><th>参数</th><th>含义</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><strong>USL</strong> (上规格限)</td><td>指标允许的最大值</td><td>超过此值判定为不合格</td></tr>
              <tr><td><strong>LSL</strong> (下规格限)</td><td>指标允许的最小值</td><td>低于此值判定为不合格</td></tr>
              <tr><td><strong>目标值</strong></td><td>指标的理想目标值</td><td>用于 Cpk 计算的中心参考</td></tr>
            </tbody>
          </table>

          <Step title="配置方式">
            <ol className={s.stepList}>
              <li>在品项管理表格中点击目标品项的「编辑」</li>
              <li>在弹窗的指标列表中，勾选需要监测的指标</li>
              <li>为每个启用的指标填写 USL、LSL 和目标值</li>
              <li>支持单侧规格限：仅填写 USL 或 LSL 即可（如酸度仅有上限）</li>
              <li>点击保存后，规格限立即生效于 SPC 分析和告警判定</li>
            </ol>
          </Step>
          <Tip>规格限同时用于控制图上的标线显示、过程能力指数计算、越限告警触发三个场景，是系统最核心的配置项。</Tip>
        </Section>

        {/* ─── 预警规则配置 ─── */}
        <Section id="config-nelson" icon={svgBell} title="预警规则配置" subtitle="启用/禁用 Nelson 判异规则及调整告警级别" tag="配置" tagClass={s.tagBlue}>
          <p>预警规则配置位于配置管理页面右侧，以表格形式展示 8 条 Nelson 判异规则。每条规则包含：</p>
          <table className={s.table}>
            <thead><tr><th>列名</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><strong>规则</strong></td><td>规则编号（规则1 ~ 规则8）</td></tr>
              <tr><td><strong>描述</strong></td><td>规则的具体判定条件</td></tr>
              <tr><td><strong>级别</strong></td><td>告警严重级别：严重（红）/ 警告（橙）/ 信息（蓝）</td></tr>
              <tr><td><strong>状态</strong></td><td>启用/禁用开关</td></tr>
            </tbody>
          </table>

          <Step title="操作方法">
            <p>点击规则行右侧的<strong>开关按钮</strong>即可切换该规则的启用/禁用状态。修改后自动保存，立即生效于 SPC 控制图的违规检测。</p>
          </Step>
          <Note>禁用某条规则后，该规则的违规点将不再在 SPC 控制图上高亮，也不会生成对应的告警事件。建议根据实际生产需求选择性启用。</Note>
        </Section>

        {/* ─── 采集频率配置 ─── */}
        <Section id="config-frequency" icon={svgTrend} title="采集频率配置" subtitle="查看和理解自适应采集调度策略" tag="配置" tagClass={s.tagBlue}>
          <p>采集频率配置位于配置管理页面左侧，以可视化阶梯图展示当前的采集频率状态。系统采用<strong>自适应频率调度</strong>策略：</p>
          <table className={s.table}>
            <thead><tr><th>阶梯级别</th><th>采集间隔</th><th>触发条件</th></tr></thead>
            <tbody>
              <tr><td><strong>L0</strong></td><td>5 分钟</td><td>默认频率，有新数据时保持</td></tr>
              <tr><td><strong>L1</strong></td><td>15 分钟</td><td>连续无新数据时第一次降级</td></tr>
              <tr><td><strong>L2</strong></td><td>30 分钟</td><td>继续无新数据</td></tr>
              <tr><td><strong>L3</strong></td><td>60 分钟</td><td>继续无新数据</td></tr>
              <tr><td><strong>L4</strong></td><td>120 分钟</td><td>继续无新数据</td></tr>
              <tr><td><strong>L5</strong></td><td>300 分钟</td><td>最低频率（夜间/停机）</td></tr>
            </tbody>
          </table>

          <Step title="调度策略">
            <ul className={s.bulletList}>
              <li><strong>自动降级</strong>：连续采集未获得新数据时，按阶梯逐步降低频率</li>
              <li><strong>自动恢复</strong>：一旦采集到新数据，立即恢复至 L0（5分钟）</li>
              <li><strong>断点续传</strong>：系统重启后从上次采集位置继续，不重复采集</li>
            </ul>
          </Step>
          <Tip>采集频率为系统自动管理，无需手动调整。阶梯图上的脉冲动画标识当前所处的频率级别。</Tip>
        </Section>

        {/* ─── 别名与排除配置 ─── */}
        <Section id="config-alias" icon={svgEdit} title="别名与排除配置" subtitle="设置指标别名和排除备注关键词" tag="配置" tagClass={s.tagBlue}>
          <h3 className={s.h3}>检验项目别名</h3>
          <p>配置管理页面提供「检验项目别名」模块，可为检测指标设置更易读的显示名称。例如将 <code>fat</code> 映射为「脂肪」，<code>protein</code> 映射为「蛋白质」。别名设置后在所有页面统一生效。</p>

          <h3 className={s.h3}>排除备注关键词</h3>
          <p>某些检测数据的备注中包含特殊标记（如「基准样」「标准样」），这些数据不应参与 SPC 分析和过程能力计算。通过「排除备注关键词」模块管理：</p>
          <Step title="操作方法">
            <ul className={s.bulletList}>
              <li>在输入框中输入关键词（如「基准样」），点击「添加」或按 <Kbd>Enter</Kbd></li>
              <li>已添加的关键词以标签形式展示，点击标签右侧的 <strong>×</strong> 可删除</li>
              <li>包含这些关键词的备注数据将被自动排除，不参与任何统计计算</li>
            </ul>
          </Step>
        </Section>

        {/* ─── 交叉预测配置 ─── */}
        <Section id="config-prediction" icon={svgTrend} title="交叉预测配置" subtitle="配置脂肪→饱和脂肪酸的交叉预测参数" tag="配置" tagClass={s.tagBlue}>
          <p>系统支持基于脂肪含量预测饱和脂肪酸含量的交叉预测功能。在品项编辑弹窗中配置：</p>
          <table className={s.table}>
            <thead><tr><th>配置项</th><th>说明</th><th>默认值</th></tr></thead>
            <tbody>
              <tr><td><strong>启用交叉预测</strong></td><td>开关：是否对该品项启用脂肪→饱和脂肪酸预测</td><td>关闭</td></tr>
              <tr><td><strong>预测系数</strong></td><td>线性回归系数 k，饱和脂肪酸 = k × 脂肪</td><td>根据样品类别自动填充</td></tr>
              <tr><td><strong>预测告警</strong></td><td>是否对预测值启用越限告警</td><td>关闭</td></tr>
              <tr><td><strong>告警阈值</strong></td><td>预测偏差超过此百分比时触发告警</td><td>10%</td></tr>
              <tr><td><strong>预测规格限</strong></td><td>预测值的 USL/LSL/目标值（独立于实测值规格限）</td><td>—</td></tr>
            </tbody>
          </table>
          <Note>预测系数会根据所选的样品类别自动填充推荐值。不同产品类别的系数不同，可在配置中微调。</Note>
        </Section>

        {/* ═══════════════════ 功能页面 ═══════════════════ */}

        {/* ─── 实时看板 ─── */}
        <Section id="page-dashboard" icon={svgMonitor} title="实时看板" subtitle="全局质量概览与实时监控" tag="监控" tagClass={s.tagCyan}>
          <p>实时看板是系统的默认首页，提供液奶生产质量的全局实时视图。页面包含以下核心区域：</p>

          <h3 className={s.h3}>KPI 指标卡</h3>
          <p>页面顶部展示 5 个关键绩效指标卡片：</p>
          <table className={s.table}>
            <thead><tr><th>指标</th><th>含义</th><th>刷新频率</th></tr></thead>
            <tbody>
              <tr><td><strong>今日检验量</strong></td><td>当天已采集的检测数据总数</td><td>实时</td></tr>
              <tr><td><strong>待处理告警</strong></td><td>未确认/未作废的告警数量</td><td>实时</td></tr>
              <tr><td><strong>平均 Cpk</strong></td><td>所有启用品项的平均过程能力指数</td><td>每轮采集</td></tr>
              <tr><td><strong>变异系数 CV%</strong></td><td>过程变异系数，反映整体波动水平</td><td>每轮采集</td></tr>
              <tr><td><strong>偏移量</strong></td><td>当前均值相对于目标值的偏移程度</td><td>每轮采集</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>质量趋势图</h3>
          <p>展示最近检测数据的趋势曲线，叠加 USL/LSL 规格限标线，直观判断数据是否在规格范围内波动。</p>

          <h3 className={s.h3}>产品 Cpk 矩阵</h3>
          <p>以卡片矩阵形式展示各品项各指标的 Cpk 值，颜色分级：</p>
          <ul className={s.bulletList}>
            <li><span style={{color:'#10b981',fontWeight:600}}>绿色</span>：Cpk ≥ 1.33，过程能力充足</li>
            <li><span style={{color:'#f59e0b',fontWeight:600}}>黄色</span>：1.00 ≤ Cpk &lt; 1.33，能力尚可但需关注</li>
            <li><span style={{color:'#ef4444',fontWeight:600}}>红色</span>：Cpk &lt; 1.00，能力不足，需立即改善</li>
          </ul>

          <h3 className={s.h3}>自动轮播</h3>
          <p>看板支持无人值守自动巡检模式：每 30 秒自动切换展示 Top 3 产品，每 10 秒切换当前产品的指标。采集状态面板实时显示采集频率、运行状态、成功率和数据源连接状态。</p>
          <Tip>看板数据通过 WebSocket 实时推送，无需手动刷新。页面右上角显示系统时钟和连接状态。</Tip>
        </Section>

        {/* ─── SPC 控制图 ─── */}
        <Section id="page-spc" icon={svgLine} title="SPC 控制图" subtitle="统计过程控制分析与判异检测" tag="分析" tagClass={s.tagPurple}>
          <p>SPC 控制图页面提供基于统计过程控制理论的过程稳定性分析，是质量管控的核心分析工具。</p>

          <h3 className={s.h3}>分析模式</h3>
          <table className={s.table}>
            <thead><tr><th>模式</th><th>说明</th><th>适用场景</th></tr></thead>
            <tbody>
              <tr><td><strong>过程分析</strong></td><td>分析全部检测数据</td><td>日常质量监控，全面了解过程状态</td></tr>
              <tr><td><strong>稳定性分析</strong></td><td>仅分析基准样/标准样数据</td><td>仪器校准验证，排除产品差异干扰</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>控制图类型</h3>
          <ul className={s.bulletList}>
            <li><strong>I-MR 控制图</strong>（个体值-移动极差图）：展示每个检测值及其控制限（UCL/CL/LCL），同时显示移动极差图监控过程波动性</li>
            <li><strong>EWMA 控制图</strong>（指数加权移动平均图）：对均值微小漂移更敏感，Lambda 参数可调（0.05~0.50），适合检测渐进性趋势变化</li>
          </ul>

          <h3 className={s.h3}>Nelson 规则违规检测</h3>
          <p>系统自动对每个数据点应用 8 条 Nelson 判异规则，违规数据点在控制图上以<strong>红色圆点</strong>高亮标注。控制图下方的违规详情表格列出每条违规的规则编号、名称、描述和严重级别。</p>

          <Step title="操作步骤">
            <ol className={s.stepList}>
              <li>选择品项和指标</li>
              <li>选择分析模式（过程分析 / 稳定性分析）</li>
              <li>可选：设置日期范围筛选数据</li>
              <li>可选：启用 EWMA 控制图并调整 Lambda 参数</li>
              <li>查看控制图上的数据分布和违规点标注</li>
              <li>查看下方违规详情表格，了解每条违规的具体信息</li>
            </ol>
          </Step>
          <Note>控制限（UCL/LCL）由过程数据自动计算，与规格限（USL/LSL）是独立的概念。控制图上同时显示两种限线以便对比。</Note>
        </Section>

        {/* ─── 过程能力分析 ─── */}
        <Section id="page-capability" icon={svgTarget} title="过程能力分析" subtitle="量化评估过程满足规格要求的能力" tag="分析" tagClass={s.tagPurple}>
          <p>过程能力分析页面量化评估生产过程满足产品规格要求的能力，是质量改进的关键决策依据。</p>

          <h3 className={s.h3}>核心指标</h3>
          <table className={s.table}>
            <thead><tr><th>指标</th><th>含义</th><th>解读</th></tr></thead>
            <tbody>
              <tr><td><strong>Cp</strong></td><td>过程潜力指数</td><td>仅考虑过程波动（σ），不考虑偏移。Cp ≥ 1.33 表示过程波动足够小</td></tr>
              <tr><td><strong>Cpk</strong></td><td>过程能力指数</td><td>同时考虑波动和偏移。Cpk ≥ 1.33 为优秀，&lt; 1.0 需改善</td></tr>
              <tr><td><strong>Pp</strong></td><td>整体过程潜力</td><td>使用整体标准差（σ_overall），反映长期能力</td></tr>
              <tr><td><strong>Ppk</strong></td><td>整体过程能力</td><td>长期能力指标，含偏移修正</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>页面元素</h3>
          <ul className={s.bulletList}>
            <li><strong>Sigma 水平仪表盘</strong>：直观展示当前过程的西格玛水平（1σ~6σ+），配套 PPM 缺陷率和合格率</li>
            <li><strong>直方图 + 正态曲线</strong>：展示质量数据的频率分布，叠加正态拟合曲线和规格限标线</li>
            <li><strong>Cpk 历史趋势图</strong>：追踪过程能力指数随时间的变化走势</li>
            <li><strong>单侧规格限支持</strong>：仅有 USL 或仅有 LSL 时自动检测并正确计算</li>
          </ul>

          <Step title="分析方法">
            <ol className={s.stepList}>
              <li>选择品项和指标</li>
              <li>查看 Cpk 仪表盘，快速判断过程能力等级</li>
              <li>查看直方图，判断数据分布是否近似正态</li>
              <li>查看 Cpk 趋势图，判断过程能力是否在改善或恶化</li>
              <li>结合 PPM 缺陷率评估不合格品的风险水平</li>
            </ol>
          </Step>
          <Tip>Cpk ≥ 1.67 对应 4σ 水平（约 63 PPM），是多数乳品企业的目标水平。Cpk &lt; 1.0 对应超过 2700 PPM，需立即采取纠正措施。</Tip>
        </Section>

        {/* ─── 智能预测 ─── */}
        <Section id="page-prediction" icon={svgTrend} title="智能预测" subtitle="时序预测、风险监测与深度分析" tag="分析" tagClass={s.tagPurple}>
          <p>智能预测页面内置多模型预测引擎，提供趋势预测、风险预警和深度分析能力。</p>

          <h3 className={s.h3}>预测模型</h3>
          <table className={s.table}>
            <thead><tr><th>模型</th><th>全称</th><th>适用场景</th></tr></thead>
            <tbody>
              <tr><td><strong>ETS</strong></td><td>指数平滑法</td><td>有趋势和季节性的数据</td></tr>
              <tr><td><strong>ARIMA</strong></td><td>自回归积分移动平均</td><td>平稳或可差分平稳的数据</td></tr>
              <tr><td><strong>MA</strong></td><td>移动平均 + 线性趋势</td><td>简单趋势数据</td></tr>
            </tbody>
          </table>
          <p>系统通过 ADF 平稳性检验自动选择最优模型，以 MASE 指标对比各模型预测精度。预测结果包含点预测值和 95% 置信区间。</p>

          <h3 className={s.h3}>风险监测面板</h3>
          <ul className={s.bulletList}>
            <li><strong>Cpk 滑动窗口</strong>：展示 Cpk 的滑动窗口趋势，提前发现能力下降</li>
            <li><strong>越限概率分析</strong>：四级风险评估 — LOW（低）/ MEDIUM（中）/ HIGH（高）/ CRITICAL（严重）</li>
            <li><strong>CUSUM 漂移检测</strong>：累积和控制图检测过程均值的系统性漂移</li>
          </ul>

          <h3 className={s.h3}>深度分析</h3>
          <ul className={s.bulletList}>
            <li><strong>Pearson 相关性热力图</strong>：展示各指标间的相关系数矩阵</li>
            <li><strong>GBDT 特征重要性</strong>：基于梯度提升树模型，排序各指标对目标指标的影响权重</li>
            <li><strong>Mann-Kendall 趋势检验</strong>：非参数趋势检测，输出趋势方向、p 值和 Sen 斜率</li>
            <li><strong>跨指标预测</strong>：利用指标间相关性进行交叉预测（如脂肪→饱和脂肪酸）</li>
          </ul>

          <Step title="操作步骤">
            <ol className={s.stepList}>
              <li>选择品项和指标</li>
              <li>查看预测曲线和置信区间，了解未来趋势</li>
              <li>查看风险监测面板，评估越限风险等级</li>
              <li>查看相关性分析，发现指标间的关联关系</li>
              <li>结合 Mann-Kendall 检验判断长期趋势是否显著</li>
            </ol>
          </Step>
        </Section>

        {/* ─── 预警中心 ─── */}
        <Section id="page-alerts" icon={svgBell} title="预警中心" subtitle="告警管理与处置" tag="管理" tagClass={s.tagOrange}>
          <p>预警中心统一管理所有质量告警事件，提供告警列表、处置操作和统计分析。</p>

          <h3 className={s.h3}>告警来源与级别</h3>
          <table className={s.table}>
            <thead><tr><th>来源</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><strong>Nelson 规则违规</strong></td><td>SPC 控制图上检测到的判异规则违规</td></tr>
              <tr><td><strong>Cpk 低于阈值</strong></td><td>过程能力指数低于设定的告警阈值</td></tr>
              <tr><td><strong>规格限越限</strong></td><td>检测值超出 USL 或 LSL 规格限</td></tr>
            </tbody>
          </table>
          <table className={s.table}>
            <thead><tr><th>级别</th><th>颜色</th><th>含义</th></tr></thead>
            <tbody>
              <tr><td><strong>CRITICAL</strong></td><td style={{color:'#ef4444',fontWeight:600}}>红色</td><td>严重异常，需立即处理</td></tr>
              <tr><td><strong>WARNING</strong></td><td style={{color:'#f59e0b',fontWeight:600}}>橙色</td><td>警告，需关注并排查</td></tr>
              <tr><td><strong>INFO</strong></td><td style={{color:'#0891b2',fontWeight:600}}>蓝色</td><td>信息提示，供参考</td></tr>
            </tbody>
          </table>

          <h3 className={s.h3}>告警处置</h3>
          <ul className={s.bulletList}>
            <li><strong>确认</strong>：标记告警已处理，数据保留但不再计入待处理数</li>
            <li><strong>作废</strong>：标记告警对应的检测数据为无效数据，该数据不参与后续分析</li>
            <li><strong>批量处置</strong>：勾选多条告警后，可批量确认或作废</li>
          </ul>

          <h3 className={s.h3}>统计图表</h3>
          <ul className={s.bulletList}>
            <li><strong>7 天告警趋势图</strong>：展示近 7 天各类告警的数量变化趋势</li>
            <li><strong>规则类型分布饼图</strong>：展示各 Nelson 规则触发的告警占比</li>
          </ul>

          <Note>系统内置 24 小时去重窗口，同一品项同一指标的相同规则违规在 24 小时内只生成一条告警。新告警通过 WebSocket 实时推送，配合系统通知和声音告警确保及时响应。</Note>
        </Section>

        {/* ─── 修正值管理 ─── */}
        <Section id="page-correction" icon={svgEdit} title="修正值管理" subtitle="按品项/指标设置校准偏移量" tag="管理" tagClass={s.tagOrange}>
          <p>修正值管理页面用于设置检测数据的校准偏移量，补偿仪器系统性偏差。</p>

          <h3 className={s.h3}>功能说明</h3>
          <ul className={s.bulletList}>
            <li>按<strong>品项 × 指标</strong>维度设置修正值</li>
            <li>修正值包含<strong>符号</strong>（+/-）和<strong>数值</strong>两部分</li>
            <li>修正后的数据 = 原始检测值 + 修正值</li>
            <li>修正值对 SPC 分析、过程能力计算、告警判定均生效</li>
          </ul>

          <Step title="操作方法">
            <ol className={s.stepList}>
              <li>使用顶部搜索框筛选目标品项或指标</li>
              <li>使用筛选下拉框选择：已配置 / 未配置 / 全部</li>
              <li>在对应单元格中直接编辑修正值的符号和数值</li>
              <li>修改后自动保存</li>
            </ol>
          </Step>
          <Tip>修正值适用于仪器校准偏差的系统性补偿。例如 FT120 的脂肪检测值系统性偏高 0.02，可设置修正值为 -0.02。</Tip>
        </Section>

        {/* ─── 数据管理 ─── */}
        <Section id="page-data" icon={svgDB} title="数据管理" subtitle="数据浏览、编辑、作废与导出" tag="管理" tagClass={s.tagOrange}>
          <p>数据管理页面提供对所有采集数据的浏览和管理功能。</p>

          <h3 className={s.h3}>数据浏览</h3>
          <ul className={s.bulletList}>
            <li>分页展示，每页 20 条记录</li>
            <li>支持按<strong>日期范围</strong>、<strong>品项</strong>、<strong>指标</strong>筛选</li>
            <li>显示字段：样品编号、品项名称、指标名称、检测值、检测时间、备注</li>
          </ul>

          <h3 className={s.h3}>数据操作</h3>
          <table className={s.table}>
            <thead><tr><th>操作</th><th>说明</th><th>影响</th></tr></thead>
            <tbody>
              <tr><td><strong>编辑修正值</strong></td><td>在数据行内直接编辑修正值</td><td>修正后的值参与所有分析计算</td></tr>
              <tr><td><strong>作废数据</strong></td><td>标记某条数据为无效</td><td>作废数据不参与 SPC、能力、预测分析</td></tr>
              <tr><td><strong>恢复数据</strong></td><td>取消作废标记</td><td>数据恢复参与分析</td></tr>
              <tr><td><strong>CSV 导出</strong></td><td>将当前筛选结果导出为 CSV 文件</td><td>用于离线分析或报告</td></tr>
            </tbody>
          </table>

          <Step title="操作步骤">
            <ol className={s.stepList}>
              <li>设置日期范围和品项/指标筛选条件</li>
              <li>浏览数据列表，翻页查看更多</li>
              <li>如需修正数据，直接在行内编辑修正值</li>
              <li>如需排除异常数据，点击「作废」按钮</li>
              <li>如需导出数据，点击「导出 CSV」按钮</li>
            </ol>
          </Step>
          <Note>作废数据在数据库中仍保留，可通过「恢复」操作撤销。作废的数据不会出现在 SPC 控制图、过程能力计算和预测分析中。</Note>
        </Section>
      </div>
    </div>
  )
}

export default UserGuidePage
