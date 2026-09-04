# Frontend Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance spc-monitor frontend with sticky header, help documentation, data management page, config improvements, and consistent styling.

**Architecture:** Port proven patterns from yili-lims-data-model (Vue/Element Plus) to React/Ant Design. Add new pages and components while maintaining existing functionality. CSS variables for consistent theming.

**Tech Stack:** React 18, TypeScript, Ant Design 5, ECharts 5, CSS Variables

## Global Constraints

- All UI text in Chinese (zh-CN)
- Use Ant Design components (not custom CSS for standard UI patterns)
- Follow existing file structure: `src/pages/<Name>/index.tsx`, `src/components/<Name>/index.tsx`
- Backend APIs already exist - frontend only, no backend changes
- Preserve all existing functionality (Dashboard, SPC, Capability, Alerts, Config)

---

### Task 1: Sticky Header & CSS Variables Foundation

**Covers:** S1, S5

**Files:**
- Modify: `frontend/src/components/Layout/index.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: CSS variables available globally, sticky Header component

- [ ] **Step 1: Add CSS variables to index.css**

Replace `frontend/src/index.css` with:

```css
:root {
  --primary-dark: #003D7A;
  --primary: #0066CC;
  --primary-light: #00A3E0;
  --primary-bg: #E8F4FD;
  --success: #27AE60;
  --warning: #F39C12;
  --danger: #E74C3C;
  --info: #5D6D7E;
  --text-primary: #1e293b;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --bg-page: #f0f2f5;
  --bg-card: #ffffff;
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--text-primary);
  background: var(--bg-page);
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
}
```

- [ ] **Step 2: Make Header sticky in Layout component**

Update `frontend/src/components/Layout/index.tsx`:

```tsx
import React from 'react'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined,
  LineChartOutlined,
  AlertOutlined,
  SettingOutlined,
  AreaChartOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Header, Sider, Content } = Layout

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '实时看板' },
    { key: '/spc', icon: <LineChartOutlined />, label: 'SPC 控制图' },
    { key: '/capability', icon: <AreaChartOutlined />, label: '过程能力' },
    { key: '/alerts', icon: <AlertOutlined />, label: '预警列表' },
    { key: '/data', icon: <DatabaseOutlined />, label: '数据管理' },
    { key: '/config', icon: <SettingOutlined />, label: '配置管理' },
    { key: '/help', icon: <QuestionCircleOutlined />, label: '帮助中心' },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'linear-gradient(90deg, var(--primary-dark), var(--primary))',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          height: 64,
        }}
      >
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>
          液奶过程监控系统
        </div>
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Content style={{ padding: 24, background: 'var(--bg-page)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
```

- [ ] **Step 3: Verify sticky behavior**

Run dev server and verify:
1. `cd frontend && npm run dev`
2. Open browser, navigate to any page with scrollable content
3. Scroll down - header should remain visible at top
4. Sidebar menu should show correct active state for current route

- [ ] **Step 4: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/src/index.css frontend/src/components/Layout/index.tsx
git commit -m "feat: add sticky header and CSS variables foundation"
```

---

### Task 2: HelpTooltip Component

**Covers:** S2

**Files:**
- Create: `frontend/src/components/HelpTooltip/index.tsx`

**Interfaces:**
- Consumes: None
- Produces: `HelpTooltip` component with `termId`, `placement`, `width`, `size` props

- [ ] **Step 1: Create HelpTooltip component**

Create `frontend/src/components/HelpTooltip/index.tsx`:

```tsx
import React from 'react'
import { Popover, Tag, Button } from 'antd'
import { QuestionCircleOutlined, InfoCircleOutlined, ArrowRightOutlined } from '@ant-design/icons'

interface HelpData {
  title: string
  tag: string
  tagColor: string
  description: string
  formula?: string
  example?: string
  note?: string
}

const helpContentMap: Record<string, HelpData> = {
  // Basic Statistics
  mean: {
    title: '均值（Mean / μ）',
    tag: '基础',
    tagColor: 'blue',
    description: '全部数据的算术平均值，反映数据的集中趋势。在SPC中作为控制图的中心线（CL）。',
    formula: 'x̄ = Σxᵢ / n',
    example: '31108条灭菌乳数据中，蛋白质均值 = 3.32%',
    note: '均值对极端值敏感，常与中位数对比判断数据偏态'
  },
  std: {
    title: '标准差（Standard Deviation / σ）',
    tag: '基础',
    tagColor: 'blue',
    description: '衡量数据偏离均值的离散程度。标准差越大，数据波动越剧烈。',
    formula: 's = √[ Σ(xᵢ - x̄)² / (n - 1) ]',
    example: 'SPC控制限的宽度由标准差决定',
    note: '平台使用样本标准差（ddof=1），更保守'
  },
  'moving-range': {
    title: '移动极差（Moving Range / MR）',
    tag: '基础',
    tagColor: 'blue',
    description: '相邻两个数据点之差的绝对值。用于估计短期过程波动。',
    formula: 'MRᵢ = |xᵢ - xᵢ₋₁|',
    example: 'I-MR控制图中用于计算控制限宽度的核心统计量'
  },
  // SPC Core
  'spc-concept': {
    title: 'SPC（统计过程控制）',
    tag: '核心',
    tagColor: 'orange',
    description: '利用统计方法对生产过程进行实时监控，区分正常波动和异常波动。',
    note: 'SPC是"监控过程"→在趋势偏离初期就预警，避免产生次品'
  },
  'control-limits': {
    title: '控制限（UCL / CL / LCL）',
    tag: '核心',
    tagColor: 'orange',
    description: '控制图的三条关键水平线，基于过程自身数据计算。',
    formula: 'UCL = x̄ + 2.66 × MR̄，LCL = x̄ - 2.66 × MR̄',
    note: '控制限是过程告诉你的，规格限是标准告诉你的'
  },
  'spec-vs-control': {
    title: '规格限 vs 控制限',
    tag: '易混',
    tagColor: 'orange',
    description: '规格限来自外部标准，控制限来自过程数据。两者本质不同。',
    example: '脂肪规格限：≥3.0%（国标）；控制限：UCL=3.99, LCL=3.89（过程实际波动）'
  },
  // I-MR Chart
  'imr-overview': {
    title: 'I-MR 控制图',
    tag: '核心',
    tagColor: 'blue',
    description: '由两张图上下排列组成的控制图，适用于每次检测只有1个数据值的场景。',
    formula: 'I图：x̄ ± 2.66×MR̄；MR图：[0, 3.267×MR̄]',
    note: '液奶检验数据通常是每个批次一个检测值，因此选用I-MR图'
  },
  // Nelson Rules
  'nelson-r1': {
    title: '规则1：1个点超出3σ控制限',
    tag: 'CRITICAL',
    tagColor: 'red',
    description: '任何一个数据点落在UCL之上或LCL之下。最经典的失控信号。',
    formula: '条件：xᵢ > UCL 或 xᵢ < LCL',
    note: '概率仅0.27%，可能原因：原料突变、设备故障'
  },
  'nelson-r2': {
    title: '规则2：连续9个点在中心线同一侧',
    tag: 'CRITICAL',
    tagColor: 'red',
    description: '连续9个点全部高于或低于中心线，表明过程均值发生系统性偏移。',
    formula: '条件：连续9个xᵢ全部 > CL 或全部 < CL',
    note: '可能原因：原料供应商更换、配方调整'
  },
  // Process Capability
  cp: {
    title: 'Cp（过程能力指数）',
    tag: '核心',
    tagColor: 'green',
    description: '衡量过程潜在能力——如果过程均值恰好对准规格中心，过程能达到多好的能力。',
    formula: 'Cp = (USL - LSL) / (6σ)',
    example: 'Cp=1表示规格限恰好等于±3σ；Cp=2表示规格宽度是过程宽度的2倍',
    note: 'Cp不考虑均值偏移，是理论上的最佳能力'
  },
  cpk: {
    title: 'Cpk（过程能力指数，考虑偏移）',
    tag: '核心',
    tagColor: 'green',
    description: '衡量过程实际能力——考虑了均值偏离规格中心的影响。',
    formula: 'Cpk = min(Cpl, Cpu) = min((μ - LSL) / (3σ), (USL - μ) / (3σ))',
    example: 'Cpk < 1.33触发WARNING预警，1.33是工业界普遍认可的最低门槛',
    note: 'Cpk ≤ Cp，当均值恰好对准规格中心时Cpk = Cp'
  },
  'spec-limits': {
    title: '规格限（USL / LSL / T）',
    tag: '过程能力',
    tagColor: 'green',
    description: '产品标准或客户要求规定的质量指标允许范围。',
    example: '蛋白质：USL=3.6, LSL=2.9, T=3.2 g/100g',
    note: '规格限与过程的统计特性无关，是外部设定的标准'
  },
}

interface HelpTooltipProps {
  termId: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  width?: number
  size?: 'small' | 'middle' | 'large'
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({
  termId,
  placement = 'top',
  width = 320,
  size = 'small'
}) => {
  const helpData = helpContentMap[termId] || {
    title: termId,
    tag: '未知',
    tagColor: 'default',
    description: '暂无帮助信息'
  }

  const content = (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{helpData.title}</span>
        <Tag color={helpData.tagColor}>{helpData.tag}</Tag>
      </div>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{helpData.description}</p>
        {helpData.formula && (
          <div style={{ background: '#f8fafc', borderLeft: '3px solid #2563eb', padding: '10px 12px', borderRadius: '0 6px 6px 0', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>公式</div>
            <div style={{ fontFamily: "'Cambria Math', 'STIX', serif", fontSize: 14, color: 'var(--text-primary)' }}>{helpData.formula}</div>
          </div>
        )}
        {helpData.example && (
          <div style={{ background: '#f0fdf4', borderLeft: '3px solid #16a34a', padding: '10px 12px', borderRadius: '0 6px 6px 0', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>示例</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{helpData.example}</div>
          </div>
        )}
        {helpData.note && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#64748b', background: '#fffbeb', padding: '10px 12px', borderRadius: 6, border: '1px solid #fde68a' }}>
            <InfoCircleOutlined style={{ color: '#d97706', marginTop: 2, flexShrink: 0 }} />
            <span>{helpData.note}</span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      placement={placement}
      overlayStyle={{ maxWidth: 400, width }}
    >
      <Button
        type="text"
        size={size}
        icon={<QuestionCircleOutlined />}
        style={{ marginLeft: 4, color: '#94a3b8' }}
      />
    </Popover>
  )
}

export default HelpTooltip
```

- [ ] **Step 2: Verify component renders**

Run dev server and import HelpTooltip in any page to verify it renders correctly:
1. Add temporary import in Dashboard: `import HelpTooltip from '../components/HelpTooltip'`
2. Add `<HelpTooltip termId="spc-concept" />` next to page title
3. Click the button - popover should appear with SPC definition

- [ ] **Step 3: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/src/components/HelpTooltip/index.tsx
git commit -m "feat: add HelpTooltip component with 30+ term definitions"
```

---

### Task 3: Help Center Page

**Covers:** S2

**Files:**
- Create: `frontend/src/pages/Help/index.tsx`
- Modify: `frontend/src/App.tsx`
- Copy: HTML docs from yili-lims-data-model to `frontend/public/docs/`

**Interfaces:**
- Consumes: None
- Produces: `/help` route, HelpCenter page

- [ ] **Step 1: Copy HTML documentation files**

```bash
mkdir -p /home/erribaba/git-workstation/spc-monitor/frontend/public/docs
cp /home/erribaba/git-workstation/yili-lims-data-model/frontend/public/docs/*.html /home/erribaba/git-workstation/spc-monitor/frontend/public/docs/
```

- [ ] **Step 2: Create Help page**

Create `frontend/src/pages/Help/index.tsx`:

```tsx
import React from 'react'
import { Card, Row, Col, Typography } from 'antd'
import { BookOutlined, BarChartOutlined, QuestionCircleOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

const HelpPage: React.FC = () => {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <QuestionCircleOutlined style={{ marginRight: 8 }} />
        帮助中心
      </Title>

      <Paragraph style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        本系统提供专业的SPC统计过程控制分析功能。以下是相关文档和术语说明，帮助您理解各项指标的含义和计算方法。
      </Paragraph>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={12}>
          <Card
            hoverable
            onClick={() => window.open('/docs/数据分析名词手册.html', '_blank')}
            style={{ height: '100%' }}
          >
            <Card.Meta
              avatar={<BookOutlined style={{ fontSize: 32, color: 'var(--primary)' }} />}
              title="数据分析名词手册"
              description="详细的数据分析术语解释，包含公式推导和计算示例。涵盖均值、标准差、控制图、过程能力等核心概念。"
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            hoverable
            onClick={() => window.open('/docs/数据分析名词可视化手册.html', '_blank')}
            style={{ height: '100%' }}
          >
            <Card.Meta
              avatar={<BarChartOutlined style={{ fontSize: 32, color: 'var(--success)' }} />}
              title="数据分析名词可视化手册"
              description="30+核心概念的可视化说明，包含图表、示意图和交互式演示。直观理解SPC、Nelson规则、过程能力等。"
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }}>
        <Title level={4}>常用术语速查</Title>
        <Row gutter={[16, 16]}>
          {[
            { term: '均值 (Mean)', desc: '数据的算术平均值' },
            { term: '标准差 (σ)', desc: '数据离散程度的度量' },
            { term: '控制限 (UCL/LCL)', desc: '过程正常波动的边界' },
            { term: '规格限 (USL/LSL)', desc: '产品标准的要求范围' },
            { term: 'Cpk', desc: '过程能力指数（考虑偏移）' },
            { term: 'Nelson规则', desc: '判断过程失控的8条规则' },
          ].map((item, idx) => (
            <Col xs={12} md={8} key={idx}>
              <Card size="small" style={{ background: 'var(--primary-bg)' }}>
                <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: 4 }}>{item.term}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )
}

export default HelpPage
```

- [ ] **Step 3: Add /help route to App.tsx**

Update `frontend/src/App.tsx` to include Help route:

```tsx
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SPCPage from './pages/SPC'
import CapabilityPage from './pages/Capability'
import AlertsPage from './pages/Alerts'
import ConfigPage from './pages/Config'
import DataPage from './pages/Data'
import HelpPage from './pages/Help'

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/spc" element={<SPCPage />} />
          <Route path="/capability" element={<CapabilityPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 4: Verify help page loads**

Run dev server and verify:
1. Navigate to `/help`
2. Both documentation cards should be clickable
3. Clicking opens HTML docs in new tab
4. Terms quick-reference section displays correctly

- [ ] **Step 5: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/public/docs/ frontend/src/pages/Help/index.tsx frontend/src/App.tsx
git commit -m "feat: add help center page with documentation links"
```

---

### Task 4: Data Management Page

**Covers:** S3

**Files:**
- Create: `frontend/src/pages/Data/index.tsx`

**Interfaces:**
- Consumes: `api.getRecentData()`, `api.getProducts()`, `api.getIndicators()` from `services/api.ts`
- Produces: `/data` route, DataPage component

- [ ] **Step 1: Create Data Management page**

Create `frontend/src/pages/Data/index.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import { Card, Table, Select, Button, Space, Typography, Statistic, Row, Col, Tag } from 'antd'
import { DatabaseOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons'
import { api } from '../../services'

const { Title } = Typography

interface MonitorData {
  id: number
  sample_time: string
  product_code: string
  indicator_code: string
  test_value: number
}

const DataPage: React.FC = () => {
  const [data, setData] = useState<MonitorData[]>([])
  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<string[]>([])
  const [indicators, setIndicators] = useState<string[]>([])
  const [filter, setFilter] = useState({
    product_code: undefined as string | undefined,
    indicator_code: undefined as string | undefined,
    limit: 100
  })

  useEffect(() => {
    loadOptions()
  }, [])

  useEffect(() => {
    loadData()
  }, [filter])

  const loadOptions = async () => {
    try {
      const [productsRes, indicatorsRes] = await Promise.all([
        api.getProducts(),
        api.getIndicators()
      ])
      setProducts(productsRes.data || [])
      setIndicators(indicatorsRes.data || [])
    } catch (err) {
      console.error('Failed to load options:', err)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.getRecentData(filter)
      setData(res.data || [])
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'sample_time',
      key: 'sample_time',
      width: 180,
      render: (text: string) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '产品代码',
      dataIndex: 'product_code',
      key: 'product_code',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '指标代码',
      dataIndex: 'indicator_code',
      key: 'indicator_code',
      width: 120,
      render: (text: string) => <Tag color="green">{text}</Tag>
    },
    {
      title: '检测值',
      dataIndex: 'test_value',
      key: 'test_value',
      width: 120,
      render: (val: number) => val?.toFixed(4) ?? '-'
    }
  ]

  const uniqueProducts = [...new Set(data.map(d => d.product_code))]
  const uniqueIndicators = [...new Set(data.map(d => d.indicator_code))]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        数据管理
      </Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="数据总量" value={data.length} suffix="条" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="产品种类" value={uniqueProducts.length} suffix="种" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="指标种类" value={uniqueIndicators.length} suffix="项" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="最新数据"
              value={data.length > 0 ? new Date(data[0].sample_time).toLocaleTimeString('zh-CN') : '-'}
              valueStyle={{ fontSize: 16 }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16 }}>
          <FilterOutlined />
          <Select
            placeholder="产品筛选"
            allowClear
            style={{ width: 150 }}
            value={filter.product_code}
            onChange={(val) => setFilter({ ...filter, product_code: val })}
            options={products.map(p => ({ label: p, value: p }))}
          />
          <Select
            placeholder="指标筛选"
            allowClear
            style={{ width: 150 }}
            value={filter.indicator_code}
            onChange={(val) => setFilter({ ...filter, indicator_code: val })}
            options={indicators.map(i => ({ label: i, value: i }))}
          />
          <Select
            style={{ width: 100 }}
            value={filter.limit}
            onChange={(val) => setFilter({ ...filter, limit: val })}
            options={[
              { label: '50条', value: 50 },
              { label: '100条', value: 100 },
              { label: '200条', value: 200 },
              { label: '500条', value: 500 }
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  )
}

export default DataPage
```

- [ ] **Step 2: Add /data route to App.tsx**

Update `frontend/src/App.tsx` to import and route DataPage:

```tsx
import DataPage from './pages/Data'

// In Routes:
<Route path="/data" element={<DataPage />} />
```

- [ ] **Step 3: Verify data page**

Run dev server and verify:
1. Navigate to `/data`
2. Statistics cards show counts
3. Filter dropdowns populate with products/indicators
4. Table displays data with pagination
5. Filters work correctly

- [ ] **Step 4: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/src/pages/Data/index.tsx frontend/src/App.tsx
git commit -m "feat: add data management page with filters and statistics"
```

---

### Task 5: Config Page Enhancement

**Covers:** S4

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx`

**Interfaces:**
- Consumes: `api.exploreDBStructure()`, `api.getTableColumns()`, `api.getFieldMapping()`, `api.updateFieldMapping()` from `services/api.ts`
- Produces: Complete Config page with field mapping UI

- [ ] **Step 1: Enhance Config page with field mapping**

Update `frontend/src/pages/Config/index.tsx` to add field mapping section:

```tsx
import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Select, Switch, Button, InputNumber, Typography, Space, message, Table, Tag, Divider, Alert } from 'antd'
import { SettingOutlined, DatabaseOutlined, ExperimentOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { api } from '../../services'

const { Title, Paragraph } = Typography

const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState<any>({})
  const [dbConfig, setDbConfig] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [tables, setTables] = useState<any[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [columns, setColumns] = useState<any[]>([])
  const [fieldMapping, setFieldMapping] = useState<any>({})
  const [exploring, setExploring] = useState(false)

  useEffect(() => {
    loadConfig()
    loadFieldMapping()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const [configRes, dbRes] = await Promise.all([
        api.getConfig(),
        api.getDBConfig()
      ])
      setConfig(configRes.data || {})
      setDbConfig(dbRes.data || {})
    } catch (err) {
      message.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFieldMapping = async () => {
    try {
      const res = await api.getFieldMapping()
      setFieldMapping(res.data || {})
    } catch (err) {
      console.error('Failed to load field mapping:', err)
    }
  }

  const testConnection = async () => {
    try {
      const res = await api.testDBConnection()
      setTestResult(res.data)
      message.success('连接测试成功')
    } catch (err) {
      message.error('连接测试失败')
    }
  }

  const exploreDB = async () => {
    setExploring(true)
    try {
      const res = await api.exploreDBStructure()
      setTables(res.data?.tables || [])
      message.success(`发现 ${res.data?.tables?.length || 0} 个表`)
    } catch (err) {
      message.error('探索数据库失败')
    } finally {
      setExploring(false)
    }
  }

  const loadTableColumns = async (tableName: string) => {
    setSelectedTable(tableName)
    try {
      const res = await api.getTableColumns(tableName)
      setColumns(res.data || [])
    } catch (err) {
      message.error('加载表结构失败')
    }
  }

  const saveDBConfig = async () => {
    try {
      await api.saveDBConfig(dbConfig)
      message.success('数据库配置已保存')
    } catch (err) {
      message.error('保存失败')
    }
  }

  const saveConfig = async () => {
    try {
      await api.updateConfig(config)
      message.success('系统配置已保存')
    } catch (err) {
      message.error('保存失败')
    }
  }

  const saveFieldMapping = async () => {
    try {
      await api.updateFieldMapping(fieldMapping)
      message.success('字段映射已保存')
    } catch (err) {
      message.error('保存失败')
    }
  }

  const nelsonRules = [
    { rule: '规则1', desc: '1个点超出3σ控制限', severity: 'CRITICAL' },
    { rule: '规则2', desc: '连续9个点在中心线同一侧', severity: 'CRITICAL' },
    { rule: '规则3', desc: '连续6个点持续递增或递减', severity: 'WARNING' },
    { rule: '规则4', desc: '连续14个点交替上下', severity: 'WARNING' },
    { rule: '规则5', desc: '连续3点中有2点在A区或以外', severity: 'WARNING' },
    { rule: '规则6', desc: '连续5点中有4点在B区或以外', severity: 'WARNING' },
    { rule: '规则7', desc: '连续15个点在C区（中心线附近）', severity: 'INFO' },
    { rule: '规则8', desc: '连续8点在C区以外（两侧都有）', severity: 'INFO' },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>
        <SettingOutlined style={{ marginRight: 8 }} />
        配置管理
      </Title>

      {/* Database Connection Config */}
      <Card title={<><DatabaseOutlined /> 数据库连接配置</>} style={{ marginBottom: 24 }}>
        <Form layout="vertical">
          <Form.Item label="启用状态">
            <Switch
              checked={dbConfig.enabled}
              onChange={(val) => setDbConfig({ ...dbConfig, enabled: val })}
            />
          </Form.Item>
          <Form.Item label="数据源类型">
            <Select
              value={dbConfig.source_type || 'sqlserver'}
              options={[{ label: 'SQL Server', value: 'sqlserver' }]}
              disabled
            />
          </Form.Item>
          <Form.Item label="认证方式">
            <Select
              value={dbConfig.auth_type || 'windows'}
              onChange={(val) => setDbConfig({ ...dbConfig, auth_type: val })}
              options={[
                { label: 'Windows 集成认证', value: 'windows' },
                { label: 'SQL Server 认证', value: 'sql' }
              ]}
            />
          </Form.Item>
          {dbConfig.auth_type === 'sql' && (
            <>
              <Form.Item label="用户名">
                <Input
                  value={dbConfig.username}
                  onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                  placeholder="sa"
                />
              </Form.Item>
              <Form.Item label="密码">
                <Input.Password
                  value={dbConfig.password}
                  onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                  placeholder="请输入密码"
                />
              </Form.Item>
            </>
          )}
          <Form.Item label="服务器地址">
            <Input
              value={dbConfig.server}
              onChange={(e) => setDbConfig({ ...dbConfig, server: e.target.value })}
              placeholder="localhost"
            />
          </Form.Item>
          <Form.Item label="数据库名称">
            <Input
              value={dbConfig.database}
              onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
              placeholder="lims_db"
            />
          </Form.Item>
          <Form.Item label="ODBC驱动">
            <Input
              value={dbConfig.driver || 'ODBC Driver 17 for SQL Server'}
              onChange={(e) => setDbConfig({ ...dbConfig, driver: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="连接超时（秒）">
            <InputNumber
              value={dbConfig.timeout || 10}
              onChange={(val) => setDbConfig({ ...dbConfig, timeout: val })}
              min={5}
              max={60}
            />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={testConnection}>测试连接</Button>
            <Button onClick={exploreDB} loading={exploring}>探索数据库</Button>
            <Button icon={<SaveOutlined />} onClick={saveDBConfig}>保存配置</Button>
          </Space>
        </Form>

        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            message={testResult.success ? '连接成功' : '连接失败'}
            description={testResult.message}
            style={{ marginTop: 16 }}
            closable
          />
        )}
      </Card>

      {/* Database Table Structure */}
      {tables.length > 0 && (
        <Card title={<><ExperimentOutlined /> 数据库表结构</>} style={{ marginBottom: 24 }}>
          <Form.Item label="选择表">
            <Select
              style={{ width: 300 }}
              placeholder="选择要查看的表"
              value={selectedTable || undefined}
              onChange={loadTableColumns}
              options={tables.map(t => ({ label: `${t.name} (${t.row_count}行)`, value: t.name }))}
            />
          </Form.Item>

          {columns.length > 0 && (
            <Table
              dataSource={columns}
              rowKey="name"
              pagination={false}
              size="small"
              columns={[
                { title: '列名', dataIndex: 'name', key: 'name' },
                { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag>{t}</Tag> },
                { title: '可空', dataIndex: 'nullable', key: 'nullable', render: (v: boolean) => v ? '是' : '否' },
                { title: '默认值', dataIndex: 'default', key: 'default', render: (v: string) => v || '-' },
                { title: '示例值', dataIndex: 'sample_value', key: 'sample_value', render: (v: string) => v || '-' },
              ]}
            />
          )}

          <Divider />

          <Title level={5}>字段映射配置</Title>
          <Paragraph type="secondary">
            将数据库表字段映射到系统字段，用于数据采集。
          </Paragraph>
          <Form layout="vertical">
            <Form.Item label="时间字段">
              <Input
                value={fieldMapping.time_column}
                onChange={(e) => setFieldMapping({ ...fieldMapping, time_column: e.target.value })}
                placeholder="例如: CreateDate"
              />
            </Form.Item>
            <Form.Item label="产品字段">
              <Input
                value={fieldMapping.product_column}
                onChange={(e) => setFieldMapping({ ...fieldMapping, product_column: e.target.value })}
                placeholder="例如: ProductCode"
              />
            </Form.Item>
            <Form.Item label="样本字段">
              <Input
                value={fieldMapping.sample_column}
                onChange={(e) => setFieldMapping({ ...fieldMapping, sample_column: e.target.value })}
                placeholder="例如: SampleID"
              />
            </Form.Item>
            <Button icon={<SaveOutlined />} onClick={saveFieldMapping} type="primary">保存字段映射</Button>
          </Form>
        </Card>
      )}

      {/* Collection Config */}
      <Card title={<><ThunderboltOutlined /> 采集配置</>} style={{ marginBottom: 24 }}>
        <Form layout="vertical">
          <Form.Item label="默认采集频率（分钟）">
            <InputNumber
              value={config.default_frequency_minutes || 5}
              onChange={(val) => setConfig({ ...config, default_frequency_minutes: val })}
              min={1}
              max={60}
            />
          </Form.Item>
          <Form.Item label="SPC窗口大小">
            <InputNumber
              value={config.spc_window_size || 30}
              onChange={(val) => setConfig({ ...config, spc_window_size: val })}
              min={10}
              max={200}
            />
          </Form.Item>
          <Form.Item label="Cpk最低阈值">
            <InputNumber
              value={config.cpk_min_threshold || 1.33}
              onChange={(val) => setConfig({ ...config, cpk_min_threshold: val })}
              min={0.5}
              max={2.0}
              step={0.1}
            />
          </Form.Item>
          <Form.Item label="预警声音">
            <Switch
              checked={config.alert_sound_enabled}
              onChange={(val) => setConfig({ ...config, alert_sound_enabled: val })}
            />
          </Form.Item>
          <Button type="primary" icon={<SaveOutlined />} onClick={saveConfig}>保存配置</Button>
        </Form>
      </Card>

      {/* Nelson Rules Reference */}
      <Card title="Nelson 规则参考">
        <Table
          dataSource={nelsonRules}
          rowKey="rule"
          pagination={false}
          columns={[
            { title: '规则', dataIndex: 'rule', key: 'rule', width: 100 },
            { title: '描述', dataIndex: 'desc', key: 'desc' },
            {
              title: '严重程度',
              dataIndex: 'severity',
              key: 'severity',
              width: 120,
              render: (s: string) => (
                <Tag color={s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'orange' : 'blue'}>{s}</Tag>
              )
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default ConfigPage
```

- [ ] **Step 2: Verify config page**

Run dev server and verify:
1. Navigate to `/config`
2. Database config form shows all fields
3. "探索数据库" button works (if DB connected)
4. Field mapping section appears after exploring
5. Nelson rules reference table displays

- [ ] **Step 3: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: enhance config page with field mapping and Nelson rules"
```

---

### Task 6: Add HelpTooltip to Existing Pages

**Covers:** S2

**Files:**
- Modify: `frontend/src/pages/SPC/index.tsx`
- Modify: `frontend/src/pages/Capability/index.tsx`
- Modify: `frontend/src/pages/Dashboard/index.tsx`

**Interfaces:**
- Consumes: `HelpTooltip` component from Task 2
- Produces: Contextual help buttons on page titles

- [ ] **Step 1: Add HelpTooltip to SPC page**

Update `frontend/src/pages/SPC/index.tsx` - add import and button next to title:

```tsx
import HelpTooltip from '../../components/HelpTooltip'

// In JSX, update the Title section:
<Title level={3} style={{ marginBottom: 24 }}>
  <LineChartOutlined style={{ marginRight: 8 }} />
  SPC 控制图
  <HelpTooltip termId="spc-concept" placement="right" />
</Title>
```

- [ ] **Step 2: Add HelpTooltip to Capability page**

Update `frontend/src/pages/Capability/index.tsx`:

```tsx
import HelpTooltip from '../../components/HelpTooltip'

// In JSX:
<Title level={3} style={{ marginBottom: 24 }}>
  <AreaChartOutlined style={{ marginRight: 8 }} />
  过程能力分析
  <HelpTooltip termId="cp" placement="right" />
</Title>
```

- [ ] **Step 3: Add HelpTooltip to Dashboard**

Update `frontend/src/pages/Dashboard/index.tsx`:

```tsx
import HelpTooltip from '../../components/HelpTooltip'

// In JSX:
<Title level={3} style={{ marginBottom: 24 }}>
  <DashboardOutlined style={{ marginRight: 8 }} />
  实时看板
  <HelpTooltip termId="spc-concept" placement="right" />
</Title>
```

- [ ] **Step 4: Verify help buttons**

Run dev server and verify:
1. Each page title has a `?` button
2. Clicking shows appropriate help content
3. SPC page shows SPC concept help
4. Capability page shows Cp help
5. Dashboard shows SPC concept help

- [ ] **Step 5: Commit**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add frontend/src/pages/SPC/index.tsx frontend/src/pages/Capability/index.tsx frontend/src/pages/Dashboard/index.tsx
git commit -m "feat: add HelpTooltip to SPC, Capability, and Dashboard pages"
```

---

### Task 7: Final Verification & Integration

**Covers:** S1-S5

**Files:**
- None (verification only)

**Interfaces:**
- All previous tasks

- [ ] **Step 1: Run full build check**

```bash
cd /home/erribaba/git-workstation/spc-monitor/frontend
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Run dev server and test all pages**

```bash
cd /home/erribaba/git-workstation/spc-monitor/frontend
npm run dev
```

Test checklist:
- [ ] Header is sticky (stays visible when scrolling)
- [ ] `/dashboard` loads with help tooltip
- [ ] `/spc` loads with help tooltip and ECharts
- [ ] `/capability` loads with help tooltip
- [ ] `/alerts` loads with alert table
- [ ] `/data` loads with data table and filters
- [ ] `/config` loads with all sections
- [ ] `/help` loads with documentation links
- [ ] Sidebar shows all 7 menu items with correct icons
- [ ] Navigation between pages works
- [ ] CSS variables apply consistently

- [ ] **Step 3: Commit final state**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git status
# If any uncommitted changes:
git add -A
git commit -m "feat: complete frontend enhancement with sticky header, help docs, data management, config improvements"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Sticky header + CSS variables | Layout/index.tsx, index.css |
| 2 | HelpTooltip component | components/HelpTooltip/index.tsx |
| 3 | Help center page | pages/Help/index.tsx, App.tsx, public/docs/ |
| 4 | Data management page | pages/Data/index.tsx, App.tsx |
| 5 | Config page enhancement | pages/Config/index.tsx |
| 6 | Add HelpTooltip to pages | SPC, Capability, Dashboard pages |
| 7 | Final verification | Build check, integration test |
