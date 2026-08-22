type MessageHandler = (data: Record<string, unknown>) => void

class WebSocketService {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectTimer: number | null = null
  private _connected = false
  private reconnectDelay = 1000
  private readonly maxReconnectDelay = 30000
  private retryCount = 0
  private readonly maxRetries = 5
  private waitingForFirstSuccess = false

  get connected() {
    return this._connected
  }

  connect() {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) return

    // 只在显式调用时重置重连状态
    this.retryCount = 0
    this.reconnectDelay = 1000
    this.waitingForFirstSuccess = true
    this._doConnect()
  }

  private _doConnect() {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) return

    // 开发模式走 vite 代理，生产模式用当前页面地址，Tauri 环境直连后端
    const isTauri = '__TAURI__' in window
    const wsHost = isTauri ? '127.0.0.1:18080' : window.location.host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const apiKey = localStorage.getItem('ft1_api_key') || 'ft1-monitor-default-key'
    const wsUrl = `${protocol}//${wsHost}/api/ws?api_key=${apiKey}`

    const doConnect = () => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket 已连接')
          this._connected = true
          this.reconnectDelay = 1000
          this.retryCount = 0
          this.waitingForFirstSuccess = false
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
          }
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.emit(data.type, data)
          } catch (e) {
            console.error('解析 WebSocket 消息失败:', e)
          }
        }

        this.ws.onclose = () => {
          this._connected = false
          this.retryCount++
          if (this.retryCount > this.maxRetries) {
            if (!this.waitingForFirstSuccess) console.log('WebSocket 重连次数超限，停止重连')
            return
          }
          if (!this.waitingForFirstSuccess) {
            console.log(`WebSocket 已断开，${this.reconnectDelay / 1000}s 后重连 (${this.retryCount}/${this.maxRetries})`)
          }
          this.reconnectTimer = window.setTimeout(() => this._doConnect(), this.reconnectDelay)
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
        }

        this.ws.onerror = () => {
          this._connected = false
          if (!this.waitingForFirstSuccess) console.warn('WebSocket 连接错误')
          this.ws?.close()
        }
      } catch (e) {
        console.warn('WebSocket 初始化失败:', e)
        this._connected = false
      }
    }

    doConnect()
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    this._connected = false
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    this.handlers.get(event)!.push(handler)
  }

  off(event: string, handler: MessageHandler) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: Record<string, unknown>) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(data))
    }
  }

  send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }
}

export const websocketService = new WebSocketService()
