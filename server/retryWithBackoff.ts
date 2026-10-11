export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const isRetryable =
        e.message.toLowerCase().includes('unavailable') ||
        e.message.toLowerCase().includes('quota') ||
        e.message.toLowerCase().includes('exceeded') ||
        e.message.includes('429') ||
        e.message.toLowerCase().includes('timeout');
      if (!isRetryable || i === attempts - 1) throw e;
      const jitter = Math.random() * 100;
      const delay = baseDelayMs * Math.pow(2, i) + jitter;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastError;
}
