import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import { useToast } from '../../components/Toast'
import styles from './NetworkSettings.module.css'

interface NetworkConfig {
  host: string
  port: number
  local_ip: string
  shared_password: string
  password_enabled: boolean
}

const StatusTag: React.FC<{ label: string; color: 'green' | 'blue' | 'orange' | 'red' }> = ({ label, color }) => (
  <span className={`${styles.tag} ${styles[`tag${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}>
    <span className={`${styles.tagDot} ${styles[`tagDot${color.charAt(0).toUpperCase() + color.slice(1)}`]}`} />
    {label}
  </span>
)

export const NetworkSettings: React.FC = () => {
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [firewallLoading, setFirewallLoading] = useState(false)
  const { addToast } = useToast()

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getNetworkConfig()
      setConfig(data)
      setPasswordInput(data.shared_password || '')
    } catch {
      addToast({ title: '错误', message: '获取网络配置失败', severity: 'WARNING' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const isShared = config?.host === '0.0.0.0'
  const isPasswordEnabled = config?.password_enabled

  const handleToggleSharing = async () => {
    if (!config) return
    setSaving(true)
    try {
      const newHost = isShared ? '127.0.0.1' : '0.0.0.0'
      const result = await api.updateNetworkConfig({ host: newHost })
      if (result.success) {
        setConfig(prev => prev ? { ...prev, host: newHost } : prev)
        addToast({
          title: '成功',
          message: isShared
            ? '已关闭局域网共享，重启后仅本机可访问'
            : '已开启局域网共享，重启后局域网可访问',
          severity: 'INFO',
        })
      } else {
        addToast({ title: '错误', message: result.message || '更新失败', severity: 'WARNING' })
      }
    } catch {
      addToast({ title: '错误', message: '更新网络配置失败', severity: 'WARNING' })
    } finally {
      setSaving(false)
    }
  }

  const handleSavePassword = async () => {
    if (!config) return
    setSaving(true)
    try {
      const result = await api.updateNetworkConfig({ shared_password: passwordInput })
      if (result.success) {
        setConfig(prev => prev ? {
          ...prev,
          shared_password: passwordInput,
          password_enabled: !!passwordInput
        } : prev)
        addToast({
          title: '成功',
          message: passwordInput ? '共享密码已设置' : '共享密码已清除',
          severity: 'INFO',
        })
      } else {
        addToast({ title: '错误', message: result.message || '保存失败', severity: 'WARNING' })
      }
    } catch {
      addToast({ title: '错误', message: '保存密码失败', severity: 'WARNING' })
    } finally {
      setSaving(false)
    }
  }

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = address
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleOpenFirewall = async () => {
    setFirewallLoading(true)
    try {
      const result = await api.openFirewall()
      if (result.success) {
        addToast({ title: '成功', message: result.message, severity: 'INFO' })
      } else {
        addToast({ title: '失败', message: result.message, severity: 'WARNING' })
      }
    } catch {
      addToast({ title: '错误', message: '请求防火墙放行失败', severity: 'WARNING' })
    } finally {
      setFirewallLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardBody} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            加载中...
          </div>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.cardBody} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            无法获取网络配置
          </div>
        </div>
      </div>
    )
  }

  const lanAccessUrl = `http://${config.local_ip}:${config.port}`

  return (
    <div className={styles.page}>
      {/* 当前监听状态 */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            当前监听状态
          </span>
          <StatusTag
            label={isShared ? '局域网共享' : '仅本机'}
            color={isShared ? 'green' : 'blue'}
          />
        </div>
        <div className={styles.cardBody} style={{ padding: '24px' }}>
          <div className={styles.statusGrid}>
            <div className={styles.statusItem}>
              <div className={styles.statusLabel}>监听地址</div>
              <div className={styles.statusValueMono}>{config.host}</div>
            </div>
            <div className={styles.statusItem}>
              <div className={styles.statusLabel}>监听端口</div>
              <div className={styles.statusValueMono}>{config.port}</div>
            </div>
            <div className={styles.statusItem}>
              <div className={styles.statusLabel}>本机局域网 IP</div>
              <div className={styles.statusValueMono}>{config.local_ip}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 网络共享开关 */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            网络共享
          </span>
        </div>
        <div className={styles.cardBody} style={{ padding: '24px' }}>
          <div className={styles.sharingRow}>
            <div className={styles.sharingInfo}>
              <div className={styles.sharingTitle}>
                {isShared ? '已开启局域网共享' : '仅本机可访问'}
              </div>
              <div className={styles.sharingDesc}>
                {isShared
                  ? '当前服务监听 0.0.0.0，同一局域网内的其他设备可通过浏览器访问本系统。'
                  : '当前服务仅监听 127.0.0.1，只有本机可以访问。开启后，局域网内的其他设备也可以访问。'}
              </div>
            </div>
            <button
              className={`${styles.toggle} ${isShared ? styles.toggleActive : ''}`}
              onClick={handleToggleSharing}
              disabled={saving}
              title={isShared ? '点击关闭局域网共享' : '点击开启局域网共享'}
              aria-pressed={isShared}
            >
              <span className={styles.toggleDot} />
            </button>
          </div>

          {isShared && !isPasswordEnabled && (
            <div className={styles.warningBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>开启共享后，同一局域网内的所有设备均可访问本系统，建议设置共享密码。</span>
            </div>
          )}

          {isShared && isPasswordEnabled && (
            <div className={styles.successBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>已设置共享密码，远程访问需要输入密码验证。</span>
            </div>
          )}

          <div className={styles.hint}>
            修改后需重启服务才能生效。
          </div>
        </div>
      </div>

      {/* 防火墙提示 */}
      {isShared && (
        <div className={styles.card} style={{ marginBottom: '20px' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              防火墙配置
            </span>
          </div>
          <div className={styles.cardBody} style={{ padding: '24px' }}>
            <div className={styles.warningBox} style={{ marginBottom: '16px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Windows 防火墙可能会阻止局域网设备访问本机端口。如果其他设备无法连接，请运行防火墙放行脚本。</span>
            </div>
            <div className={styles.sharingDesc} style={{ marginBottom: '12px' }}>
              点击下方按钮自动放行端口（会弹出 UAC 管理员确认窗口）：
            </div>
            <button
              className={styles.firewallBtn}
              onClick={handleOpenFirewall}
              disabled={firewallLoading}
              style={{ marginBottom: '12px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              {firewallLoading ? '请求中...' : '一键放行防火墙端口'}
            </button>
            <div className={styles.hint}>
              如自动放行失败，请手动以管理员身份运行项目目录下的 <code>scripts\open-firewall.bat</code> 脚本。
            </div>
          </div>
        </div>
      )}

      {/* 共享密码设置 */}
      {isShared && (
        <div className={styles.card} style={{ marginBottom: '20px' }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              共享密码
            </span>
            {isPasswordEnabled && (
              <StatusTag label="已启用" color="green" />
            )}
          </div>
          <div className={styles.cardBody} style={{ padding: '24px' }}>
            <div className={styles.sharingDesc} style={{ marginBottom: '16px' }}>
              设置共享密码后，远程设备访问时需要输入密码才能查看监控页面，防止非授权访问。
            </div>
            <div className={styles.passwordRow}>
              <div className={styles.passwordInputWrapper}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="留空表示不设密码"
                  className={styles.passwordInput}
                />
                <button
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                className={styles.saveBtn}
                onClick={handleSavePassword}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
            <div className={styles.hint}>
              {isPasswordEnabled
                ? '密码已启用，远程用户需要输入密码才能访问系统。'
                : '未设置密码，远程用户可直接访问系统。'}
            </div>
          </div>
        </div>
      )}

      {/* 局域网访问地址 */}
      {isShared && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              局域网访问地址
            </span>
          </div>
          <div className={styles.cardBody} style={{ padding: '24px' }}>
            <div className={styles.accessRow}>
              <div className={styles.accessUrl}>{lanAccessUrl}</div>
              <button
                className={styles.copyBtn}
                onClick={() => handleCopyAddress(lanAccessUrl)}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    已复制
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    复制
                  </>
                )}
              </button>
            </div>
            <div className={styles.hint}>
              将此地址分享给局域网内的其他用户，他们可通过浏览器访问本系统。
              {isPasswordEnabled && ' 访问时需要输入共享密码。'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NetworkSettings
