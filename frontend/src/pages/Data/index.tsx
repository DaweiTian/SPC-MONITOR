import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import { useProducts, useIndicators } from '../../hooks'
import type { MonitorData } from '../../types'
import styles from './Data.module.css'

const PAGE_SIZE = 20

export const DataPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()

  const today = new Date().toISOString().split('T')[0]
  const [data, setData] = useState<MonitorData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [productStatus, setProductStatus] = useState<Record<string, string>>({})
  const [specLimits, setSpecLimits] = useState<Record<string, Record<string, { lsl?: number; usl?: number }>>>({})

  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: '',
    date: today,
  })

  // Load aliases, product status, and spec limits
  useEffect(() => {
    api.getAliases().then(setAliases).catch(() => {})
    api.getProductStatus().then(setProductStatus).catch(() => {})
    api.getSpecLimits().then(setSpecLimits).catch(() => {})
  }, [])

  // Filter out disabled products
  const enabledProducts = products.filter(p => productStatus[p.code] !== 'disabled')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getDataList({
        page,
        page_size: PAGE_SIZE,
        date: filter.date || undefined,
        product_code: filter.product_code || undefined,
        indicator_code: filter.indicator_code || undefined,
      })
      setData(result.data || [])
      setTotal(result.total || 0)
    } catch (e) {
      console.error('获取数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [filter.product_code, filter.indicator_code, filter.date, page])

  // Auto-fetch when filters or page changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [filter.product_code, filter.indicator_code, filter.date])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(page * PAGE_SIZE, total)

  // Export
  const handleExport = async (format: 'csv' | 'excel') => {
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
  }

  const renderPageButtons = () => {
    const buttons: React.ReactNode[] = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      buttons.push(
        <button key={i} className={i === page ? styles.pageBtnActive : styles.pageBtn} onClick={() => setPage(i)}>
          {i}
        </button>
      )
    }
    return buttons
  }

  // Display helpers with aliases
  const displayProduct = (code: string) => aliases.products[code] || products.find(p => p.code === code)?.name || code
  const displayIndicator = (code: string) => aliases.indicators[code] || indicators.find(i => i.code === code)?.name || code

  // Get spec limits for a product/indicator from config
  const getSpecLimit = (productCode: string, indicatorCode: string) => {
    const productLimits = specLimits[productCode]
    if (productLimits && productLimits[indicatorCode]) {
      return productLimits[indicatorCode]
    }
    return null
  }

  return (
    <div className={styles.page}>
      {/* Filter panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelActions}>
            <select
              className={styles.select}
              value={filter.product_code}
              onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))}
            >
              <option value="">全部品项</option>
              {enabledProducts.map(p => (
                <option key={p.code} value={p.code}>{aliases.products[p.code] || p.name}</option>
              ))}
            </select>
            <select
              className={styles.select}
              value={filter.indicator_code}
              onChange={e => setFilter(f => ({ ...f, indicator_code: e.target.value }))}
            >
              <option value="">全部指标</option>
              {indicators.map(i => (
                <option key={i.code} value={i.code}>{aliases.indicators[i.code] || i.name}</option>
              ))}
            </select>
            <input
              className={styles.dateInput}
              type="date"
              value={filter.date}
              onChange={e => setFilter(f => ({ ...f, date: e.target.value }))}
            />
            <button className={styles.btnGhost} onClick={() => handleExport('csv')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出CSV
            </button>
            <button className={styles.btnGhost} onClick={() => handleExport('excel')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              导出Excel
            </button>
          </div>
        </div>

        {/* Data table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>序号</th>
                <th>检测时间</th>
                <th>品项</th>
                <th>指标</th>
                <th>检测值</th>
                <th>单位</th>
                <th>规格上限</th>
                <th>规格下限</th>
                <th>状态</th>
                <th>数据来源</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className={styles.loadingRow}>加载中...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyRow}>暂无数据</td>
                </tr>
              ) : (
                data.map((row, idx) => {
                  const spec = getSpecLimit(row.product_code, row.indicator_code)
                  const usl = spec?.usl ?? row.upper_limit
                  const lsl = spec?.lsl ?? row.lower_limit
                  return (
                    <tr key={row.id}>
                      <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td>{new Date(row.sample_time).toLocaleString('zh-CN')}</td>
                      <td><span className={styles.tagBlue}>{displayProduct(row.product_code)}</span></td>
                      <td><span className={styles.tagCyan}>{displayIndicator(row.indicator_code)}</span></td>
                      <td>{row.value?.toFixed(4)}</td>
                      <td>{row.unit || '-'}</td>
                      <td>{usl != null ? usl.toFixed(4) : '-'}</td>
                      <td>{lsl != null ? lsl.toFixed(4) : '-'}</td>
                      <td>
                        <span className={row.is_qualified ? styles.tagGreen : styles.tagRed}>
                          {row.is_qualified ? '正常' : '越限'}
                        </span>
                      </td>
                      <td>系统采集</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              显示 {startIdx} - {endIdx} 条，共 {total} 条
            </span>
            <div className={styles.paginationBtns}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
              {renderPageButtons()}
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
