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
  const [currentProduct, setCurrentProductState] = useState('自动轮换')
  const [currentProductCode, setCurrentProductCode] = useState('')
  const [collectionFrequency, setCollectionFrequencyState] = useState('L0 · 5min')

  const setCurrentProduct = useCallback((name: string, code: string) => {
    setCurrentProductState(name)
    setCurrentProductCode(code)
  }, [])

  const setCollectionFrequency = useCallback((freq: string) => {
    setCollectionFrequencyState(freq)
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
