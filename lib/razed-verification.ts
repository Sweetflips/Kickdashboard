/**
 * Razed Account Verification Utilities
 * 
 * Handles verification code generation and validation for Razed account linking
 */

const VERIFICATION_WORDS = [
    'apple', 'rocket', 'tiger', 'ocean', 'mountain', 'forest', 'river', 'cloud',
    'star', 'moon', 'sun', 'planet', 'galaxy', 'comet', 'meteor', 'asteroid',
    'dragon', 'phoenix', 'eagle', 'lion', 'wolf', 'bear', 'shark', 'whale',
    'castle', 'tower', 'bridge', 'temple', 'palace', 'fortress', 'citadel',
    'crystal', 'diamond', 'emerald', 'ruby', 'sapphire', 'pearl', 'jade',
    'thunder', 'lightning', 'storm', 'hurricane', 'tornado', 'blizzard',
    'volcano', 'earthquake', 'tsunami', 'avalanche', 'wildfire',
    'champion', 'warrior', 'knight', 'wizard', 'archer', 'assassin',
    'explorer', 'adventurer', 'pioneer', 'trailblazer', 'navigator',
    'sailor', 'pilot', 'captain', 'commander', 'general', 'admiral'
]

const VERIFICATION_CODE_EXPIRY_MINUTES = 5

/**
 * Generate a unique verification code
 * Format: "verify-{word}-{number}"
 * Example: "verify-apple-7349", "verify-rocket-1842"
 */
export function generateVerificationCode(): string {
    const word = VERIFICATION_WORDS[Math.floor(Math.random() * VERIFICATION_WORDS.length)]
    const number = Math.floor(1000 + Math.random() * 9000) // 4 digits (1000-9999)
    return `verify-${word}-${number}`
}

/**
 * Validate verification code format
 */
export function isValidVerificationCode(code: string): boolean {
    const pattern = /^verify-[a-z]+-\d{4}$/
    return pattern.test(code)
}

/**
 * Extract verification code from message text
 * Matches codes that may have surrounding text
 * Only extracts codes that match the exact format (lowercase word part)
 */
export function extractVerificationCode(text: string): string | null {
    const trimmed = text.trim()
    
    // Exact match
    if (isValidVerificationCode(trimmed)) {
        return trimmed
    }
    
    // Try to find code in message
    // Match format: verify-{lowercase_word}-{4_digits}
    // This ensures we only match properly formatted codes
    const codeMatch = trimmed.match(/verify-[a-z]+-\d{4}/)
    if (codeMatch) {
        const matched = codeMatch[0]
        if (isValidVerificationCode(matched)) {
            return matched
        }
    }
    
    // Also try case-insensitive match for the entire code (all uppercase)
    // This handles cases like "VERIFY-APPLE-1234" but not "verify-APPLE-1234"
    const upperCaseMatch = trimmed.match(/VERIFY-[A-Z]+-\d{4}/)
    if (upperCaseMatch) {
        const matched = upperCaseMatch[0].toLowerCase()
        if (isValidVerificationCode(matched)) {
            return matched
        }
    }
    
    return null
}

/**
 * Get expiration time for verification code
 */
export function getVerificationExpiry(): Date {
    const expiry = new Date()
    expiry.setMinutes(expiry.getMinutes() + VERIFICATION_CODE_EXPIRY_MINUTES)
    return expiry
}

/**
 * Check if verification code is expired
 */
export function isVerificationExpired(expiresAt: Date): boolean {
    return new Date() > expiresAt
}

/**
 * Rate limiting: Check if user has active verification
 * Returns true if user can create new verification
 */
export async function canCreateVerification(kickUserId: BigInt, db: any): Promise<boolean> {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
    
    const recentVerification = await db.razedVerification.findFirst({
        where: {
            kick_user_id: kickUserId,
            created_at: {
                gte: oneMinuteAgo
            },
            status: {
                in: ['pending', 'verified']
            }
        }
    })
    
    return !recentVerification
}

