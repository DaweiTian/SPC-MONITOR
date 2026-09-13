import { useEffect } from 'react'
import styles from '../UpdateDialog/UpdateDialog.module.css'

interface UpdateInfo {
  version: string
  notes: string | null
  isIncremental?: boolean
  downloadSize?: number | null
}

export function AvailableUpdateDialog({
  info,
  downloading,
  onCancel,
  onDownload,
}: {
  info: UpdateInfo
  downloading: boolean
  onCancel: () => void
  onDownload: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !downloading) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [downloading, onCancel])

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.icon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h3>发现新版本</h3>
        <p className={styles.version}>v{info.version}</p>
        {info.isIncremental && (
          <p className={styles.desc}>
            支持增量下载
            {info.downloadSize
              ? `（约 ${Math.max(1, Math.round(info.downloadSize / 1024 / 1024))} MB）`
              : ''}
          </p>
        )}
        {info.notes && (
          <div className={styles.notes}>
            <p className={styles.notesLabel}>更新内容：</p>
            <p className={styles.notesText}>{info.notes}</p>
          </div>
        )}
        <p className={styles.desc}>
          {downloading ? '正在下载，请勿关闭应用…' : '是否立即下载？下载完成后会提示安装'}
        </p>

        <div className={styles.actions}>
          <button className={styles.btnLater} onClick={onCancel} disabled={downloading}>
            稍后
          </button>
          <button className={styles.btnUpdate} onClick={onDownload} disabled={downloading}>
            {downloading ? '下载中…' : '立即下载'}
          </button>
        </div>
      </div>
    </div>
  )
}
