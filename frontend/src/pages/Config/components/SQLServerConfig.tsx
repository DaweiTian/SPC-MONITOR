import React from 'react'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { DBConfig } from '../types'

interface SQLServerConfigProps {
  dbConfig: DBConfig
  configLoading: boolean
  testResult: { success: boolean; message: string } | null
  saveResult: { success: boolean; message: string } | null
  currentInstrument: string
  onDbConfigChange: (field: keyof DBConfig, value: string | number | boolean) => void
  onTestConnection: () => void
  onSaveConfig: () => void
}

export const SQLServerConfig = React.memo(function SQLServerConfig(props: SQLServerConfigProps) {
  const {
    dbConfig,
    configLoading,
    testResult,
    saveResult,
    currentInstrument,
    onDbConfigChange,
    onTestConnection,
    onSaveConfig,
  } = props

  return (
    <div className={styles.dbConfigSection}>
      <div className={styles.dbConfigHeader}>
        <span className={styles.dbConfigTitle}>
          <span className={styles.cardTitleDot} />
          SQL Server 连接配置
        </span>
        <StatusTag label={currentInstrument.toUpperCase()} color="blue" />
      </div>

      <div className={styles.dbConfigForm}>
        {/* Row 1: Server & Database */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              服务器地址
              <span className={styles.formRequired}>*</span>
            </label>
            <input
              type="text"
              className={styles.formInput}
              value={dbConfig.server}
              onChange={e => onDbConfigChange('server', e.target.value)}
              placeholder="例: XTZJ-20230331ga\MSCFT1SQLSERVER,49382"
            />
            <span className={styles.formHint}>格式: 主机名\实例名,端口（如 XTZJ-20230331ga\MSCFT1SQLSERVER,49382）</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              数据库名称
              <span className={styles.formRequired}>*</span>
            </label>
            <input
              type="text"
              className={styles.formInput}
              value={dbConfig.database}
              onChange={e => onDbConfigChange('database', e.target.value)}
              placeholder="例: MSCFT1"
            />
          </div>
        </div>

        {/* Row 2: Auth Type & Driver */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>认证方式</label>
            <select
              className={styles.formSelect}
              value={dbConfig.auth_type}
              onChange={e => onDbConfigChange('auth_type', e.target.value)}
            >
              <option value="windows">Windows 认证 (SSPI)</option>
              <option value="sql">SQL Server 认证</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>数据库驱动</label>
            <select
              className={styles.formSelect}
              value={dbConfig.driver}
              onChange={e => onDbConfigChange('driver', e.target.value)}
            >
              <option value="pymssql">pymssql（无需安装驱动）</option>
            </select>
          </div>
        </div>

        {/* Row 3: Username & Password (SQL auth only) */}
        {dbConfig.auth_type === 'sql' && (
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                用户名
                <span className={styles.formRequired}>*</span>
              </label>
              <input
                type="text"
                className={styles.formInput}
                value={dbConfig.username}
                onChange={e => onDbConfigChange('username', e.target.value)}
                placeholder="SQL Server 登录用户名"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                密码
                <span className={styles.formRequired}>*</span>
              </label>
              <input
                type="password"
                className={styles.formInput}
                value={dbConfig.password}
                onChange={e => onDbConfigChange('password', e.target.value)}
                placeholder="SQL Server 登录密码"
              />
            </div>
          </div>
        )}

        {/* Row 4: Timeout */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>连接超时 (秒)</label>
            <input
              type="number"
              className={styles.formInput}
              value={dbConfig.timeout}
              onChange={e => onDbConfigChange('timeout', parseInt(e.target.value) || 30)}
              min="5"
              max="120"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.formActions}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onTestConnection}
            disabled={configLoading || !dbConfig.server || !dbConfig.database}
          >
            {configLoading ? '测试中...' : '测试连接'}
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onSaveConfig}
            disabled={configLoading || !dbConfig.server || !dbConfig.database}
          >
            {configLoading ? '保存中...' : '保存配置'}
          </button>
        </div>

        {/* Result Messages */}
        {testResult && (
          <div className={`${styles.formMessage} ${testResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
            {testResult.message}
          </div>
        )}
        {saveResult && (
          <div className={`${styles.formMessage} ${saveResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
            {saveResult.message}
          </div>
        )}
      </div>
    </div>
  )
})
