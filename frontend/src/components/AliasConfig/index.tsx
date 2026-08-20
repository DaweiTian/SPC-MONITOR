import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import styles from './AliasConfig.module.css'

interface AliasConfigProps {
  products: Array<{ code: string; name: string }>
  indicators: Array<{ code: string; name: string }>
  onUpdate: () => void
  mode?: 'products' | 'indicators'
}

export const AliasConfig: React.FC<AliasConfigProps> = ({ products, indicators, onUpdate, mode }) => {
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [loading, setLoading] = useState(false)
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [editingIndicator, setEditingIndicator] = useState<string | null>(null)
  const [tempAlias, setTempAlias] = useState('')

  /* ── 获取别名配置 ── */
  const fetchAliases = useCallback(async () => {
    try {
      const data = await api.getAliases()
      setAliases(data)
    } catch (e) {
      console.error('获取别名配置失败:', e)
    }
  }, [])

  useEffect(() => {
    fetchAliases()
  }, [fetchAliases])

  /* ── 更新品项别名 ── */
  const handleUpdateProductAlias = async (productCode: string) => {
    setLoading(true)
    try {
      await api.updateProductAlias(productCode, tempAlias)
      setAliases(prev => {
        const newProducts = { ...prev.products }
        if (tempAlias) {
          newProducts[productCode] = tempAlias
        } else {
          delete newProducts[productCode]
        }
        return { ...prev, products: newProducts }
      })
      setEditingProduct(null)
      setTempAlias('')
      onUpdate()
    } catch (e) {
      console.error('更新品项别名失败:', e)
    } finally {
      setLoading(false)
    }
  }

  /* ── 更新指标别名 ── */
  const handleUpdateIndicatorAlias = async (indicatorCode: string) => {
    setLoading(true)
    try {
      await api.updateIndicatorAlias(indicatorCode, tempAlias)
      setAliases(prev => {
        const newIndicators = { ...prev.indicators }
        if (tempAlias) {
          newIndicators[indicatorCode] = tempAlias
        } else {
          delete newIndicators[indicatorCode]
        }
        return { ...prev, indicators: newIndicators }
      })
      setEditingIndicator(null)
      setTempAlias('')
      onUpdate()
    } catch (e) {
      console.error('更新指标别名失败:', e)
    } finally {
      setLoading(false)
    }
  }

  /* ── 开始编辑 ── */
  const startEditProduct = (code: string) => {
    setEditingProduct(code)
    setTempAlias(aliases.products[code] || '')
  }

  const startEditIndicator = (code: string) => {
    setEditingIndicator(code)
    setTempAlias(aliases.indicators[code] || '')
  }

  /* ── 取消编辑 ── */
  const cancelEdit = () => {
    setEditingProduct(null)
    setEditingIndicator(null)
    setTempAlias('')
  }

  return (
    <div className={styles.aliasConfig}>
      {/* 品项别名配置 */}
      {mode !== 'indicators' && (
      <div className={styles.section}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品项编码</th>
                <th>原始名称</th>
                <th>别名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 20).map((product) => (
                <tr key={product.code}>
                  <td className={styles.codeCell}>{product.code}</td>
                  <td>{product.name}</td>
                  <td>
                    {editingProduct === product.code ? (
                      <input
                        type="text"
                        className={styles.input}
                        value={tempAlias}
                        onChange={e => setTempAlias(e.target.value)}
                        placeholder="输入别名"
                        autoFocus
                      />
                    ) : (
                      <span className={styles.aliasValue}>
                        {aliases.products[product.code] || '-'}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingProduct === product.code ? (
                      <div className={styles.actions}>
                        <button
                          className={styles.btnPrimary}
                          onClick={() => handleUpdateProductAlias(product.code)}
                          disabled={loading}
                        >
                          保存
                        </button>
                        <button
                          className={styles.btnSecondary}
                          onClick={cancelEdit}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.btnEdit}
                        onClick={() => startEditProduct(product.code)}
                      >
                        编辑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 指标别名配置 */}
      {mode !== 'products' && (
      <div className={styles.section}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>指标编码</th>
                <th>原始名称</th>
                <th>别名</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {indicators.map((indicator) => (
                <tr key={indicator.code}>
                  <td className={styles.codeCell}>{indicator.code}</td>
                  <td>{indicator.name}</td>
                  <td>
                    {editingIndicator === indicator.code ? (
                      <input
                        type="text"
                        className={styles.input}
                        value={tempAlias}
                        onChange={e => setTempAlias(e.target.value)}
                        placeholder="输入别名"
                        autoFocus
                      />
                    ) : (
                      <span className={styles.aliasValue}>
                        {aliases.indicators[indicator.code] || '-'}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingIndicator === indicator.code ? (
                      <div className={styles.actions}>
                        <button
                          className={styles.btnPrimary}
                          onClick={() => handleUpdateIndicatorAlias(indicator.code)}
                          disabled={loading}
                        >
                          保存
                        </button>
                        <button
                          className={styles.btnSecondary}
                          onClick={cancelEdit}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.btnEdit}
                        onClick={() => startEditIndicator(indicator.code)}
                      >
                        编辑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
