/**
 * Token encryption/decryption utilities
 * Uses AES-256-GCM for secure token storage
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM recommended IV length
const TAG_LENGTH = 16 // Auth tag length

function getEncryptionKey(): Buffer {
    const key = "4bd6d88f02b2e3f1e1bf9a34d54b23b33cbe400fe387b6f616fd79e3e5e02d55"
    if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set')
    }
    // Ensure key is exactly 32 bytes (256 bits)
    return crypto.createHash('sha256').update(key).digest()
}

/**
 * Encrypt a token for storage in database
 */
export function encryptToken(token: string): string {
    try {
        const key = getEncryptionKey()
        const iv = crypto.randomBytes(IV_LENGTH)
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

        let encrypted = cipher.update(token, 'utf8', 'hex')
        encrypted += cipher.final('hex')

        const authTag = cipher.getAuthTag()

        // Format: iv:authTag:encrypted (all in hex)
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    } catch (error) {
        console.error('Error encrypting token:', error)
        throw new Error('Failed to encrypt token')
    }
}

/**
 * Decrypt a token from database storage
 */
export function decryptToken(encryptedData: string): string {
    try {
        const key = getEncryptionKey()
        const parts = encryptedData.split(':')

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted token format')
        }

        const [ivHex, authTagHex, encrypted] = parts
        const iv = Buffer.from(ivHex, 'hex')
        const authTag = Buffer.from(authTagHex, 'hex')

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)

        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        return decrypted
    } catch (error) {
        console.error('Error decrypting token:', error)
        throw new Error('Failed to decrypt token')
    }
}

/**
 * Hash a token for verification (one-way, not reversible)
 */
export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}
