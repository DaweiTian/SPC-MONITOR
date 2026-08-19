import React, { useState, useEffect } from 'react'
import { Card, Table, Select, Button, Statistic, Row, Col, Tag, Typography } from 'antd'
import { DatabaseOutlined, ReloadOutlined } from '@ant-design/icons'
import { api } from '../../services'
import type { MonitorData, Product, Indicator } from '../../types'

const { Title } = Typography

export const DataPage: React.FC = () => {
  const [data, setData] = useState<MonitorData[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: '',
    limit: 100,
  })

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [prodData, indData] = await Promise.all([
          api.getProducts(),
          api.getIndicators(),
        ])
        setProducts(prodData.products)
        setIndicators(indData.indicators)
        if (prodData.products.length > 0) {
          setFilter(prev => ({ ...prev, product_code: prodData.products[0].code }))
        }
        if (indData.indicators.length > 0) {
          setFilter(prev => ({ ...prev, indicator_code: indData.indicators[0].code }))
        }
      } catch (e) {
        console.error('获取选项失败:', e)
      }
    }
    fetchOptions()
  }, [])

  const fetchData = async () => {
    if (!filter.product_code || !filter.indicator_code) return
    setLoading(true)
    try {
      const result = await api.getRecentData({
        product_code: filter.product_code,
        indicator_code: filter.indicator_code,
        limit: filter.limit,
      })
      setData(Array.isArray(result) ? result : result.data || [])
    } catch (e) {
      console.error('获取数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (filter.product_code && filter.indicator_code) {
      fetchData()
    }
  }, [filter.product_code, filter.indicator_code, filter.limit])

  const uniqueProducts = new Set(data.map(d => d.product_code)).size
  const uniqueIndicators = new Set(data.map(d => d.indicator_code)).size
  const latestTime = data.length > 0
    ? new Date(data[0].sample_time).toLocaleString('zh-CN')
    : '-'

  const columns = [
    {
      title: '时间',
      dataIndex: 'sample_time',
      key: 'sample_time',
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
    },
    {
      title: '产品代码',
      dataIndex: 'product_code',
      key: 'product_code',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: '指标代码',
      dataIndex: 'indicator_code',
      key: 'indicator_code',
      render: (code: string) => <Tag color="green">{code}</Tag>,
    },
    {
      title: '检测值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number) => value?.toFixed(4),
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        数据管理
      </Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="数据总量" value={data.length} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="产品种类" value={uniqueProducts} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="指标种类" value={uniqueIndicators} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="最新数据" value={latestTime} valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 24 }}>
        <Select
          value={filter.product_code || undefined}
          onChange={value => setFilter({ ...filter, product_code: value })}
          style={{ width: 160, marginRight: 16 }}
          placeholder="选择产品"
        >
          {products.map(p => (
            <Select.Option key={p.code} value={p.code}>{p.name}</Select.Option>
          ))}
        </Select>
        <Select
          value={filter.indicator_code || undefined}
          onChange={value => setFilter({ ...filter, indicator_code: value })}
          style={{ width: 160, marginRight: 16 }}
          placeholder="选择指标"
        >
          {indicators.map(i => (
            <Select.Option key={i.code} value={i.code}>{i.name}</Select.Option>
          ))}
        </Select>
        <Select
          value={filter.limit}
          onChange={value => setFilter({ ...filter, limit: value })}
          style={{ width: 120, marginRight: 16 }}
        >
          <Select.Option value={50}>50 条</Select.Option>
          <Select.Option value={100}>100 条</Select.Option>
          <Select.Option value={200}>200 条</Select.Option>
          <Select.Option value={500}>500 条</Select.Option>
        </Select>
        <Button type="primary" icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          刷新
        </Button>
      </Card>

      <Card title="数据列表">
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条数据`,
          }}
        />
      </Card>
    </div>
  )
}
