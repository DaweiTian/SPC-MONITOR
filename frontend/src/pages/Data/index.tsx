import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../../services'
import { useProducts, useIndicators, useAppMetadata } from '../../hooks'
import type { MonitorData } from '../../types'
import styles from './Data.module.css'

const PAGE_SIZE = 20

function formatCorrection(correction?: number): string {
  if (!correction) return '0'
  return `${correction > 0 ? '+' : ''}${correction.toFixed(4)}`
}

interface CorrectionEdit {
  recordId: number
  sign: '+' | '-'
  value: string
}

interface FieldEdit {
  recordId: number
  unit: string
  upper_limit: string
  lower_limit: string
  sample_id: string
  remark: string
}

export const DataPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const { aliases, productStatus, specLimits } = useAppMetadata()

  const [data, setData] = useState<MonitorData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [correctionEdit, setCorrectionEdit] = useState<CorrectionEdit | null>(null)
  const [fieldEdit, setFieldEdit] = useState<FieldEdit | null>(null)
  const [saving, setSaving] = useState(false)
  const [voidConfirmId, setVoidConfirmId] = useState<number | null>(null)
  const [savedIndicators, setSavedIndicators] = useState<Record<string, string[]>>({})

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    api.getSavedIndicators().then(setSavedIndicators).catch(() => {})
  }, [])

  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: '',
    date_from: '',
    date_to: '',
  })

  const enabledProducts = useMemo(
    () => products.filter(p =>
      productStatus[p.code] !== 'disabled' &&
      !(Array.isArray(savedIndicators[p.code]) && savedIndicators[p.code].length === 0)
    ),
    [products, productStatus, savedIndicators]
  )

  // 指标下拉：已选品项时严格按勾选列表
  const filterIndicators = useMemo(() => {
    if (!filter.product_code) return indicators
    const saved = savedIndicators[filter.product_code]
    if (Array.isArray(saved)) return indicators.filter(i => saved.includes(i.code))
    return indicators
  }, [indicators, savedIndicators, filter.product_code])

  // 「全部品项」时客户端隐藏停用/空勾选品项的历史行
  const isRowVisible = useCallback((code: string) => {
    if (filter.product_code) return true
    if (productStatus[code] === 'disabled') return false
    const saved = savedIndicators[code]
    if (Array.isArray(saved) && saved.length === 0) return false
    return true
  }, [filter.product_code, productStatus, savedIndicators])

  const visibleData = useMemo(
    () => data.filter(row => isRowVisible(row.product_code || '')),
    [data, isRowVisible]
  )

  const fetchData = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    setLoading(true)
    try {
      const result = await api.getDataList({
        page,
        page_size: PAGE_SIZE,
        date_from: filter.date_from || undefined,
        date_to: filter.date_to || undefined,
        product_code: filter.product_code || undefined,
        indicator_code: filter.indicator_code || undefined,
      }, { signal })
      setData(result.data || [])
      setTotal(result.total || 0)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('获取数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [filter.product_code, filter.indicator_code, filter.date_from, filter.date_to, page])

  useEffect(() => {
    if (!hasSearched) return
    setPage(1)
  }, [filter.product_code, filter.indicator_code, filter.date_from, filter.date_to])

  useEffect(() => { if (hasSearched) fetchData() }, [fetchData, hasSearched])

  const handleSearch = useCallback(() => {
    setHasSearched(true)
    setPage(1)
    setLoading(true)
    api.getDataList({
      page: 1,
      page_size: PAGE_SIZE,
      date_from: filter.date_from || undefined,
      date_to: filter.date_to || undefined,
      product_code: filter.product_code || undefined,
      indicator_code: filter.indicator_code || undefined,
    }).then(result => {
      setData(result.data || [])
      setTotal(result.total || 0)
    }).catch(e => console.error('获取数据失败:', e))
      .finally(() => setLoading(false))
  }, [filter.product_code, filter.indicator_code, filter.date_from, filter.date_to])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(page * PAGE_SIZE, total)

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    try {
      const blob = await api.exportData({
        format,
        product: filter.product_code || undefined,
        indicator: filter.indicator_code || undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `data_export.${format === 'csv' ? 'csv' : 'xlsx'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('导出失败:', e)
    }
  }, [filter.product_code, filter.indicator_code])

  // Correction editing
  const handleEditCorrection = (row: MonitorData) => {
    setFieldEdit(null)
    const correction = row.correction ?? 0
    setCorrectionEdit({
      recordId: row.id,
      sign: correction >= 0 ? '+' : '-',
      value: Math.abs(correction).toFixed(4)
    })
  }

  const handleSaveCorrection = async () => {
    if (!correctionEdit) return
    setSaving(true)
    try {
      const num = parseFloat(correctionEdit.value) || 0
      const correction = correctionEdit.sign === '-' ? -num : num
      const result = await api.updateDataCorrection(correctionEdit.recordId, correction)
      if (result?.success) {
        setData(prev => prev.map(row => {
          if (row.id === correctionEdit.recordId) {
            const rawValue = row.raw_value ?? row.value
            return { ...row, correction, value: round(rawValue + correction, 4) }
          }
          return row
        }))
        setCorrectionEdit(null)
      }
    } catch (e) {
      console.error('更新修正值失败:', e)
    } finally {
      setSaving(false)
    }
  }

  // Field editing (unit, limits)
  const handleEditFields = (row: MonitorData) => {
    setCorrectionEdit(null)
    setFieldEdit({
      recordId: row.id,
      unit: row.unit || '',
      upper_limit: row.upper_limit?.toString() ?? '',
      lower_limit: row.lower_limit?.toString() ?? '',
      sample_id: row.sample_id || '',
      remark: row.remark || '',
    })
  }

  const handleSaveFields = async () => {
    if (!fieldEdit) return
    setSaving(true)
    try {
      const fields: Record<string, unknown> = {}
      if (fieldEdit.unit) fields.unit = fieldEdit.unit
      if (fieldEdit.upper_limit) fields.upper_limit = parseFloat(fieldEdit.upper_limit)
      if (fieldEdit.lower_limit) fields.lower_limit = parseFloat(fieldEdit.lower_limit)
      fields.sample_id = fieldEdit.sample_id || null
      fields.remark = fieldEdit.remark || null
      const result = await api.updateDataRecord(fieldEdit.recordId, fields)
      if (result?.success) {
        setData(prev => prev.map(row => {
          if (row.id === fieldEdit.recordId) {
            return {
              ...row,
              unit: fieldEdit.unit || row.unit,
              upper_limit: fieldEdit.upper_limit ? parseFloat(fieldEdit.upper_limit) : row.upper_limit,
              lower_limit: fieldEdit.lower_limit ? parseFloat(fieldEdit.lower_limit) : row.lower_limit,
              sample_id: fieldEdit.sample_id || null,
              remark: fieldEdit.remark || null,
            }
          }
          return row
        }))
        setFieldEdit(null)
      }
    } catch (e) {
      console.error('更新记录失败:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = useCallback(() => {
    setCorrectionEdit(null)
    setFieldEdit(null)
  }, [])

  const handleVoid = async () => {
    if (voidConfirmId === null) return
    setSaving(true)
    try {
      const result = await api.voidDataRecord(voidConfirmId)
      if (result?.success) {
        setData(prev => prev.map(row => row.id === voidConfirmId ? { ...row, is_voided: 1 } : row))
      }
      setVoidConfirmId(null)
    } catch (e) {
      console.error('作废失败:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleUnvoid = async (recordId: number) => {
    setSaving(true)
    try {
      const result = await api.unvoidDataRecord(recordId)
      if (result?.success) {
        setData(prev => prev.map(row => row.id === recordId ? { ...row, is_voided: 0 } : row))
      }
    } catch (e) {
      console.error('恢复失败:', e)
    } finally {
      setSaving(false)
    }
  }

  const renderPageButtons = () => {
    const buttons: React.ReactNode[] = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1)
    for (let i = start; i <= end; i++) {
      buttons.push(
        <button key={i} className={i === page ? styles.pageBtnActive : styles.pageBtn} onClick={() => setPage(i)}>{i}</button>
      )
    }
    return buttons
  }

  const displayProduct = (code: string) => aliases.products[code] || products.find(p => p.code === code)?.name || code
  const displayIndicator = (code: string) => aliases.indicators[code] || indicators.find(i => i.code === code)?.name || code

  const getSpecLimit = (productCode: string, indicatorCode: string) => {
    const productLimits = specLimits[productCode]
    return productLimits?.[indicatorCode] ?? null
  }

  const handleToggleSign = useCallback(() => {
    setCorrectionEdit(prev => prev ? { ...prev, sign: prev.sign === '+' ? '-' : '+' } : null)
  }, [])

  const handleCorrectionValueChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '')
    const parts = sanitized.split('.')
    const cleanValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : sanitized
    setCorrectionEdit(prev => prev ? { ...prev, value: cleanValue } : null)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelActions}>
            <select className={styles.select} value={filter.product_code} onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))} aria-label="筛选品项">
              <option value="">全部品项</option>
              {enabledProducts.map(p => <option key={p.code} value={p.code}>{aliases.products[p.code] || p.name}</option>)}
            </select>
            <select className={styles.select} value={filter.indicator_code} onChange={e => setFilter(f => ({ ...f, indicator_code: e.target.value }))} aria-label="筛选指标">
              <option value="">全部指标</option>
              {filterIndicators.map(i => <option key={i.code} value={i.code}>{aliases.indicators[i.code] || i.name}</option>)}
            </select>
            <input className={styles.dateInput} type="date" value={filter.date_from} onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} aria-label="开始日期" />
            <span className={styles.dateSep}>—</span>
            <input className={styles.dateInput} type="date" value={filter.date_to} onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} aria-label="结束日期" />
            <button className={styles.btnSearch} onClick={handleSearch} disabled={loading}>
              {loading ? '查询中...' : '查询'}
            </button>
            <button className={styles.btnGhost} onClick={() => handleExport('csv')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              导出CSV
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="检测数据表">
            <thead>
              <tr>
                <th>序号</th>
                <th>检测时间</th>
                <th>品项</th>
                <th>指标</th>
                <th>采集值</th>
                <th>修正值</th>
                <th>最终值</th>
                <th>样品编号</th>
                <th>备注</th>
                <th>单位</th>
                <th>规格上限</th>
                <th>规格下限</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className={styles.loadingRow}>加载中...</td></tr>
              ) : !hasSearched ? (
                <tr><td colSpan={14} className={styles.emptyRow}>请设置筛选条件后点击查询</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={14} className={styles.emptyRow}>暂无数据</td></tr>
              ) : visibleData.map((row, idx) => {
                const spec = getSpecLimit(row.product_code, row.indicator_code)
                const usl = spec?.usl ?? row.upper_limit
                const lsl = spec?.lsl ?? row.lower_limit
                const isCorrectionEditing = correctionEdit?.recordId === row.id
                const isFieldEditing = fieldEdit?.recordId === row.id
                return (
                  <tr key={row.id} className={row.is_voided ? styles.rowVoided : ''}>
                    <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td>{new Date(row.sample_time).toLocaleString('zh-CN')}</td>
                    <td><span className={styles.tagBlue}>{displayProduct(row.product_code)}</span></td>
                    <td><span className={styles.tagCyan}>{displayIndicator(row.indicator_code)}</span></td>
                    <td className={styles.monoCell}>{(row.raw_value ?? row.value)?.toFixed(4)}</td>
                    <td>
                      {isCorrectionEditing ? (
                        <div className={styles.signInputGroup}>
                          <button type="button" className={`${styles.signBtn} ${correctionEdit.sign === '+' ? styles.signBtnPositive : styles.signBtnNegative}`} onClick={handleToggleSign}>{correctionEdit.sign}</button>
                          <input type="text" inputMode="decimal" className={styles.valueInput} value={correctionEdit.value} onChange={e => handleCorrectionValueChange(e.target.value)} autoFocus />
                        </div>
                      ) : (
                        <span className={row.correction ? (row.correction > 0 ? styles.correctionPositive : styles.correctionNegative) : ''}>{formatCorrection(row.correction)}</span>
                      )}
                    </td>
                    <td className={styles.monoCell}>{row.value?.toFixed(4)}</td>
                    {isFieldEditing ? (
                      <>
                        <td><input className={styles.inlineInput} value={fieldEdit.sample_id} onChange={e => setFieldEdit(prev => prev ? { ...prev, sample_id: e.target.value } : null)} placeholder="样品编号" /></td>
                        <td><input className={styles.inlineInput} value={fieldEdit.remark} onChange={e => setFieldEdit(prev => prev ? { ...prev, remark: e.target.value } : null)} placeholder="备注" /></td>
                        <td><input className={styles.inlineInput} value={fieldEdit.unit} onChange={e => setFieldEdit(prev => prev ? { ...prev, unit: e.target.value } : null)} /></td>
                        <td><input className={styles.inlineInput} type="text" inputMode="decimal" value={fieldEdit.upper_limit} onChange={e => { const v = e.target.value.replace(/[^0-9.\-]/g, ''); setFieldEdit(prev => prev ? { ...prev, upper_limit: v } : null) }} /></td>
                        <td><input className={styles.inlineInput} type="text" inputMode="decimal" value={fieldEdit.lower_limit} onChange={e => { const v = e.target.value.replace(/[^0-9.\-]/g, ''); setFieldEdit(prev => prev ? { ...prev, lower_limit: v } : null) }} /></td>
                      </>
                    ) : (
                      <>
                        <td>{row.sample_id || '-'}</td>
                        <td>{row.remark || '-'}</td>
                        <td>{row.unit || '-'}</td>
                        <td>{usl != null ? usl.toFixed(4) : '-'}</td>
                        <td>{lsl != null ? lsl.toFixed(4) : '-'}</td>
                      </>
                    )}
                    <td><span className={row.is_voided ? styles.tagGray : row.is_qualified ? styles.tagGreen : styles.tagRed}>{row.is_voided ? '已作废' : row.is_qualified ? '正常' : '越限'}</span></td>
                    <td>
                      {row.is_voided ? (
                        <div className={styles.actionBtns}>
                          <button className={styles.btnUnvoidSmall} onClick={() => handleUnvoid(row.id)} title="恢复此条记录">复</button>
                        </div>
                      ) : isCorrectionEditing ? (
                        <div className={styles.actionBtns}>
                          <button className={styles.btnSave} onClick={handleSaveCorrection} disabled={saving}>{saving ? '...' : '✓'}</button>
                          <button className={styles.btnCancel} onClick={handleCancelEdit}>✕</button>
                        </div>
                      ) : isFieldEditing ? (
                        <div className={styles.actionBtns}>
                          <button className={styles.btnSave} onClick={handleSaveFields} disabled={saving}>{saving ? '...' : '✓'}</button>
                          <button className={styles.btnCancel} onClick={handleCancelEdit}>✕</button>
                        </div>
                      ) : (
                        <div className={styles.actionBtns}>
                          <button className={styles.btnEditSmall} onClick={() => handleEditCorrection(row)} title="修改修正值">修</button>
                          <button className={styles.btnEditSmall} onClick={() => handleEditFields(row)} title="编辑样品编号、备注、单位和规格限">编</button>
                          <button className={styles.btnVoidSmall} onClick={() => setVoidConfirmId(row.id)} title="作废此条记录">废</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>显示 {startIdx} - {endIdx} 条，共 {total} 条</span>
            <div className={styles.paginationBtns}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
              {renderPageButtons()}
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
            </div>
          </div>
        )}
      </div>

      {/* ---- 作废确认弹窗 ---- */}
      {voidConfirmId !== null && (
        <div className={styles.modalOverlay} onClick={() => setVoidConfirmId(null)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="作废数据">
            <div className={styles.modalTitle}>作废数据</div>
            <div className={styles.modalBody}>
              <p>确认将此条记录标记为作废？作废后该数据不参与SPC计算和统计分析。</p>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setVoidConfirmId(null)}>取消</button>
              <button className={styles.modalConfirm} onClick={handleVoid} disabled={saving}>{saving ? '处理中...' : '确认作废'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function round(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

export default DataPage
