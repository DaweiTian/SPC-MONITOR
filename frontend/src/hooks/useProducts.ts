import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../services'
import { withRetry } from '../utils/retry'
import type { Product } from '../types'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetch = useCallback(() => {
    setLoading(true)
    setError(null)
    withRetry(() => api.getProducts())
      .then(res => { if (mountedRef.current) setProducts(res.products || []) })
      .catch(e => { if (mountedRef.current) setError(e.message) })
      .finally(() => { if (mountedRef.current) setLoading(false) })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  return { products, loading, error, refetch: fetch }
}
