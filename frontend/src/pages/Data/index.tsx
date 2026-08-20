import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import { useProducts, useIndicators } from '../../hooks'
import type { MonitorData } from '../../types'
import styles from './Data.module.css'

const PAGE_SIZE = 20

export const DataPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()

  const [data, setData] = useState<MonitorData[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: '',
    date: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getRecentData({
        product_code: filter.product_code,
        indicator_code: filter.indicator_code,
        limit: 500,
      })
      const rows = Array.isArray(result) ? result : result.data || []
      setData(rows)
      setPage(1)
    } catch (e) {
      console.error('获取数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [filter.product_code, filter.indicator_code])

  // Auto-fetch when product or indicator changes
  useEffect(() => {
    if (filter.product_code && filter.indicator_code) {
      fetchData()
    }
  }, [fetchData, filter.product_code, filter.indicator_code])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const pagedData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const startIdx = data.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(page * PAGE_SIZE, data.length)

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

  // Build pagination buttons
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
        <button
          key={i}
          className={i === page ? styles.pageBtnActive : styles.pageBtn}
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      )
    }
    return buttons
  }

  const productName = (code: string) =>
    products.find(p => p.code === code)?.name || code
  const indicatorName = (code: string) =>
    indicators.find(i => i.code === code)?.name || code

  return (
    <div className={styles.page}>
      {/* Filter panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelIcon}>💾</span>
            FT1 数据管理
          </div>
          <div className={styles.panelActions}>
            <select
              className={styles.select}
              value={filter.product_code}
              onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))}
            >
              <option value="">全部品项</option>
              {products.map(p => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <select
              className={styles.select}
              value={filter.indicator_code}
              onChange={e => setFilter(f => ({ ...f, indicator_code: e.target.value }))}
            >
              <option value="">全部指标</option>
              {indicators.map(i => (
                <option key={i.code} value={i.code}>{i.name}</option>
              ))}
            </select>
            <input
              className={styles.dateInput}
              type="date"
              value={filter.date}
              onChange={e => setFilter(f => ({ ...f, date: e.target.value }))}
            />
            <button className={styles.btnPrimary} onClick={fetchData}>
              🔍 查询
            </button>
            <button className={styles.btnGhost} onClick={() => handleExport('csv')}>
              📥 导出CSV
            </button>
            <button className={styles.btnGhost} onClick={() => handleExport('excel')}>
              📊 导出Excel
            </button>
          </div>
        </div>

        {/* Data table */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>序号</th>
                <th>采集时间</th>
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
                  <td colSpan={10} className={styles.loadingRow}>
                    加载中...
                  </td>
                </tr>
              ) : pagedData.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyRow}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                pagedData.map((row, idx) => (
                  <tr key={row.id}>
                    <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td>{new Date(row.sample_time).toLocaleString('zh-CN')}</td>
                    <td>
                      <span className={styles.tagBlue}>
                        {row.product_name || productName(row.product_code)}
                      </span>
                    </td>
                    <td>
                      <span className={styles.tagCyan}>
                        {row.indicator_name || indicatorName(row.indicator_code)}
                      </span>
                    </td>
                    <td>{row.value?.toFixed(4)}</td>
                    <td>{row.unit || '-'}</td>
                    <td>{row.upper_limit != null ? row.upper_limit.toFixed(4) : '-'}</td>
                    <td>{row.lower_limit != null ? row.lower_limit.toFixed(4) : '-'}</td>
                    <td>
                      <span className={row.is_qualified ? styles.tagGreen : styles.tagRed}>
                        {row.is_qualified ? '正常' : '越限'}
                      </span>
                    </td>
                    <td>系统采集</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data.length > 0 && (
          <div className={styles.pagination}>
            <span className={styles.paginationInfo}>
              显示 {startIdx} - {endIdx} 条，共 {data.length} 条
            </span>
            <div className={styles.paginationBtns}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {renderPageButtons()}
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
