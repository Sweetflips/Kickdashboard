/**
 * In-memory cache with TTL, max size, and in-flight request deduplication
 * Zero-infra caching for API route handlers
 */

interface CacheEntry<T> {
    data: T
    expiresAt: number
    createdAt: number
}

interface InFlightRequest<T> {
    promise: Promise<T>
    timestamp: number
}

class MemoryCache {
    private cache = new Map<string, CacheEntry<any>>()
    private inFlightRequests = new Map<string, InFlightRequest<any>>()
    private maxSize: number
    private defaultTTL: number
    private cleanupInterval: NodeJS.Timeout | null = null

    constructor(maxSize = 1000, defaultTTL = 30000) {
        this.maxSize = maxSize
        this.defaultTTL = defaultTTL
        // Periodic cleanup every 60 seconds
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
    }

    /**
     * Get cached value or execute fetcher function
     * Deduplicates concurrent requests for the same key
     */
    async getOrSet<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl?: number
    ): Promise<T> {
        // Check cache first
        const cached = this.get<T>(key)
        if (cached !== null) {
            return cached
        }

        // Check if there's an in-flight request for this key
        const inFlight = this.inFlightRequests.get(key)
        if (inFlight) {
            // Request is in-flight, wait for it
            return inFlight.promise
        }

        // Create new request
        const promise = fetcher()
            .then((data) => {
                // Cache the result
                this.set(key, data, ttl)
                // Remove from in-flight
                this.inFlightRequests.delete(key)
                return data
            })
            .catch((error) => {
                // Remove from in-flight on error
                this.inFlightRequests.delete(key)
                throw error
            })

        // Track in-flight request
        this.inFlightRequests.set(key, {
            promise,
            timestamp: Date.now(),
        })

        // Clean up stale in-flight requests (older than 30 seconds)
        this.cleanupInFlight()

        return promise
    }

    /**
     * Get value from cache (returns null if expired or not found)
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key)
        if (!entry) {
            return null
        }

        if (Date.now() > entry.expiresAt) {
            // Expired, remove it
            this.cache.delete(key)
            return null
        }

        return entry.data as T
    }

    /**
     * Set value in cache
     */
    set<T>(key: string, value: T, ttl?: number): void {
        const now = Date.now()
        const expiresAt = now + (ttl || this.defaultTTL)

        // If cache is full, remove oldest entries
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictOldest()
        }

        this.cache.set(key, {
            data: value,
            expiresAt,
            createdAt: now,
        })
    }

    /**
     * Delete a specific key
     */
    delete(key: string): void {
        this.cache.delete(key)
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear()
        this.inFlightRequests.clear()
    }

    /**
     * Remove expired entries
     */
    private cleanup(): void {
        const now = Date.now()
        let cleaned = 0

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key)
                cleaned++
            }
        }

        // Also clean up in-flight requests
        this.cleanupInFlight()

        if (cleaned > 0) {
            console.log(`[MemoryCache] Cleaned up ${cleaned} expired entries`)
        }
    }

    /**
     * Clean up stale in-flight requests
     */
    private cleanupInFlight(): void {
        const now = Date.now()
        const staleThreshold = 30000 // 30 seconds

        for (const [key, request] of this.inFlightRequests.entries()) {
            if (now - request.timestamp > staleThreshold) {
                this.inFlightRequests.delete(key)
            }
        }
    }

    /**
     * Evict oldest entries when cache is full
     */
    private evictOldest(): void {
        // Find oldest entry
        let oldestKey: string | null = null
        let oldestTime = Infinity

        for (const [key, entry] of this.cache.entries()) {
            if (entry.createdAt < oldestTime) {
                oldestTime = entry.createdAt
                oldestKey = key
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey)
        }
    }

    /**
     * Get cache stats
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            inFlight: this.inFlightRequests.size,
        }
    }

    /**
     * Cleanup on shutdown
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
        this.clear()
    }
}

// Singleton instance for use across the app
export const memoryCache = new MemoryCache(1000, 30000) // 1000 entries max, 30s default TTL

// Export class for custom instances if needed
export { MemoryCache }
