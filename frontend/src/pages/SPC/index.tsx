import React, { useState, useEffect, useRef } from 'react'
import { Card, Select, Button, Table, Tag, InputNumber, Form, Row, Col } from 'antd'
import * as echarts from 'echarts'
import { api } from '../../services'
import type { SPCData, Product, Indicator } from '../../types'
import HelpTooltip from '../../components/HelpTooltip'

export const SPCPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [spcData, setSPCData] = useState<SPCData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    product_code: 'P001',
    indicator_code: 'fat',
    window: 30,
  })
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const fetchOptions = async () => {
      const [prodData, indData] = await Promise.all([
        api.getProducts(),
        api.getIndicators(),
      ])
      setProducts(prodData.products)
      setIndicators(indData.indicators)
    }
    fetchOptions()
  }, [])

  const fetchSPCData = async () => {
    setLoading(true)
    try {
      const data = await api.getSPCData(filter.product_code, filter.indicator_code, filter.window)
      setSPCData(data)
      renderChart(data)
    } catch (e) {
      console.error('获取SPC数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  const renderChart = (data: SPCData) => {
    if (!chartRef.current) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    const { data_points, i_chart } = data
    const times = data_points.map(p => new Date(p.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))
    const values = data_points.map(p => p.value)
    const violationIndices = data_points.reduce<number[]>((acc, p, idx) => {
      if (p.is_violation) acc.push(idx)
      return acc
    }, [])

    const option = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: times },
      yAxis: { type: 'value' },
      series: [
        {
          name: '检测值',
          type: 'line',
          data: values,
          markLine: {
            data: [
              { yAxis: i_chart.cl, name: 'CL', lineStyle: { color: '#409eff' } },
              { yAxis: i_chart.ucl, name: 'UCL', lineStyle: { color: '#f56c6c', type: 'dashed' } },
              { yAxis: i_chart.lcl, name: 'LCL', lineStyle: { color: '#f56c6c', type: 'dashed' } },
            ],
          },
          markPoint: {
            data: violationIndices.map(idx => ({
              coord: [idx, values[idx]],
              itemStyle: { color: '#f56c6c' },
            })),
          },
        },
      ],
    }

    chartInstance.current.setOption(option, true)
  }

  useEffect(() => {
    fetchSPCData()
  }, [filter])

  const violationColumns = [
    {
      title: '规则',
      dataIndex: 'rule_id',
      key: 'rule_id',
      render: (id: number) => <Tag color={id <= 2 ? 'red' : id <= 6 ? 'orange' : 'blue'}>R{id}</Tag>,
    },
    { title: '规则名称', dataIndex: 'rule_name', key: 'rule_name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => (
        <Tag color={severity === 'CRITICAL' ? 'red' : severity === 'WARNING' ? 'orange' : 'blue'}>
          {severity}
        </Tag>
      ),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>SPC 控制图 <HelpTooltip termId="spc-concept" placement="right" /></h2>
      
      <Card style={{ marginBottom: 24 }}>
        <Form layout="inline">
          <Form.Item label="品项">
            <Select
              value={filter.product_code}
              onChange={value => setFilter({ ...filter, product_code: value })}
              style={{ width: 160 }}
            >
              {products.map(p => (
                <Select.Option key={p.code} value={p.code}>{p.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="指标">
            <Select
              value={filter.indicator_code}
              onChange={value => setFilter({ ...filter, indicator_code: value })}
              style={{ width: 160 }}
            >
              {indicators.map(i => (
                <Select.Option key={i.code} value={i.code}>{i.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="窗口大小">
            <InputNumber
              value={filter.window}
              onChange={value => setFilter({ ...filter, window: value || 30 })}
              min={10}
              max={100}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={fetchSPCData} loading={loading}>查询</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="I-MR 控制图" style={{ marginBottom: 24 }}>
        <div ref={chartRef} style={{ height: 450 }} />
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card title="规格限">
            <p>USL: {spcData?.spec_limits.usl?.toFixed(4) || '未配置'}</p>
            <p>LSL: {spcData?.spec_limits.lsl?.toFixed(4) || '未配置'}</p>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="控制限">
            <p>UCL: {spcData?.i_chart.ucl?.toFixed(4) || '-'}</p>
            <p>LCL: {spcData?.i_chart.lcl?.toFixed(4) || '-'}</p>
            <p>CL: {spcData?.i_chart.cl?.toFixed(4) || '-'}</p>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="违规统计">
            <p>违规点数: {spcData?.violations.length || 0}</p>
            <p>总数据点: {spcData?.data_points.length || 0}</p>
          </Card>
        </Col>
      </Row>

      {spcData?.violations && spcData.violations.length > 0 && (
        <Card title="Nelson 规则违规">
          <Table
            dataSource={spcData.violations}
            columns={violationColumns}
            rowKey="rule_id"
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  )
}
