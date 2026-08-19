import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Statistic, Table, Tag, Button, message } from 'antd'
import {
  WarningOutlined,
  SyncOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { api, websocketService } from '../../services'
import type { DashboardData, SchedulerStatus } from '../../types'
import HelpTooltip from '../../components/HelpTooltip'

export const Dashboard: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    try {
      const [dashData, statusData] = await Promise.all([
        api.getDashboard(),
        api.getStatus(),
      ])
      setDashboard(dashData)
      setStatus(statusData)
    } catch (e) {
      console.error('获取数据失败:', e)
    }
  }

  const handleManualCollect = async () => {
    setLoading(true)
    try {
      const result = await api.manualCollect()
      message.success(`采集完成，新增 ${result.new_records} 条数据`)
      fetchData()
    } catch (e) {
      message.error('采集失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    websocketService.connect()
    websocketService.on('data_update', () => fetchData())
    websocketService.on('new_alert', () => fetchData())

    return () => {
      websocketService.disconnect()
    }
  }, [])

  const alertColumns = [
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
    {
      title: '描述',
      dataIndex: 'rule_desc',
      key: 'rule_desc',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>实时看板 <HelpTooltip termId="spc-concept" placement="right" /></h2>
      
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日检测"
              value={dashboard?.today_data_count || 0}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理预警"
              value={(dashboard?.pending_alerts?.CRITICAL || 0) + (dashboard?.pending_alerts?.WARNING || 0)}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日采集"
              value={dashboard?.today_sync_count || 0}
              prefix={<SyncOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="采集频率"
              value={status?.current_interval_minutes || 5}
              suffix="分钟"
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={16}>
          <Card title="最新预警" extra={<Button onClick={() => window.location.href = '/alerts'}>查看全部</Button>}>
            <Table
              dataSource={dashboard?.recent_alerts || []}
              columns={alertColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="采集状态">
            <p>当前频率: L{status?.current_level || 0} - {status?.current_interval_minutes || 5}分钟</p>
            <p>状态: {status?.is_collecting ? '采集中...' : '正常运行'}</p>
            <p>上次采集: {status?.last_collect_time ? new Date(status.last_collect_time).toLocaleString('zh-CN') : '-'}</p>
            <Button type="primary" onClick={handleManualCollect} loading={loading}>
              立即采集
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
