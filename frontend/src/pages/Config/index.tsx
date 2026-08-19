import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Select, Button, Switch, InputNumber, message } from 'antd'
import { api } from '../../services'
import type { Config, DBConfig } from '../../types'

export const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState<Config | null>(null)
  const [dbConfig, setDBConfig] = useState<DBConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      const [configData, dbConfigData] = await Promise.all([
        api.getConfig(),
        api.getDBConfig(),
      ])
      setConfig(configData)
      setDBConfig(dbConfigData)
    }
    fetchConfig()
  }, [])

  const handleSaveConfig = async () => {
    if (!config) return
    try {
      await api.updateConfig(config)
      message.success('配置已保存')
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      message.error('保存失败')
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>配置管理</h2>
      
      <Card title="数据库连接配置" style={{ marginBottom: 24 }}>
        <Form layout="vertical">
          <Form.Item label="启用数据库采集">
            <Switch
              checked={dbConfig?.enabled}
              onChange={checked => setDBConfig(dbConfig ? { ...dbConfig, enabled: checked } : null)}
            />
          </Form.Item>
          <Form.Item label="服务器地址">
            <Input
              value={dbConfig?.server}
              onChange={e => setDBConfig(dbConfig ? { ...dbConfig, server: e.target.value } : null)}
            />
          </Form.Item>
          <Form.Item label="数据库名">
            <Input
              value={dbConfig?.database}
              onChange={e => setDBConfig(dbConfig ? { ...dbConfig, database: e.target.value } : null)}
            />
          </Form.Item>
          <Form.Item label="认证方式">
            <Select
              value={dbConfig?.auth_type}
              onChange={value => setDBConfig(dbConfig ? { ...dbConfig, auth_type: value } : null)}
            >
              <Select.Option value="windows">Windows 集成认证</Select.Option>
              <Select.Option value="sql">SQL Server 认证</Select.Option>
            </Select>
          </Form.Item>
          <Button type="primary" onClick={handleTestConnection} loading={loading} style={{ marginRight: 16 }}>
            测试连接
          </Button>
          <Button onClick={handleSaveDBConfig}>保存配置</Button>
        </Form>
        {testResult && (
          <div style={{ marginTop: 16, color: testResult.success ? 'green' : 'red' }}>
            {testResult.message}
          </div>
        )}
      </Card>

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
