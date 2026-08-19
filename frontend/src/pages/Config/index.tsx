import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Form, Input, Select, Button, Switch, InputNumber,
  Table, Tag, Divider, Alert, Typography, message, Space,
} from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { api } from '../../services'
import type { Config, DBConfig, FieldMapping } from '../../types'

const { Title, Text, Paragraph } = Typography

interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  sample_value?: string
}

/** Extend DBConfig locally to carry the password field the backend expects */
interface DBConfigWithPassword extends DBConfig {
  password?: string
}

const NELSON_RULES = [
  { key: 1, rule: '规则1', description: '1个点超出3σ控制限', severity: 'CRITICAL' },
  { key: 2, rule: '规则2', description: '连续9个点在中心线同一侧', severity: 'CRITICAL' },
  { key: 3, rule: '规则3', description: '连续6个点递增或递减', severity: 'WARNING' },
  { key: 4, rule: '规则4', description: '连续14个点交替升降', severity: 'WARNING' },
  { key: 5, rule: '规则5', description: '连续3个点中有2个超出2σ', severity: 'CRITICAL' },
  { key: 6, rule: '规则6', description: '连续5个点中有4个超出1σ', severity: 'WARNING' },
  { key: 7, rule: '规则7', description: '连续15个点在1σ以内（层叠）', severity: 'INFO' },
  { key: 8, rule: '规则8', description: '连续8个点在1σ以外（混合）', severity: 'INFO' },
]

const severityColor = (s: string) => {
  if (s === 'CRITICAL') return 'red'
  if (s === 'WARNING') return 'orange'
  return 'blue'
}

const nelsonColumns = [
  { title: '规则', dataIndex: 'rule', key: 'rule', width: 80 },
  { title: '描述', dataIndex: 'description', key: 'description' },
  {
    title: '严重程度',
    dataIndex: 'severity',
    key: 'severity',
    width: 120,
    render: (s: string) => <Tag color={severityColor(s)}>{s}</Tag>,
  },
]

export const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null)
  const [dbConfig, setDBConfig] = useState<DBConfigWithPassword | null>(null)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // DB Explore state
  const [exploreLoading, setExploreLoading] = useState(false)
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string | undefined>(undefined)
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [columnsLoading, setColumnsLoading] = useState(false)

  // Field Mapping state
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    table_name: '',
    time_column: '',
    product_column: '',
    sample_column: '',
    indicators: {},
  })
  const [mappingLoading, setMappingLoading] = useState(false)

  useEffect(() => {
    const fetchConfig = async () => {
      const [configData, dbConfigData] = await Promise.all([
        api.getConfig(),
        api.getDBConfig(),
      ])
      setConfig(configData)
      setDBConfig(dbConfigData as DBConfigWithPassword)
    }
    fetchConfig()

    // Load saved field mapping
    api.getFieldMapping()
      .then(data => { if (data) setFieldMapping(data) })
      .catch(() => { /* no mapping saved yet */ })
  }, [])

  const updateDB = (patch: Partial<DBConfigWithPassword>) => {
    setDBConfig(prev => (prev ? { ...prev, ...patch } : null))
  }

  const handleSaveConfig = async () => {
    if (!config) return
    try {
      await api.updateConfig(config)
      message.success('配置已保存')
    } catch {
      message.error('保存失败')
    }
  }

  const handleTestConnection = async () => {
    if (!dbConfig) return
    setLoading(true)
    try {
      const result = await api.testDBConnection(dbConfig)
      setTestResult(result)
      if (result.success) {
        message.success('连接成功')
      } else {
        message.error('连接失败: ' + result.message)
      }
    } catch {
      message.error('测试连接请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDBConfig = async () => {
    if (!dbConfig) return
    try {
      const result = await api.updateDBConfig(dbConfig)
      if (result.success) {
        message.success('数据库配置已保存')
      } else {
        message.error(result.message)
      }
    } catch {
      message.error('保存失败')
    }
  }

  // ── DB Explore ──────────────────────────────────────────────
  const handleExplore = useCallback(async () => {
    if (!dbConfig) return
    setExploreLoading(true)
    setSelectedTable(undefined)
    setColumns([])
    try {
      const result = await api.exploreDBStructure(dbConfig)
      if (result?.tables) {
        setTables(result.tables)
        message.success(`发现 ${result.tables.length} 张表`)
      } else if (result?.success === false) {
        message.error(result.message || '探索失败')
      } else {
        setTables(result || [])
      }
    } catch {
      message.error('探索数据库失败')
    } finally {
      setExploreLoading(false)
    }
  }, [dbConfig])

  const handleTableSelect = useCallback(async (tableName: string) => {
    setSelectedTable(tableName)
    setColumnsLoading(true)
    try {
      const result = await api.getTableColumns(tableName)
      setColumns(result?.columns || result || [])
    } catch {
      message.error('获取列信息失败')
    } finally {
      setColumnsLoading(false)
    }
  }, [])

  // ── Field Mapping ───────────────────────────────────────────
  const handleSaveMapping = async () => {
    setMappingLoading(true)
    try {
      await api.updateFieldMapping(fieldMapping)
      message.success('字段映射已保存')
    } catch {
      message.error('保存字段映射失败')
    } finally {
      setMappingLoading(false)
    }
  }

  const columnDefs = [
    { title: '列名', dataIndex: 'column_name', key: 'column_name' },
    { title: '类型', dataIndex: 'data_type', key: 'data_type', width: 160 },
    {
      title: '可空',
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 80,
      render: (v: string) => (v === 'YES' ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    { title: '默认值', dataIndex: 'column_default', key: 'column_default', width: 120, render: (v: string | null) => v ?? '-' },
    { title: '示例值', dataIndex: 'sample_value', key: 'sample_value', width: 160, render: (v: string | undefined) => v ?? '-' },
  ]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 24, color: 'var(--primary-dark)' }}>配置管理</Title>

      {/* ─── DB Config Form ─────────────────────────────────── */}
      <Card title="数据库连接配置" style={{ marginBottom: 24 }}>
        <Form layout="vertical">
          <Form.Item label="启用数据库采集">
            <Switch
              checked={dbConfig?.enabled}
              onChange={checked => updateDB({ enabled: checked })}
            />
          </Form.Item>
          <Form.Item label="服务器地址">
            <Input
              value={dbConfig?.server}
              onChange={e => updateDB({ server: e.target.value })}
              placeholder="例: 192.168.1.100\\SQLEXPRESS"
            />
          </Form.Item>
          <Form.Item label="数据库名">
            <Input
              value={dbConfig?.database}
              onChange={e => updateDB({ database: e.target.value })}
              placeholder="例: FT1_Production"
            />
          </Form.Item>
          <Form.Item label="认证方式">
            <Select
              value={dbConfig?.auth_type}
              onChange={value => updateDB({ auth_type: value })}
            >
              <Select.Option value="windows">Windows 集成认证</Select.Option>
              <Select.Option value="sql">SQL Server 认证</Select.Option>
            </Select>
          </Form.Item>

          {dbConfig?.auth_type === 'sql' && (
            <>
              <Form.Item label="用户名">
                <Input
                  value={dbConfig?.username}
                  onChange={e => updateDB({ username: e.target.value })}
                  placeholder="SQL Server 用户名"
                />
              </Form.Item>
              <Form.Item label="密码">
                <Input.Password
                  value={dbConfig?.password}
                  onChange={e => updateDB({ password: e.target.value })}
                  placeholder="SQL Server 密码"
                />
              </Form.Item>
            </>
          )}

          <Form.Item label="驱动">
            <Input
              value={dbConfig?.driver}
              onChange={e => updateDB({ driver: e.target.value })}
              placeholder="ODBC Driver 17 for SQL Server"
            />
          </Form.Item>
          <Form.Item label="连接超时（秒）">
            <InputNumber
              value={dbConfig?.timeout}
              onChange={value => updateDB({ timeout: value ?? 15 })}
              min={5}
              max={60}
              style={{ width: 160 }}
            />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={handleTestConnection} loading={loading}>
              测试连接
            </Button>
            <Button onClick={handleSaveDBConfig}>保存配置</Button>
          </Space>
        </Form>

        {testResult && (
          <Alert
            style={{ marginTop: 16 }}
            type={testResult.success ? 'success' : 'error'}
            showIcon
            message={testResult.message}
          />
        )}
      </Card>

      {/* ─── DB Explore ─────────────────────────────────────── */}
      <Card
        title="数据库探索"
        style={{ marginBottom: 24 }}
        extra={
          <Button
            icon={<SearchOutlined />}
            onClick={handleExplore}
            loading={exploreLoading}
          >
            探索数据库
          </Button>
        }
      >
        {tables.length > 0 ? (
          <>
            <Form layout="inline" style={{ marginBottom: 16 }}>
              <Form.Item label="选择表">
                <Select
                  showSearch
                  placeholder="选择一张表查看列信息"
                  style={{ width: 320 }}
                  value={selectedTable}
                  onChange={handleTableSelect}
                  options={tables.map(t => ({ label: t, value: t }))}
                />
              </Form.Item>
            </Form>

            {selectedTable && (
              <>
                <Divider orientation="left" plain>
                  <Text strong>{selectedTable}</Text> 的列信息
                </Divider>
                <Table
                  dataSource={columns}
                  columns={columnDefs}
                  rowKey="column_name"
                  loading={columnsLoading}
                  size="small"
                  pagination={false}
                  scroll={{ x: 700 }}
                />
              </>
            )}
          </>
        ) : (
          <Text type="secondary">点击"探索数据库"按钮以发现可用表。</Text>
        )}
      </Card>

      {/* ─── Field Mapping ──────────────────────────────────── */}
      <Card title="字段映射" style={{ marginBottom: 24 }}>
        <Paragraph type="secondary">
          指定数据库表中各字段的映射关系，用于自动采集数据。
        </Paragraph>
        <Form layout="vertical">
          <Form.Item label="表名">
            <Select
              showSearch
              placeholder="选择或手动输入表名"
              value={fieldMapping.table_name || undefined}
              onChange={(val: string) => setFieldMapping(prev => ({ ...prev, table_name: val }))}
              options={tables.map(t => ({ label: t, value: t }))}
              allowClear
              notFoundContent={null}
              style={{ maxWidth: 400 }}
            />
          </Form.Item>
          <Form.Item label="时间列">
            <Input
              value={fieldMapping.time_column}
              onChange={e => setFieldMapping(prev => ({ ...prev, time_column: e.target.value }))}
              placeholder="如: sample_time"
              style={{ maxWidth: 400 }}
            />
          </Form.Item>
          <Form.Item label="产品列">
            <Input
              value={fieldMapping.product_column}
              onChange={e => setFieldMapping(prev => ({ ...prev, product_column: e.target.value }))}
              placeholder="如: product_code"
              style={{ maxWidth: 400 }}
            />
          </Form.Item>
          <Form.Item label="样本列">
            <Input
              value={fieldMapping.sample_column}
              onChange={e => setFieldMapping(prev => ({ ...prev, sample_column: e.target.value }))}
              placeholder="如: sample_id"
              style={{ maxWidth: 400 }}
            />
          </Form.Item>
          <Button type="primary" onClick={handleSaveMapping} loading={mappingLoading}>
            保存字段映射
          </Button>
        </Form>
      </Card>

      {/* ─── Nelson Rules Reference ─────────────────────────── */}
      <Card title="Nelson 规则参考" style={{ marginBottom: 24 }}>
        <Alert
          message="SPC 违规检测规则"
          description="以下 8 条 Nelson 规则用于 SPC 控制图的违规检测，系统将自动识别并触发告警。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          dataSource={NELSON_RULES}
          columns={nelsonColumns}
          rowKey="key"
          size="small"
          pagination={false}
        />
      </Card>

      {/* ─── Collection Config ──────────────────────────────── */}
      <Card title="采集配置">
        <Form layout="vertical">
          <Form.Item label="默认采集频率（分钟）">
            <InputNumber
              value={config?.default_frequency_minutes}
              onChange={value => setConfig(config ? { ...config, default_frequency_minutes: value || 5 } : null)}
              min={1}
              max={60}
            />
          </Form.Item>
          <Form.Item label="SPC 窗口大小">
            <InputNumber
              value={config?.spc_window_size}
              onChange={value => setConfig(config ? { ...config, spc_window_size: value || 30 } : null)}
              min={10}
              max={200}
            />
          </Form.Item>
          <Form.Item label="Cpk 预警阈值">
            <InputNumber
              value={config?.cpk_min_threshold}
              onChange={value => setConfig(config ? { ...config, cpk_min_threshold: value || 1.33 } : null)}
              min={0.5}
              max={2.0}
              step={0.1}
            />
          </Form.Item>
          <Form.Item label="声音提醒">
            <Switch
              checked={config?.alert_sound_enabled}
              onChange={checked => setConfig(config ? { ...config, alert_sound_enabled: checked } : null)}
            />
          </Form.Item>
          <Button type="primary" onClick={handleSaveConfig}>保存配置</Button>
        </Form>
      </Card>
    </div>
  )
}
