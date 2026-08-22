import type { ToastItem } from '../components/Toast'

interface AlertPayload {
  alerts: Array<{
    severity: string
    product_code?: string
    indicator_code?: string
    rule_desc?: string
    message?: string
  }>
}

const isTauri = '__TAURI__' in window

let audioCtx: AudioContext | null = null

function playAlertSound(severity: string) {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    // Browser autoplay policy: resume suspended context
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    const oscillator = audioCtx.createOscillator()
    const gainNode = audioCtx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioCtx.destination)

    // Different tones for different severity
    oscillator.frequency.value = severity === 'CRITICAL' ? 880 : severity === 'WARNING' ? 660 : 440
    oscillator.type = 'sine'
    gainNode.gain.value = 0.3

    oscillator.start()
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
    oscillator.stop(audioCtx.currentTime + 0.4)
  } catch {
    // Audio not available
  }
}

async function showSystemNotification(title: string, body: string) {
  if (!isTauri) {
    // Browser Notification API fallback
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') new Notification(title, { body })
        })
      }
    }
    return
  }

  try {
    // Tauri v2 notification plugin
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
    let granted = await isPermissionGranted()
    if (!granted) {
      const result = await requestPermission()
      granted = result === 'granted'
    }
    if (granted) {
      sendNotification({ title, body })
    }
  } catch {
    // Plugin not available, fall back to browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }
}

export interface NotificationConfig {
  soundEnabled: boolean
  popupEnabled: boolean
}

const VALID_SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const
type Severity = typeof VALID_SEVERITIES[number]

function normalizeSeverity(raw: string): Severity {
  const upper = (raw || 'INFO').toUpperCase()
  return VALID_SEVERITIES.includes(upper as Severity) ? (upper as Severity) : 'INFO'
}

export function handleAlertNotification(
  payload: AlertPayload,
  config: NotificationConfig,
  addToast: (toast: Omit<ToastItem, 'id'>) => void,
  navigateToAlerts?: () => void,
) {
  if (!payload.alerts || payload.alerts.length === 0) return

  const count = payload.alerts.length
  const alert = payload.alerts[0]
  const severity = normalizeSeverity(alert.severity)
  const title = count > 1
    ? `${severity === 'CRITICAL' ? '严重预警' : severity === 'WARNING' ? '警告' : '提示'} (${count}条)`
    : severity === 'CRITICAL' ? '严重预警' : severity === 'WARNING' ? '警告' : '提示'
  const message = alert.message || alert.rule_desc || `${alert.product_code ?? ''} ${alert.indicator_code ?? ''}`.trim() || '新的预警信息'

  if (config.soundEnabled) {
    playAlertSound(severity)
  }

  if (config.popupEnabled) {
    showSystemNotification(`液奶监控 - ${title}`, message)
  }

  addToast({
    title,
    message,
    severity,
    duration: severity === 'CRITICAL' ? 10000 : 6000,
    onClick: navigateToAlerts,
  })
}
