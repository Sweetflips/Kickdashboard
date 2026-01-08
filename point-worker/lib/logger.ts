/**
 * Structured Logging Module
 *
 * Provides consistent, readable logging across the application.
 * Categories: CHAT, COIN, SESSION, SYNC, LEADERBOARD
 */

type LogCategory = 'CHAT' | 'COIN' | 'SESSION' | 'SYNC' | 'LEADERBOARD'

interface LogOptions {
    data?: Record<string, any>
    level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
}

/**
 * Core logging function
 */
function log(category: LogCategory, message: string, options?: LogOptions): void {
    const level = options?.level || 'INFO'
    const prefix = `[${category}]`

    if (options?.data) {
        console.log(`${prefix} ${message}`, JSON.stringify(options.data))
    } else {
        console.log(`${prefix} ${message}`)
    }
}

/**
 * Logger object with category-specific methods
 */
export const logger = {
    /**
     * Log chat-related events
     */
    chat: (message: string, data?: Record<string, any>) => {
        log('CHAT', message, { data })
    },

    /**
     * Log coin award events
     */
    coin: (username: string, amount: number, balance: number, sessionId: string | bigint) => {
        const sessionIdStr = typeof sessionId === 'bigint' ? sessionId.toString() : sessionId
        log('COIN', `+${amount} to @${username} (balance: ${balance}, session: ${sessionIdStr})`)
    },

    /**
     * Log sync worker events
     */
    sync: (flushed: number, pending: number, durationMs: number) => {
        log('SYNC', `Flushed ${flushed} messages in ${durationMs}ms (pending: ${pending})`)
    },

    /**
     * Log session lifecycle events
     */
    session: (action: 'started' | 'ended', channel: string, sessionId: string | bigint) => {
        const sessionIdStr = typeof sessionId === 'bigint' ? sessionId.toString() : sessionId
        log('SESSION', `Stream ${action} for ${channel} (session: ${sessionIdStr})`)
    },

    /**
     * Log leaderboard updates
     */
    leaderboard: (top3: Array<{ username: string; coins: number }>) => {
        const top3Str = top3.map((u, i) => `${i + 1}. @${u.username} (${u.coins})`).join(', ')
        log('LEADERBOARD', `Top 3: ${top3Str}`)
    },

    /**
     * Generic log method for custom messages
     */
    log: (category: LogCategory, message: string, data?: Record<string, any>) => {
        log(category, message, { data })
    },
}
