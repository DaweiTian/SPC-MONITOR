import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services'
import { withRetry } from '../utils/retry'
import type { Indicator } from '../types'

export function useIndicators() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    withRetry(() => api.getIndicators())
      .then(res => { if (mountedRef.current) setIndicators(res.indicators || []) })
      .catch(e => { if (mountedRef.current) setError(e.message) })
      .finally(() => { if (mountedRef.current) setLoading(false) })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  return { indicators, loading, error, refetch: fetch }
}
