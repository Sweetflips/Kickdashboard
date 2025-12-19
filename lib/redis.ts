import Redis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

/**
 * Redis client singleton for high-performance message buffering and real-time counters
 * Uses Redis Cloud connection with retry logic and connection pooling
 */
export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || '', {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    enableOfflineQueue: false, // Don't queue commands when disconnected
    connectTimeout: 10000,
    lazyConnect: false,
    // Connection pool settings
    keepAlive: 30000,
    // Error handling
    showFriendlyErrorStack: process.env.NODE_ENV === 'development',
  })

// Store in global to ensure singleton pattern works in production
if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

// Error handling
redis.on('error', (error) => {
  console.error('[Redis] Connection error:', error.message)
})

redis.on('connect', () => {
  console.log('[Redis] Connected to Redis')
})

redis.on('ready', () => {
  console.log('[Redis] Ready to accept commands')
})

redis.on('close', () => {
  console.warn('[Redis] Connection closed')
})

redis.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...')
})

/**
 * Health check function to verify Redis connection
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping()
    return true
  } catch (error) {
    console.error('[Redis] Health check failed:', error)
    return false
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit()
    console.log('[Redis] Connection closed gracefully')
  } catch (error) {
    console.error('[Redis] Error closing connection:', error)
    redis.disconnect()
  }
}

export default redis
