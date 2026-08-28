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
  const { addToast } = useToast()

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      const data = await api.getDevices()
      setDevices(data.devices)
    } catch {
      addToast({ title: '错误', message: '加载设备列表失败', severity: 'WARNING' })
    } finally {
      setLoading(false)
    }
  }

  const handleDiscover = async () => {
    setScanning(true)
    try {
      const data = await api.discoverDevices()
      setDiscovered(data.devices)
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
    try {
      await api.removeDevice(ip)
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
    let url = `http://${device.ip}:${device.port}/app/`
    // 如果有保存密码，通过 URL 参数传递
    if (device.password) {
      url += `?auth=${encodeURIComponent(device.password)}`
    }
    window.open(url, '_blank')
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
            {devices.map(device => (
              <div key={device.ip} className={styles.deviceCard}>
                <div className={styles.deviceInfo}>
                  <div className={styles.deviceName}>
                    {device.name}
                    {device.password && (
                      <span className={styles.passwordBadge} title="已配置密码">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className={styles.deviceIp}>{device.ip}:{device.port}</div>
                </div>
                <div className={styles.deviceActions}>
                  <button onClick={() => openDevice(device)} className={styles.btnOpen}>查看</button>
                  <button onClick={() => handleRemove(device.ip)} className={styles.btnRemove}>移除</button>
                </div>
              </div>
            ))}
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
