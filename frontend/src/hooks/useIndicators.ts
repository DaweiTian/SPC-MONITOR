import { useState, useEffect, useCallback } from 'react'
import { api } from '../services'
import type { Indicator } from '../types'

export function useIndicators() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    api.getIndicators()
      .then(res => setIndicators(res.indicators || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { indicators, loading, error, refetch: fetch }
}
