import React, { useState, useEffect, useCallback } from 'react'

interface TocItem {
  id: string
  title: string
}

interface FloatingTocProps {
  items: TocItem[]
}

export const FloatingToc: React.FC<FloatingTocProps> = ({ items }) => {
  const [activeId, setActiveId] = useState<string>('')
  const [collapsed, setCollapsed] = useState(false)

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
    <div style={styles.container}>
      <button
        style={styles.toggle}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? '展开目录' : '收起目录'}
      >
        {collapsed ? '☰' : '✕'}
      </button>
      {!collapsed && (
        <div style={styles.panel}>
          <div style={styles.title}>目录</div>
          {items.map(item => (
            <button
              key={item.id}
              style={{
                ...styles.item,
                ...(activeId === item.id ? styles.itemActive : {}),
              }}
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'sticky',
    top: 8,
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    float: 'left',
    marginLeft: -8,
    marginBottom: -60,
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--border-color, #1e293b)',
    background: 'var(--bg-card, #141a2a)',
    color: 'var(--text-secondary, #94a3b8)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: 160,
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
    background: 'var(--bg-card, #141a2a)',
    border: '1px solid var(--border-color, #1e293b)',
    borderRadius: 10,
    padding: '8px 0',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted, #64748b)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    padding: '4px 14px 8px',
    borderBottom: '1px solid var(--border-color, #1e293b)',
    marginBottom: 4,
  },
  item: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '6px 14px',
    fontSize: 12,
    color: 'var(--text-muted, #94a3b8)',
    background: 'transparent',
    border: 'none',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    lineHeight: 1.4,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemActive: {
    color: '#00d4ff',
    borderLeftColor: '#00d4ff',
    background: 'rgba(0,212,255,0.08)',
    fontWeight: 600,
  },
}

export default FloatingToc
