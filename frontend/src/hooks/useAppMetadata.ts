import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

export function useAppMetadata() {
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [productStatus, setProductStatus] = useState<Record<string, string>>({})
  const [specLimits, setSpecLimits] = useState<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getAliases(),
      api.getProductStatus(),
      api.getSpecLimits(),
    ]).then(([aliasData, statusData, limitsData]) => {
      setAliases(aliasData)
      setProductStatus(statusData)
      setSpecLimits(limitsData)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const getIndicatorName = useCallback(
    (code: string) => aliases.indicators[code] || code,
    [aliases.indicators]
  )

  return { aliases, productStatus, specLimits, loading, getIndicatorName }
}
