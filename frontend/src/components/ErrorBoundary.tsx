import { Component, ErrorInfo, ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary 捕获到错误:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h1 className={styles.title}>
            页面出现错误
          </h1>
          <p className={styles.description}>
            抱歉，页面加载时发生了意外错误。请尝试刷新页面。
          </p>
          {this.state.error && (
            <pre className={styles.errorBox}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className={styles.retryBtn}
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
