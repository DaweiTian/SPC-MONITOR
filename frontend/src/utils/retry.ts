/**
 * Retry an async function with configurable attempts and delay.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 2000,
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === maxRetries) throw e
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  throw new Error('unreachable')
}
