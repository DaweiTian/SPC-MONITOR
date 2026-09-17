import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../../services'
import styles from './Correction.module.css'

interface ProductItem {
  code: string
  name: string
}

interface CorrectionData {
  values: Record<string, number>
  updated_at?: string
}

interface EditItem {
  sign: '+' | '-'
  value: string
}

const CorrectionPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [availableIndicators, setAvailableIndicators] = useState<Array<{ code: string; name: string }>>([])
  const [savedIndicators, setSavedIndicators] = useState<Record<string, string[]>>({})
  const [correctionValues, setCorrectionValues] = useState<Record<string, CorrectionData>>({})
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editItems, setEditItems] = useState<Record<string, EditItem>>({})
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [correctionStatus, setCorrectionStatus] = useState<'all' | 'configured' | 'unconfigured'>('all')

  const filteredProducts = useMemo(() => {
    let list = products
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
    }
    if (correctionStatus !== 'all') {
      list = list.filter(p => {
        const data = correctionValues[p.code]
        const hasCorrections = data?.values && Object.values(data.values).some(v => v !== 0)
        return correctionStatus === 'configured' ? hasCorrections : !hasCorrections
      })
    }
    return list
  }, [products, searchQuery, correctionStatus, correctionValues])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsResult, indicatorsResult, savedIndResult, correctionsResult, statusResult] = await Promise.all([
          api.getProducts(),
          api.getIndicators(),
          api.getSavedIndicators().catch(() => ({})),
          api.getCorrectionValues().catch(() => ({})),
          api.getProductStatus().catch(() => ({} as Record<string, string>)),
        ])

        if (productsResult?.products) {
          const all = productsResult.products.map((p: any) => ({ code: p.code, name: p.name }))
          const statusMap = (statusResult || {}) as Record<string, string>
          const saved = (savedIndResult || {}) as Record<string, string[]>
          // 隐藏：品项停用，或在品项管理中已取消全部指标勾选
          setProducts(all.filter(p => {
            if (statusMap[p.code] === 'disabled') return false
            const codes = saved[p.code]
            if (Array.isArray(codes) && codes.length === 0) return false
            return true
          }))
        }
        if (indicatorsResult?.indicators) {
          setAvailableIndicators(indicatorsResult.indicators)
        }
        if (savedIndResult) {
          setSavedIndicators(savedIndResult)
        }
        if (correctionsResult) {
          setCorrectionValues(correctionsResult)
        }
      } catch (e) {
        console.error('加载数据失败:', e)
      }
    }
    fetchData()
  }, [])

  const handleEdit = useCallback((productCode: string) => {
    setEditingProduct(productCode)
    setSaveResult(null)
    const productData = correctionValues[productCode]
    const productCorrections = productData?.values || {}
    const saved = savedIndicators[productCode]
    // 仅编辑品项管理中勾选的指标；未配置过时回退全部可用指标
    const indicatorCodes = Array.isArray(saved)
      ? saved
      : availableIndicators.map(i => i.code)
    const items: Record<string, EditItem> = {}
    indicatorCodes.forEach(code => {
      const val = productCorrections[code]
      if (val !== undefined && val !== 0) {
        items[code] = {
          sign: val >= 0 ? '+' : '-',
          value: Math.abs(val).toFixed(4)
        }
      } else {
        items[code] = { sign: '+', value: '0.0000' }
      }
    })
    setEditItems(items)
  }, [correctionValues, savedIndicators, availableIndicators])

  const handleSave = useCallback(async () => {
    if (!editingProduct) return
    setSaving(true)
    setSaveResult(null)

    const corrections: Record<string, number> = {}
    Object.entries(editItems).forEach(([code, item]) => {
      const num = parseFloat(item.value)
      if (!isNaN(num) && num !== 0) {
        const signedNum = item.sign === '-' ? -num : num
        corrections[code] = Math.round(signedNum * 10000) / 10000
      }
    })

    try {
      const result = await api.updateCorrectionValues(editingProduct, corrections)
      if (result?.success) {
        setSaveResult({ success: true, message: '修正值已保存' })
        setCorrectionValues(prev => ({
          ...prev,
          [editingProduct]: {
            values: corrections,
            updated_at: new Date().toISOString()
          }
        }))
        setEditingProduct(null)
      } else {
        setSaveResult({ success: false, message: result?.message || '保存失败' })
      }
    } catch {
      setSaveResult({ success: false, message: '保存失败' })
    } finally {
      setSaving(false)
    }
  }, [editingProduct, editItems])

  const handleCancel = useCallback(() => {
    setEditingProduct(null)
    setSaveResult(null)
  }, [])

  const toggleSign = useCallback((code: string) => {
    setEditItems(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        sign: prev[code].sign === '+' ? '-' : '+'
      }
    }))
  }, [])

  const handleValueChange = useCallback((code: string, value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, '')
    // Prevent multiple decimal points
    const parts = sanitized.split('.')
    const cleanValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : sanitized
    setEditItems(prev => ({
      ...prev,
      [code]: { ...prev[code], value: cleanValue }
    }))
  }, [])

  const getIndicatorCodesForProduct = (productCode: string): string[] => {
    const saved = savedIndicators[productCode]
    return Array.isArray(saved) ? saved : availableIndicators.map(i => i.code)
  }

  const formatCorrectionValues = (productCode: string): React.ReactNode => {
    const data = correctionValues[productCode]
    const values = data?.values || {}
    // 列表只展示品项管理中仍勾选的指标上的修正值
    const allowed = getIndicatorCodesForProduct(productCode)
    const allowedSet = new Set(allowed)
    const hasSavedConfig = Array.isArray(savedIndicators[productCode])
    const entries = Object.entries(values).filter(([code, v]) => {
      if (v === 0) return false
      if (hasSavedConfig && !allowedSet.has(code)) return false
      return true
    })

    if (entries.length === 0) {
      return <span className={styles.emptyText}>未配置</span>
    }

    const displayEntries = entries.slice(0, 4)
    const hasMore = entries.length > 4

    return (
      <div className={styles.correctionList}>
        {displayEntries.map(([code, value]) => {
          const indicator = availableIndicators.find(i => i.code === code)
          return (
            <span key={code} className={styles.correctionTag}>
              {indicator?.name || code}: {value > 0 ? '+' : ''}{value.toFixed(4)}
            </span>
          )
        })}
        {hasMore && <span className={styles.moreTag}>+{entries.length - 4}项</span>}
      </div>
    )
  }

  const formatTime = (isoStr?: string): string => {
    if (!isoStr) return '-'
    try {
      const date = new Date(isoStr)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const h = String(date.getHours()).padStart(2, '0')
      const m = String(date.getMinutes()).padStart(2, '0')
      return `${month}-${day} ${h}:${m}`
    } catch {
      return '-'
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>品项搜索</span>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="输入品项名称或编码"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>修正状态</span>
          <select
            className={styles.filterSelect}
            value={correctionStatus}
            onChange={e => setCorrectionStatus(e.target.value as 'all' | 'configured' | 'unconfigured')}
          >
            <option value="all">全部</option>
            <option value="configured">已配置修正值</option>
            <option value="unconfigured">未配置修正值</option>
          </select>
        </div>
        <div className={styles.filterSpacer} />
        <span className={styles.filterCount}>共 {filteredProducts.length} / {products.length} 条</span>
      </div>

      <div className={styles.card}>
        <div className={styles.cardBody}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品项名称</th>
                <th>编码</th>
                <th>当前修正值</th>
                <th>上次修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.code}>
                  <td className={styles.tableCellPrimary}>{p.name}</td>
                  <td className={styles.tableCellMono}>{p.code}</td>
                  <td>{formatCorrectionValues(p.code)}</td>
                  <td className={styles.timeCell}>{formatTime(correctionValues[p.code]?.updated_at)}</td>
                  <td>
                    <button
                      className={styles.btnEdit}
                      onClick={() => handleEdit(p.code)}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {saveResult && (
            <div className={`${styles.formMessage} ${saveResult.success ? styles.formMessageSuccess : styles.formMessageError}`} style={{ marginTop: '12px' }}>
              {saveResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      {editingProduct && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmHeader}>
              <h3>编辑修正值 - {products.find(p => p.code === editingProduct)?.name || editingProduct}</h3>
              <button className={styles.confirmClose} onClick={handleCancel}>×</button>
            </div>

            <div className={styles.confirmBody}>
              <div className={styles.hintText}>
                修正值将加到原始采集值上。点击 [+/-] 按钮切换正负号，输入框仅支持数字。
              </div>
              <div className={styles.confirmTableWrapper}>
                <table className={styles.confirmTable}>
                  <thead>
                    <tr>
                      <th>指标名称</th>
                      <th>修正值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getIndicatorCodesForProduct(editingProduct).map(code => {
                      const indicator = availableIndicators.find(i => i.code === code)
                      const item = editItems[code] || { sign: '+', value: '0.0000' }
                      return (
                        <tr key={code}>
                          <td className={styles.tableCellPrimary}>{indicator?.name || code}</td>
                          <td>
                            <div className={styles.signInputGroup}>
                              <button
                                type="button"
                                className={`${styles.signBtn} ${item.sign === '+' ? styles.signBtnPositive : styles.signBtnNegative}`}
                                onClick={() => toggleSign(code)}
                              >
                                {item.sign}
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                className={styles.valueInput}
                                value={item.value}
                                onChange={e => handleValueChange(code, e.target.value)}
                                placeholder="0.0000"
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.confirmFooter}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleCancel}
              >
                取消
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CorrectionPage
