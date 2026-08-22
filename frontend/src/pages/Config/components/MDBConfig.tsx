import React from 'react'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { MDBConfig as MDBConfigType } from '../types'

interface MDBConfigProps {
  mdbConfig: MDBConfigType
  configLoading: boolean
  testResult: { success: boolean; message: string } | null
  saveResult: { success: boolean; message: string } | null
  collectResult: { success: boolean; message: string } | null
  onMdbConfigChange: (field: keyof MDBConfigType, value: string | number | boolean | Record<string, string>) => void
  onTestConnection: () => void
  onSaveConfig: () => void
}

export const MDBConfig = React.memo(function MDBConfig(props: MDBConfigProps) {
  const {
    mdbConfig,
    configLoading,
    testResult,
    saveResult,
    collectResult,
    onMdbConfigChange,
    onTestConnection,
    onSaveConfig,
  } = props

  return (
    <div className={styles.dbConfigSection}>
      <div className={styles.dbConfigHeader}>
        <span className={styles.dbConfigTitle}>
          <span className={styles.cardTitleDot} />
          MDB 文件配置
        </span>
        <StatusTag label="FT120" color="blue" />
      </div>

      <div className={styles.dbConfigForm}>
        {/* Row 1: MDB File Path */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              MDB 文件路径
              <span className={styles.formRequired}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className={styles.formInput}
                style={{ flex: 1 }}
                value={mdbConfig.mdb_path}
                onChange={e => onMdbConfigChange('mdb_path', e.target.value)}
                placeholder="例: /mnt/d/数据/ft120.mdb 或 C:\Data\ft120.mdb"
              />
              <label className={`${styles.btn} ${styles.btnSecondary}`} style={{ cursor: 'pointer', whiteSpace: 'nowrap', margin: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                浏览
                <input
                  type="file"
                  accept=".mdb,.accdb"
                  style={{ display: 'none' }}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (window.__TAURI__?.dialog) {
                      try {
                        const { open } = window.__TAURI__.dialog;
                        const path = await open({
                          filters: [{ name: 'MDB Files', extensions: ['mdb', 'accdb'] }],
                          multiple: false,
                        });
                        if (path) {
                          onMdbConfigChange('mdb_path', path as string);
                        }
                      } catch (err) {
                        console.warn('Tauri dialog failed', err);
                      }
                    } else {
                      const input = e.target as HTMLInputElement;
                      input.value = '';
                      input.click();
                    }
                  }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) {
                      onMdbConfigChange('mdb_path', file.name)
                    }
                  }}
                />
              </label>
            </div>
            <span className={styles.formHint}>支持本地 .mdb 文件</span>
          </div>
        </div>

        {/* Row 2: Table Names */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>样本表名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.sample_table}
              onChange={e => onMdbConfigChange('sample_table', e.target.value)}
              placeholder="Sample"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>产品表名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.product_table}
              onChange={e => onMdbConfigChange('product_table', e.target.value)}
              placeholder="Product"
            />
          </div>
        </div>

        {/* Row 3: More Table Names */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>组件/指标表名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.component_table}
              onChange={e => onMdbConfigChange('component_table', e.target.value)}
              placeholder="Component"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>预测/结果表名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.prediction_table}
              onChange={e => onMdbConfigChange('prediction_table', e.target.value)}
              placeholder="Prediction"
            />
          </div>
        </div>

        {/* Row 4: Column Names */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>时间列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.time_column}
              onChange={e => onMdbConfigChange('time_column', e.target.value)}
              placeholder="DateTime"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>产品引用列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.product_ref_column}
              onChange={e => onMdbConfigChange('product_ref_column', e.target.value)}
              placeholder="ProdRef"
            />
          </div>
        </div>

        {/* Row 5: More Column Names */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>产品名称列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.product_name_column}
              onChange={e => onMdbConfigChange('product_name_column', e.target.value)}
              placeholder="Name"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>组件引用列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.component_ref_column}
              onChange={e => onMdbConfigChange('component_ref_column', e.target.value)}
              placeholder="CompRef"
            />
          </div>
        </div>

        {/* Row 6: Value Column */}
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>组件名称列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.component_name_column}
              onChange={e => onMdbConfigChange('component_name_column', e.target.value)}
              placeholder="Name"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>测量值列名</label>
            <input
              type="text"
              className={styles.formInput}
              value={mdbConfig.value_column}
              onChange={e => onMdbConfigChange('value_column', e.target.value)}
              placeholder="Value"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.formActions}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onTestConnection}
            disabled={configLoading || !mdbConfig.mdb_path}
          >
            {configLoading ? '测试中...' : '测试连接'}
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onSaveConfig}
            disabled={configLoading || !mdbConfig.mdb_path}
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
        {collectResult && (
          <div className={`${styles.formMessage} ${collectResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
            {collectResult.message}
          </div>
        )}
      </div>
    </div>
  )
})
