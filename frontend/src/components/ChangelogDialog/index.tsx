import { useEffect, useMemo } from 'react'
import changelogRaw from '../../../../CHANGELOG.md?raw'
import styles from './ChangelogDialog.module.css'

interface ChangelogSection {
  title: string
  items: string[]
}

interface ChangelogVersion {
  version: string
  date?: string
  sections: ChangelogSection[]
}

const SECTION_LABELS: Record<string, string> = {
  Fixed: '修复',
  Security: '安全',
  Added: '新增',
  Changed: '变更',
  Removed: '移除',
  Deprecated: '废弃',
  Performance: '性能',
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

function parseChangelog(md: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = []
  let current: ChangelogVersion | null = null
  let currentSection: ChangelogSection | null = null

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    const versionMatch = line.match(/^##\s+\[?([^\]\s]+)\]?\s*(?:-\s*(.+))?$/)
    if (versionMatch) {
      const ver = versionMatch[1]
      // 跳过 Unreleased 占位节
      if (/^unreleased$/i.test(ver)) {
        current = null
        currentSection = null
        continue
      }
      current = {
        version: ver,
        date: versionMatch[2]?.trim() || undefined,
        sections: [],
      }
      versions.push(current)
      currentSection = null
      continue
    }
    if (!current) continue

    const sectionMatch = line.match(/^###\s+(.+)$/)
    if (sectionMatch) {
      const rawTitle = sectionMatch[1].trim()
      currentSection = {
        title: SECTION_LABELS[rawTitle] || rawTitle,
        items: [],
      }
      current.sections.push(currentSection)
      continue
    }

    const itemMatch = line.match(/^-\s+(.+)$/)
    if (itemMatch && currentSection) {
      currentSection.items.push(stripMarkdown(itemMatch[1].trim()))
    }
  }

  return versions
}

export function ChangelogDialog({
  open,
  currentVersion,
  onClose,
}: {
  open: boolean
  currentVersion: string
  onClose: () => void
}) {
  const versions = useMemo(() => parseChangelog(changelogRaw), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>历史更新日志</h3>
            <p className={styles.subtitle}>当前版本 {currentVersion}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {versions.length === 0 ? (
            <p className={styles.empty}>暂无更新日志</p>
          ) : (
            versions.map((ver) => {
              const isCurrent = ver.version.replace(/^v/, '') === currentVersion.replace(/^v/, '')
              return (
                <section
                  key={ver.version}
                  className={`${styles.versionBlock} ${isCurrent ? styles.versionCurrent : ''}`}
                >
                  <div className={styles.versionHeader}>
                    <span className={styles.versionTag}>
                      {ver.version.startsWith('v') ? ver.version : `v${ver.version}`}
                      {isCurrent && <span className={styles.currentBadge}>当前</span>}
                    </span>
                    {ver.date && <span className={styles.versionDate}>{ver.date}</span>}
                  </div>
                  {ver.sections.map((section, sIdx) => (
                    <div key={`${ver.version}-${section.title}-${sIdx}`} className={styles.section}>
                      <div className={styles.sectionTitle}>{section.title}</div>
                      <ul className={styles.itemList}>
                        {section.items.map((item, idx) => (
                          <li key={idx} className={styles.item}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
