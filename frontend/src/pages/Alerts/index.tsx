import React, { useState, useEffect } from 'react'
import { Card, Table, Tag, Button, Select, message, Modal } from 'antd'
import { api } from '../../services'
import type { Alert } from '../../types'

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    severity: '',
    status: '',
  })

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const data = await api.getAlerts({
        severity: filter.severity || undefined,
        status: filter.status || undefined,
      })
      setAlerts(data.alerts)
    } catch (e) {
      console.error('获取预警失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [filter])

  const handleResolve = async (alertId: string) => {
    Modal.confirm({
      title: '确认处理',
      content: '确认处理此预警？',
      onOk: async () => {
        try {
          await api.resolveAlert(alertId, 'user')
          message.success('预警已处理')
          fetchAlerts()
        } catch (e) {
          message.error('处理失败')
        }
      },
    })
  }

  const columns = [
    {
      title: '预警编号',
      dataIndex: 'alert_id',
      key: 'alert_id',
      render: (id: string) => <code>{id}</code>,
    },
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
      title: '规则类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
    },
    {
      title: '描述',
      dataIndex: 'rule_desc',
      key: 'rule_desc',
    },
    {
      title: '检测值',
      dataIndex: 'test_value',
      key: 'test_value',
      render: (value: number) => value?.toFixed(4),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'pending' ? 'orange' : 'green'}>
          {status === 'pending' ? '待处理' : '已处理'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Alert) => (
        record.status === 'pending' && (
          <Button type="link" onClick={() => handleResolve(record.alert_id)}>
            处理
          </Button>
        )
      ),
    },
  ]

  const stats = {
    CRITICAL: alerts.filter(a => a.status === 'pending' && a.severity === 'CRITICAL').length,
    WARNING: alerts.filter(a => a.status === 'pending' && a.severity === 'WARNING').length,
    INFO: alerts.filter(a => a.status === 'pending' && a.severity === 'INFO').length,
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>预警列表</h2>
      
      <Card style={{ marginBottom: 24 }}>
        <Select
          value={filter.severity}
          onChange={value => setFilter({ ...filter, severity: value })}
          style={{ width: 140, marginRight: 16 }}
          placeholder="严重程度"
          allowClear
        >
          <Select.Option value="CRITICAL">CRITICAL</Select.Option>
          <Select.Option value="WARNING">WARNING</Select.Option>
          <Select.Option value="INFO">INFO</Select.Option>
        </Select>
        <Select
          value={filter.status}
          onChange={value => setFilter({ ...filter, status: value })}
          style={{ width: 140, marginRight: 16 }}
          placeholder="状态"
          allowClear
        >
          <Select.Option value="pending">待处理</Select.Option>
          <Select.Option value="resolved">已处理</Select.Option>
        </Select>
        <Button onClick={() => setFilter({ severity: '', status: '' })}>重置</Button>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <span style={{ marginRight: 16 }}>CRITICAL: <Tag color="red">{stats.CRITICAL}</Tag></span>
        <span style={{ marginRight: 16 }}>WARNING: <Tag color="orange">{stats.WARNING}</Tag></span>
        <span>INFO: <Tag color="blue">{stats.INFO}</Tag></span>
      </Card>

      <Card title="预警记录">
        <Table
          dataSource={alerts}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
        />
      </Card>
    </div>
  )
}
