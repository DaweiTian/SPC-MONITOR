import React from 'react'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { FTAConfig as FTAConfigType } from '../types'

interface FTAConfigProps {
  ftaConfig: FTAConfigType
  configLoading: boolean
  testResult: { success: boolean; message: string } | null
  saveResult: { success: boolean; message: string } | null
  onFtaConfigChange: (field: keyof FTAConfigType, value: string | number) => void
  onTestConnection: () => void
  onSaveConfig: () => void
}

export const FTAConfig = React.memo(function FTAConfig(props: FTAConfigProps) {
  const {
    ftaConfig,
    configLoading,
    testResult,
    saveResult,
    onFtaConfigChange,
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
        <StatusTag label="FTA (Perten)" color="orange" />
      </div>

      <div className={styles.dbConfigForm} role="group" aria-label="FTA 连接配置">
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
              value={ftaConfig.server}
              onChange={e => onFtaConfigChange('server', e.target.value)}
              placeholder="例: XTZJ-20230331ga\Perten,1433"
              aria-label="服务器地址"
            />
            <span className={styles.formHint}>格式: 主机名\实例名,端口（如 XTZJ-20230331ga\Perten,1433）</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              数据库名称
              <span className={styles.formRequired}>*</span>
            </label>
            <input
              type="text"
              className={styles.formInput}
              value={ftaConfig.database}
              onChange={e => onFtaConfigChange('database', e.target.value)}
              placeholder="例: Pert_Application"
              aria-label="数据库名称"
            />
          </div>
        </div>

        {/* Row 2: Auth Type & Driver */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>认证方式</label>
            <select
              className={styles.formSelect}
              value={ftaConfig.auth_type}
              onChange={e => onFtaConfigChange('auth_type', e.target.value)}
              aria-label="认证方式"
            >
              <option value="windows">Windows 认证 (SSPI)</option>
              <option value="sql">SQL Server 认证</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>ODBC 驱动</label>
            <select
              className={styles.formSelect}
              value={ftaConfig.driver}
              onChange={e => onFtaConfigChange('driver', e.target.value)}
              aria-label="ODBC 驱动"
            >
              <option value="pymssql">pymssql（推荐，无需安装驱动）</option>
              <option value="ODBC Driver 17 for SQL Server">ODBC Driver 17</option>
              <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18</option>
              <option value="SQL Server">SQL Server (旧版)</option>
            </select>
          </div>
        </div>

        {/* Row 3: Username & Password (SQL auth only) */}
        {ftaConfig.auth_type === 'sql' && (
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                用户名
                <span className={styles.formRequired}>*</span>
              </label>
              <input
                type="text"
                className={styles.formInput}
                value={ftaConfig.username}
                onChange={e => onFtaConfigChange('username', e.target.value)}
                placeholder="SQL Server 登录用户名"
                aria-label="用户名"
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
                value={ftaConfig.password}
                onChange={e => onFtaConfigChange('password', e.target.value)}
                placeholder="SQL Server 登录密码"
                aria-label="密码"
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
              value={ftaConfig.timeout}
              onChange={e => onFtaConfigChange('timeout', parseInt(e.target.value) || 30)}
              min="5"
              max="120"
              aria-label="连接超时（秒）"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.formActions}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onTestConnection}
            disabled={configLoading || !ftaConfig.server || !ftaConfig.database}
          >
            {configLoading ? '测试中...' : '测试连接'}
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onSaveConfig}
            disabled={configLoading || !ftaConfig.server || !ftaConfig.database}
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
