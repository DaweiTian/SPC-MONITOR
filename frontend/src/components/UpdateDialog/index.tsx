import { useState, useEffect } from 'react'
import styles from './UpdateDialog.module.css'

interface UpdateInfo {
  version: string
  notes: string | null
}

export function UpdateDialog() {
  const [visible, setVisible] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!window.__TAURI__) return

    const unlisten = window.__TAURI__.event.listen('update-ready', (event) => {
      const info = (event as unknown as { payload: UpdateInfo }).payload
      setUpdateInfo(info)
      setVisible(true)
    })

    return () => { unlisten.then(fn => fn()) }
  }, [])

  const handleInstall = async () => {
    if (!window.__TAURI__) return
    setInstalling(true)
    try {
      await window.__TAURI__.core.invoke('install_update')
    } catch (e) {
      console.error('安装更新失败:', e)
      setInstalling(false)
    }
  }

  const handleLater = () => {
    setVisible(false)
  }

  if (!visible || !updateInfo) return null

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
        <h3>新版本已就绪</h3>
        <p className={styles.version}>v{updateInfo.version}</p>
        {updateInfo.notes && (
          <div className={styles.notes}>
            <p className={styles.notesLabel}>更新内容：</p>
            <p className={styles.notesText}>{updateInfo.notes}</p>
          </div>
        )}
        <p className={styles.desc}>更新将在应用重启后生效</p>

        <div className={styles.actions}>
          <button className={styles.btnLater} onClick={handleLater} disabled={installing}>
            稍后
          </button>
          <button className={styles.btnUpdate} onClick={handleInstall} disabled={installing}>
            {installing ? '正在安装...' : '立即更新'}
          </button>
        </div>
      </div>
    </div>
  )
}
