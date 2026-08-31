import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services/api'
import { withRetry } from '../utils/retry'

export function useAppMetadata() {
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [productStatus, setProductStatus] = useState<Record<string, string>>({})
  const [specLimits, setSpecLimits] = useState<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>({})
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    withRetry(() => Promise.all([
      api.getAliases(),
      api.getProductStatus(),
      api.getSpecLimits(),
    ])).then(([aliasData, statusData, limitsData]) => {
      if (!mountedRef.current) return
      setAliases(aliasData)
      setProductStatus(statusData)
      setSpecLimits(limitsData)
    }).catch(console.error)
      .finally(() => { if (mountedRef.current) setLoading(false) })
    return () => { mountedRef.current = false }
  }, [])

  const getIndicatorName = useCallback(
    (code: string) => aliases.indicators[code] || code,
    [aliases.indicators]
  )

  return { aliases, productStatus, specLimits, loading, getIndicatorName }
}
