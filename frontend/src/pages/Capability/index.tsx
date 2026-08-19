import React, { useState, useEffect } from 'react'
import { Card, Select, Button, Row, Col, Statistic } from 'antd'
import { api } from '../../services'
import type { CapabilityData, Product, Indicator } from '../../types'
import HelpTooltip from '../../components/HelpTooltip'

export const CapabilityPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [capabilityData, setCapabilityData] = useState<CapabilityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    product_code: 'P001',
    indicator_code: 'fat',
    window: 30,
  })

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

  const fetchCapabilityData = async () => {
    setLoading(true)
    try {
      const data = await api.getCapabilityData(filter.product_code, filter.indicator_code, filter.window)
      setCapabilityData(data)
    } catch (e) {
      console.error('获取过程能力数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCapabilityData()
  }, [filter])

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>过程能力分析 <HelpTooltip termId="cp" placement="right" /></h2>
      
      <Card style={{ marginBottom: 24 }}>
        <Select
          value={filter.product_code}
          onChange={value => setFilter({ ...filter, product_code: value })}
          style={{ width: 160, marginRight: 16 }}
        >
          {products.map(p => (
            <Select.Option key={p.code} value={p.code}>{p.name}</Select.Option>
          ))}
        </Select>
        <Select
          value={filter.indicator_code}
          onChange={value => setFilter({ ...filter, indicator_code: value })}
          style={{ width: 160, marginRight: 16 }}
        >
          {indicators.map(i => (
            <Select.Option key={i.code} value={i.code}>{i.name}</Select.Option>
          ))}
        </Select>
        <Button type="primary" onClick={fetchCapabilityData} loading={loading}>查询</Button>
      </Card>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="Cp" value={capabilityData?.result.cp || 0} precision={4} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Cpk" value={capabilityData?.result.cpk || 0} precision={4} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Pp" value={capabilityData?.result.pp || 0} precision={4} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Ppk" value={capabilityData?.result.ppk || 0} precision={4} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="规格限">
            <p>USL: {capabilityData?.spec_limits.usl || '未配置'}</p>
            <p>LSL: {capabilityData?.spec_limits.lsl || '未配置'}</p>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="西格玛水平">
            <Statistic
              title="Sigma Level"
              value={capabilityData?.result.sigma_level || 0}
              precision={2}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="不合格率">
            <Statistic
              title="PPM"
              value={capabilityData?.result.defect_rate_ppm || 0}
              precision={2}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
