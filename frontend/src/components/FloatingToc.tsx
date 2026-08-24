import React, { useState, useEffect, useCallback } from 'react'
import styles from './FloatingToc.module.css'

interface TocItem {
  id: string
  title: string
}

interface FloatingTocProps {
  items: TocItem[]
}

export const FloatingToc: React.FC<FloatingTocProps> = ({ items }) => {
  const [activeId, setActiveId] = useState<string>('')
  const [collapsed, setCollapsed] = useState(true)

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const visible = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio)
          } else {
            visible.delete(entry.target.id)
          }
        })
        // Pick the most visible section
        let bestId = ''
        let bestRatio = 0
        visible.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestId = id
          }
        })
        if (bestId) setActiveId(bestId)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-80px 0px -60% 0px' }
    )

    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    observers.push(observer)

    return () => observers.forEach(o => o.disconnect())
  }, [items])

  return (
    <div className={styles.container}>
      <button
        className={styles.toggle}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? '展开目录' : '收起目录'}
      >
        {collapsed ? '☰' : '✕'}
      </button>
      {!collapsed && (
        <div className={styles.panel}>
          <div className={styles.title}>目录</div>
          {items.map(item => (
            <button
              key={item.id}
              className={`${styles.item} ${activeId === item.id ? styles.itemActive : ''}`}
              onClick={() => handleClick(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default FloatingToc
