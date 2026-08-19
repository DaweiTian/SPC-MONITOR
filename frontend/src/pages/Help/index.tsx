import React from 'react'
import { Card, Row, Col, Typography } from 'antd'
import {
  QuestionCircleOutlined,
  BookOutlined,
  BarChartOutlined,
} from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

const docCards = [
  {
    title: '数据分析名词手册',
    description: 'SPC 统计过程控制中常用的统计学名词、公式及含义详解',
    href: '/docs/数据分析名词手册.html',
    icon: <BookOutlined style={{ fontSize: 32, color: 'var(--primary)' }} />,
  },
  {
    title: '数据分析名词可视化手册',
    description: '通过图表和可视化示例直观理解数据分析核心概念',
    href: '/docs/数据分析名词可视化手册.html',
    icon: <BarChartOutlined style={{ fontSize: 32, color: 'var(--primary-light)' }} />,
  },
]

const termCards = [
  {
    term: '均值 (Mean)',
    symbol: 'x̄',
    desc: '所有数据的算术平均值，反映数据的中心位置',
  },
  {
    term: '标准差 (σ)',
    symbol: 'σ / s',
    desc: '衡量数据离散程度，σ 越大数据越分散',
  },
  {
    term: '控制限 (UCL/LCL)',
    symbol: 'UCL / LCL',
    desc: '过程处于受控状态时数据波动的合理范围（通常 ±3σ）',
  },
  {
    term: '规格限 (USL/LSL)',
    symbol: 'USL / LSL',
    desc: '客户或工程要求的合格范围上限和下限',
  },
  {
    term: 'Cpk',
    symbol: 'Cpk',
    desc: '过程能力指数，衡量过程满足规格要求的能力，≥1.33 为合格',
  },
  {
    term: 'Nelson规则',
    symbol: 'Rules',
    desc: '8 条判异准则，用于识别控制图中非随机模式和异常',
  },
]

export const HelpPage: React.FC = () => {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <QuestionCircleOutlined />
        帮助中心
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
        {docCards.map((doc) => (
          <Col xs={24} sm={12} key={doc.title}>
            <Card
              hoverable
              onClick={() => window.open(doc.href, '_blank')}
              style={{ height: '100%' }}
            >
              <Card.Meta
                avatar={doc.icon}
                title={doc.title}
                description={doc.description}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Title level={4} style={{ marginBottom: 16 }}>
        常用术语速查
      </Title>
      <Row gutter={[16, 16]}>
        {termCards.map((item) => (
          <Col xs={24} sm={12} md={8} key={item.term}>
            <Card size="small" style={{ height: '100%' }}>
              <Text strong style={{ fontSize: 15, color: 'var(--primary-dark)' }}>
                {item.term}
              </Text>
              <div style={{ margin: '4px 0 8px' }}>
                <Text code>{item.symbol}</Text>
              </div>
              <Paragraph style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                {item.desc}
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
