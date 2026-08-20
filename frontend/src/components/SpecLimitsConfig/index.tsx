import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import type { Indicator } from '../../types'
import styles from './SpecLimitsConfig.module.css'

interface SpecLimit {
  lsl?: number
  usl?: number
}

interface SpecLimitsConfigProps {
  indicators: Indicator[]
}

export const SpecLimitsConfig: React.FC<SpecLimitsConfigProps> = ({ indicators }) => {
  const [specLimits, setSpecLimits] = useState<Record<string, SpecLimit>>({})
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [limits, aliasData] = await Promise.all([
        api.getSpecLimits().catch(() => ({})),
        api.getAliases().catch(() => ({ products: {}, indicators: {} })),
      ])
      setSpecLimits(limits)
      setAliases(aliasData.indicators || {})
    } catch (e) {
      console.error('加载规格限配置失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSave = async (indicatorCode: string, lsl: string, usl: string) => {
    setSaving(indicatorCode)
    try {
      const limits: SpecLimit = {}
      if (lsl !== '') limits.lsl = parseFloat(lsl)
      if (usl !== '') limits.usl = parseFloat(usl)
      
      await api.updateSingleSpecLimit(indicatorCode, limits)
      
      setSpecLimits(prev => ({
        ...prev,
        [indicatorCode]: limits,
      }))
    } catch (e) {
      console.error('保存规格限失败:', e)
      alert('保存失败')
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (indicatorCode: string) => {
    setSaving(indicatorCode)
    try {
      await api.updateSingleSpecLimit(indicatorCode, {})
      setSpecLimits(prev => {
        const next = { ...prev }
        delete next[indicatorCode]
        return next
      })
    } catch (e) {
      console.error('删除规格限失败:', e)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return <div className={styles.loading}>加载中...</div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.description}>
          为每个检验项目配置规格上下限（LSL/USL），用于过程能力分析（CPK/PPK）计算。
        </p>
      </div>
      
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span className={styles.colName}>检验项目</span>
          <span className={styles.colAlias}>别名</span>
          <span className={styles.colLimit}>下限 (LSL)</span>
          <span className={styles.colLimit}>上限 (USL)</span>
          <span className={styles.colAction}>操作</span>
        </div>
        
        {indicators.map(ind => {
          const limits = specLimits[ind.code] || {}
          const alias = aliases[ind.code] || ''
          
          return (
            <SpecLimitRow
              key={ind.code}
              indicator={ind}
              alias={alias}
              limits={limits}
              saving={saving === ind.code}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          )
        })}
        
        {indicators.length === 0 && (
          <div className={styles.empty}>暂无检验项目</div>
        )}
      </div>
    </div>
  )
}

interface SpecLimitRowProps {
  indicator: Indicator
  alias: string
  limits: SpecLimit
  saving: boolean
  onSave: (code: string, lsl: string, usl: string) => void
  onDelete: (code: string) => void
}

const SpecLimitRow: React.FC<SpecLimitRowProps> = ({ indicator, alias, limits, saving, onSave, onDelete }) => {
  const [lsl, setLsl] = useState(limits.lsl?.toString() ?? '')
  const [usl, setUsl] = useState(limits.usl?.toString() ?? '')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setLsl(limits.lsl?.toString() ?? '')
    setUsl(limits.usl?.toString() ?? '')
  }, [limits])

  const hasLimits = limits.lsl !== undefined || limits.usl !== undefined

  return (
    <div className={`${styles.row} ${hasLimits ? styles.rowConfigured : ''}`}>
      <span className={styles.colName}>
        {indicator.name}
        <code className={styles.code}>{indicator.code}</code>
      </span>
      <span className={styles.colAlias}>
        {alias || <span className={styles.muted}>-</span>}
      </span>
      <span className={styles.colLimit}>
        {editing ? (
          <input
            type="number"
            step="any"
            className={styles.input}
            value={lsl}
            onChange={e => setLsl(e.target.value)}
            placeholder="不限"
          />
        ) : (
          <span className={hasLimits ? styles.value : styles.muted}>
            {limits.lsl ?? '不限'}
          </span>
        )}
      </span>
      <span className={styles.colLimit}>
        {editing ? (
          <input
            type="number"
            step="any"
            className={styles.input}
            value={usl}
            onChange={e => setUsl(e.target.value)}
            placeholder="不限"
          />
        ) : (
          <span className={hasLimits ? styles.value : styles.muted}>
            {limits.usl ?? '不限'}
          </span>
        )}
      </span>
      <span className={styles.colAction}>
        {editing ? (
          <>
            <button
              className={styles.btnSave}
              disabled={saving}
              onClick={() => { onSave(indicator.code, lsl, usl); setEditing(false) }}
            >
              {saving ? '...' : '保存'}
            </button>
            <button
              className={styles.btnCancel}
              onClick={() => { setLsl(limits.lsl?.toString() ?? ''); setUsl(limits.usl?.toString() ?? ''); setEditing(false) }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button className={styles.btnEdit} onClick={() => setEditing(true)}>
              {hasLimits ? '编辑' : '配置'}
            </button>
            {hasLimits && (
              <button
                className={styles.btnDelete}
                disabled={saving}
                onClick={() => onDelete(indicator.code)}
              >
                清除
              </button>
            )}
          </>
        )}
      </span>
    </div>
  )
}
