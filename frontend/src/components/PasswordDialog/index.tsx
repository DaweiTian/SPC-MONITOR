import { useState } from 'react'
import styles from './PasswordDialog.module.css'

interface PasswordDialogProps {
  onVerify: (password: string) => Promise<boolean>
  onClose?: () => void
}

export function PasswordDialog({ onVerify }: PasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    setError('')

    const success = await onVerify(password)
    if (!success) {
      setError('密码错误，请重试')
      setPassword('')
    }
    setLoading(false)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.icon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3>需要访问密码</h3>
        <p className={styles.desc}>此设备已启用共享密码保护，请输入密码以继续访问</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="请输入共享密码"
              className={styles.input}
              autoFocus
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} className={styles.btn}>
            {loading ? '验证中...' : '验证'}
          </button>
        </form>
      </div>
    </div>
  )
}
