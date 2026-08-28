import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../components/Toast'
import styles from './Devices.module.css'

interface Device {
  ip: string
  port: number
  name: string
  password?: string
  added_at?: string
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [discovered, setDiscovered] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newIp, setNewIp] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      const data = await api.getDevices()
      setDevices(data.devices ?? [])
    } catch {
      addToast({ title: '错误', message: '加载设备列表失败', severity: 'WARNING' })
    } finally {
      setLoading(false)
    }
  }

  const getDevicePw = (device: Device): string | null => {
    if (device.password) return device.password
    try { return localStorage.getItem(`ft1_device_pw:${device.ip}`) } catch { return null }
  }

  const handleDiscover = async () => {
    setScanning(true)
    try {
      const data = await api.discoverDevices()
      setDiscovered(data.devices ?? [])
      if (data.devices.length === 0) {
        addToast({ title: '提示', message: '未发现其他共享设备', severity: 'INFO' })
      } else {
        addToast({ title: '成功', message: `发现 ${data.devices.length} 台设备`, severity: 'INFO' })
      }
    } catch {
      addToast({ title: '错误', message: '扫描失败', severity: 'WARNING' })
    } finally {
      setScanning(false)
    }
  }

  const handleAdd = async () => {
    if (!newIp.trim()) {
      addToast({ title: '提示', message: '请输入 IP 地址', severity: 'WARNING' })
      return
    }
    try {
      const result = await api.addDevice({
        ip: newIp.trim(),
        name: newName.trim() || newIp.trim(),
        password: newPassword.trim()
      })
      if (result.success) {
        if (newPassword.trim()) {
          try { localStorage.setItem(`ft1_device_pw:${newIp.trim()}`, newPassword.trim()) } catch { /* ignore */ }
        }
        addToast({ title: '成功', message: '设备已添加', severity: 'INFO' })
        setNewIp('')
        setNewName('')
        setNewPassword('')
        setShowAdd(false)
        loadDevices()
      } else {
        addToast({ title: '提示', message: result.message || '添加失败', severity: 'WARNING' })
      }
    } catch {
      addToast({ title: '错误', message: '添加失败', severity: 'WARNING' })
    }
  }

  const handleRemove = async (ip: string) => {
    const device = devices.find(d => d.ip === ip)
    if (!window.confirm(`确认移除设备「${device?.name || ip}」(${ip})？`)) return
    try {
      await api.removeDevice(ip)
      try { localStorage.removeItem(`ft1_device_pw:${ip}`) } catch { /* ignore */ }
      addToast({ title: '成功', message: '设备已移除', severity: 'INFO' })
      loadDevices()
    } catch {
      addToast({ title: '错误', message: '移除失败', severity: 'WARNING' })
    }
  }

  const handleAddFromDiscovered = async (device: Device) => {
    try {
      const result = await api.addDevice(device)
      if (result.success) {
        addToast({ title: '成功', message: `已添加 ${device.name}`, severity: 'INFO' })
        loadDevices()
      } else {
        addToast({ title: '提示', message: result.message || '设备已存在', severity: 'INFO' })
      }
    } catch {
      addToast({ title: '错误', message: '添加失败', severity: 'WARNING' })
    }
  }

  const openDevice = (device: Device) => {
    const url = `http://${device.ip}:${device.port}/app/`
    if ('__TAURI__' in window) {
      const opener = (window as any).__TAURI__?.opener
      if (opener?.openUrl) {
        opener.openUrl(url)
        return
      }
    }
    window.open(url, '_blank')
  }

  const copyPassword = (device: Device) => {
    const pw = getDevicePw(device)
    if (!pw) return
    navigator.clipboard.writeText(pw).then(() => {
      setCopied(device.ip)
      setTimeout(() => setCopied(null), 2000)
      // 30秒后清除剪贴板中的密码
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000)
    }).catch(() => {
      addToast({ title: '提示', message: '复制失败，请手动复制', severity: 'WARNING' })
    })
  }

  if (loading) return <div className={styles.loading}>加载中...</div>

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>其他设备</h2>
        <div className={styles.actions}>
          <button onClick={handleDiscover} disabled={scanning} className={styles.btnPrimary}>
            {scanning ? '扫描中...' : '扫描局域网'}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className={styles.btnSecondary}>
            手动添加
          </button>
        </div>
      </div>

      {showAdd && (
        <div className={styles.addForm}>
          <input
            type="text"
            placeholder="IP 地址 (如 10.17.110.183)"
            value={newIp}
            onChange={e => setNewIp(e.target.value)}
            className={styles.input}
          />
          <input
            type="text"
            placeholder="设备名称 (可选)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className={styles.input}
          />
          <input
            type="password"
            placeholder="共享密码 (可选)"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className={styles.input}
          />
          <button onClick={handleAdd} className={styles.btnPrimary}>添加</button>
          <button onClick={() => setShowAdd(false)} className={styles.btnSecondary}>取消</button>
        </div>
      )}

      {/* 已保存的设备 */}
      <div className={styles.section}>
        <h3>已保存设备 ({devices.length})</h3>
        {devices.length === 0 ? (
          <div className={styles.empty}>暂无保存的设备，点击"扫描局域网"或"手动添加"</div>
        ) : (
          <div className={styles.deviceGrid}>
            {devices.map(device => {
              const pw = getDevicePw(device)
              const visible = showPw[device.ip]
              return (
                <div key={device.ip} className={styles.deviceCard}>
                  <div className={styles.deviceInfo}>
                    <div className={styles.deviceName}>{device.name}</div>
                    <div className={styles.deviceIp}>{device.ip}:{device.port}</div>
                    {pw && (
                      <div className={styles.passwordRow}>
                        <span className={styles.passwordLabel}>密码:</span>
                        <span className={styles.passwordValue}>
                          {visible ? pw : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </span>
                        <button
                          onClick={() => setShowPw(p => ({ ...p, [device.ip]: !p[device.ip] }))}
                          className={styles.pwToggle}
                          title={visible ? '隐藏' : '显示'}
                        >
                          {visible ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => copyPassword(device)}
                          className={styles.pwCopy}
                          title={copied === device.ip ? '已复制' : '复制密码'}
                        >
                          {copied === device.ip ? '✓' : '复制'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.deviceActions}>
                    <button onClick={() => openDevice(device)} className={styles.btnOpen}>查看</button>
                    <button onClick={() => handleRemove(device.ip)} className={styles.btnRemove}>移除</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 扫描发现的设备 */}
      {discovered.length > 0 && (
        <div className={styles.section}>
          <h3>扫描发现 ({discovered.length})</h3>
          <div className={styles.deviceGrid}>
            {discovered.map(device => (
              <div key={device.ip} className={styles.deviceCard}>
                <div className={styles.deviceInfo}>
                  <div className={styles.deviceName}>{device.name}</div>
                  <div className={styles.deviceIp}>{device.ip}:{device.port}</div>
                </div>
                <div className={styles.deviceActions}>
                  <button onClick={() => handleAddFromDiscovered(device)} className={styles.btnAdd}>添加</button>
                  <button onClick={() => openDevice(device)} className={styles.btnOpen}>查看</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
