/**
 * Rate-limited logger to prevent log spam
 * Logs errors at most once per time window
 */

interface LogEntry {
    message: string
    lastLogged: number
}

const errorLogs = new Map<string, LogEntry>()
const WINDOW_MS = 60000 // 1 minute window

function getErrorKey(message: string, error?: any): string {
    // Create a key based on error type and message
    if (error?.code) {
        return `${error.code}:${message}`
    }
    if (error?.message) {
        const errorMsg = error.message.substring(0, 100)
        return `${errorMsg}:${message}`
    }
    return message.substring(0, 100)
}

export function logErrorRateLimited(message: string, error?: any): void {
    const key = getErrorKey(message, error)
    const now = Date.now()
    const entry = errorLogs.get(key)

    if (!entry || now - entry.lastLogged > WINDOW_MS) {
        // Log the error
        if (error) {
            console.error(message, error)
        } else {
            console.error(message)
        }

        // Update the entry
        errorLogs.set(key, { message, lastLogged: now })
    }
    // Otherwise, silently skip (already logged recently)
}

export function logWarnRateLimited(message: string, error?: any): void {
    const key = getErrorKey(message, error)
    const now = Date.now()
    const entry = errorLogs.get(key)

    if (!entry || now - entry.lastLogged > WINDOW_MS) {
        if (error) {
            console.warn(message, error)
        } else {
            console.warn(message)
        }

        errorLogs.set(key, { message, lastLogged: now })
    }
}

// Clean up old entries periodically (every 5 minutes)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of errorLogs.entries()) {
            if (now - entry.lastLogged > WINDOW_MS * 5) {
                errorLogs.delete(key)
            }
        }
    }, 5 * 60000)
}

