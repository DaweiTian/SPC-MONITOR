import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AppState {
  currentProduct: string
  currentProductCode: string
  collectionFrequency: string
  setCurrentProduct: (name: string, code: string) => void
  setCollectionFrequency: (freq: string) => void
}

const AppContext = createContext<AppState | null>(null)

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentProduct, setCurrentProductState] = useState(() => {
    return localStorage.getItem('app_current_product') || '自动轮换'
  })
  const [currentProductCode, setCurrentProductCode] = useState(() => {
    return localStorage.getItem('app_current_product_code') || ''
  })
  const [collectionFrequency, setCollectionFrequencyState] = useState(() => {
    return localStorage.getItem('app_collection_frequency') || 'L0 · 5min'
  })

  const setCurrentProduct = useCallback((name: string, code: string) => {
    setCurrentProductState(name)
    setCurrentProductCode(code)
    localStorage.setItem('app_current_product', name)
    localStorage.setItem('app_current_product_code', code)
  }, [])

  const setCollectionFrequency = useCallback((freq: string) => {
    setCollectionFrequencyState(freq)
    localStorage.setItem('app_collection_frequency', freq)
  }, [])

  return (
    <AppContext.Provider value={{
      currentProduct,
      currentProductCode,
      collectionFrequency,
      setCurrentProduct,
      setCollectionFrequency,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}
