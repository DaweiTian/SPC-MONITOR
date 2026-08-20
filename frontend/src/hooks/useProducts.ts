import { useState, useEffect } from 'react'
import { api } from '../services'
import type { Product } from '../types'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProducts()
      .then(res => setProducts(res.products || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { products, loading }
}
