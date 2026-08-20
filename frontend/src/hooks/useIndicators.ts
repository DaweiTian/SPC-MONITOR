import { useState, useEffect } from 'react'
import { api } from '../services'
import type { Indicator } from '../types'

export function useIndicators() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getIndicators()
      .then(res => setIndicators(res.indicators || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { indicators, loading }
}
