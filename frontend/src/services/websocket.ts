type MessageHandler = (data: any) => void

class WebSocketService {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectTimer: number | null = null
  private _connected = false
  private reconnectDelay = 1000
  private readonly maxReconnectDelay = 30000
  private retryCount = 0
  private readonly maxRetries = 5

  get connected() {
    return this._connected
  }

  connect() {
    if (this.retryCount > this.maxRetries) return

    const wsHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${wsHost}/api/ws`

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log('WebSocket 已连接')
        this._connected = true
        this.reconnectDelay = 1000
        this.retryCount = 0
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
          console.log('WebSocket 重连次数超限，停止重连')
          return
        }
        console.log(`WebSocket 已断开，${this.reconnectDelay / 1000}s 后重连 (${this.retryCount}/${this.maxRetries})`)
        this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      }

      this.ws.onerror = (error) => {
        this._connected = false
        this.retryCount++
        if (this.retryCount > this.maxRetries) {
          console.log('WebSocket 重连次数超限，停止重连')
          this.ws?.close()
          return
        }
        console.warn(`WebSocket 连接失败 (${this.retryCount}/${this.maxRetries})`)
        this.ws?.close()
      }
    } catch (e) {
      console.warn('WebSocket 初始化失败:', e)
      this._connected = false
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
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

  private emit(event: string, data: any) {
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
