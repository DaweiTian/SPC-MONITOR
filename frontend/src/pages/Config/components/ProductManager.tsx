import React from 'react'
import { AliasConfig } from '../../../components/AliasConfig'
import styles from '../Config.module.css'
import { StatusTag } from './StatusTag'
import type { ProductItem, IndicatorSpec } from '../types'

interface ProductManagerProps {
  products: ProductItem[]
  savedSpecLimits: Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>
  availableIndicators: Array<{ code: string; name: string }>
  showProductDialog: boolean
  editingProduct: ProductItem | null
  newProduct: { name: string; code: string; status: 'enabled' | 'disabled' }
  productAlias: string
  indicatorSpecs: IndicatorSpec[]
  onEditProduct: (product: ProductItem) => void
  onAddProduct: () => void
  onSaveProduct: () => void
  onCloseProductDialog: () => void
  setNewProduct: React.Dispatch<React.SetStateAction<{ name: string; code: string; status: 'enabled' | 'disabled' }>>
  setProductAlias: React.Dispatch<React.SetStateAction<string>>
  setIndicatorSpecs: React.Dispatch<React.SetStateAction<IndicatorSpec[]>>
}

export const ProductManager = React.memo(function ProductManager(props: ProductManagerProps) {
  const {
    products,
    savedSpecLimits,
    availableIndicators,
    showProductDialog,
    editingProduct,
    newProduct,
    productAlias,
    indicatorSpecs,
    onEditProduct,
    onSaveProduct,
    onCloseProductDialog,
    setNewProduct,
    setProductAlias,
    setIndicatorSpecs,
  } = props

  return (
    <>
      {/* ── 品项管理（合并品项管理 + 规格限配置）───────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            品项管理
          </span>
        </div>
        <div className={styles.cardBody}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品项名称</th>
                <th>编码</th>
                <th>监测指标数</th>
                <th>规格限 (USL/LSL)</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td className={styles.tableCellPrimary}>{p.name}</td>
                  <td className={styles.tableCellMono}>{p.code}</td>
                  <td>{p.indicatorCount}</td>
                  <td>
                    {savedSpecLimits[p.code] && Object.keys(savedSpecLimits[p.code]).length > 0
                      ? Object.entries(savedSpecLimits[p.code])
                          .map(([k, v]) => {
                            const indName = availableIndicators.find(i => i.code === k)?.name || k
                            return `${indName}: ${v.usl ?? '-'}/${v.lsl ?? '-'}`
                          })
                          .join(', ')
                      : <span style={{ color: 'var(--text-muted)' }}>未配置</span>
                    }
                  </td>
                  <td>
                    {p.status === 'enabled'
                      ? <StatusTag label="启用" color="green" />
                      : <StatusTag label="停用" color="orange" />}
                  </td>
                  <td>
                    <button
                      className={styles.btnEdit}
                      onClick={() => onEditProduct(p)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 检验项目别名 ─────────────────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            检验项目别名
          </span>
        </div>
        <div className={styles.cardBody} style={{ padding: 0 }}>
          <AliasConfig
            products={products.map(p => ({ code: p.code, name: p.name }))}
            indicators={availableIndicators}
            onUpdate={() => {}}
            mode="indicators"
          />
        </div>
      </div>

      {/* ── Product Dialog ── */}
      {showProductDialog && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog} style={{ maxWidth: '700px' }}>
            <div className={styles.confirmHeader}>
              <h3>{editingProduct ? '编辑品项' : '新增品项'}</h3>
              <button className={styles.confirmClose} onClick={onCloseProductDialog}>×</button>
            </div>
            
            <div className={styles.confirmBody}>
              {/* Basic Info */}
              <div className={styles.confirmSection}>
                <h4>基本信息</h4>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      品项名称
                      <span className={styles.formRequired}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={newProduct.name}
                      onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="例: 砖纯牛奶"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      品项编码
                      <span className={styles.formRequired}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={newProduct.code}
                      onChange={e => setNewProduct(prev => ({ ...prev, code: e.target.value }))}
                      placeholder="例: FT1-STD"
                    />
                  </div>
                </div>
                <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                  <label className={styles.formLabel}>状态</label>
                  <select
                    className={styles.formSelect}
                    value={newProduct.status}
                    onChange={e => setNewProduct(prev => ({ ...prev, status: e.target.value as 'enabled' | 'disabled' }))}
                  >
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                  <label className={styles.formLabel}>品项别名</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={productAlias}
                    onChange={e => setProductAlias(e.target.value)}
                    placeholder="可选，配置后界面上显示此别名"
                  />
                </div>
              </div>

              {/* Indicator Selection & Spec Limits */}
              <div className={styles.confirmSection}>
                <h4>监测指标与规格限</h4>
                <div className={styles.confirmTableWrapper} style={{ maxHeight: '300px' }}>
                  <table className={styles.confirmTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>启用</th>
                        <th>指标名称</th>
                        <th>USL (上限)</th>
                        <th>LSL (下限)</th>
                        <th>目标值</th>
                        <th>单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indicatorSpecs.map((spec, index) => (
                        <tr key={spec.indicator_code}>
                          <td>
                            <input
                              type="checkbox"
                              checked={spec.enabled}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, enabled: e.target.checked }
                                setIndicatorSpecs(newSpecs)
                              }}
                            />
                          </td>
                          <td className={styles.tableCellPrimary}>{spec.indicator_name}</td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.usl}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, usl: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.lsl}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, lsl: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.target}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, target: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className={styles.formInput}
                              style={{ width: '60px', padding: '4px 8px' }}
                              value={spec.unit}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, unit: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="%"
                              disabled={!spec.enabled}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  已选择 {indicatorSpecs.filter(s => s.enabled).length} / {indicatorSpecs.length} 个指标
                </div>
              </div>
            </div>

            <div className={styles.confirmFooter}>
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={onCloseProductDialog}
              >
                取消
              </button>
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onSaveProduct}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
