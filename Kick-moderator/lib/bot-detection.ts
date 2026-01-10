/**
 * Bot detection utility for chat messages
 * Analyzes message content and patterns to identify potential bot activity
 */

export interface BotDetectionResult {
    isBot: boolean
    reasons: string[]
    score: number
}

/**
 * Detects if a message is likely from a bot based on content patterns
 * @param messageContent The current message content
 * @param recentMessages Array of recent message contents from the same user
 * @returns Bot detection result with score and reasons
 */
export function detectBotMessage(
    messageContent: string,
    recentMessages: string[] = []
): BotDetectionResult {
    const reasons: string[] = []
    let score = 0

    // Check for exact duplicate messages
    if (recentMessages.includes(messageContent)) {
        score += 30
        reasons.push('duplicate message')
    }

    // Check for very short messages (likely spam)
    if (messageContent.trim().length < 3) {
        score += 10
        reasons.push('very short message')
    }

    // Check for excessive repetition
    const charCounts = new Map<string, number>()
    for (const char of messageContent) {
        charCounts.set(char, (charCounts.get(char) || 0) + 1)
    }
    const maxCharCount = Math.max(...Array.from(charCounts.values()))
    if (maxCharCount > messageContent.length * 0.5 && messageContent.length > 10) {
        score += 20
        reasons.push('excessive character repetition')
    }

    // Check for common bot patterns
    const botPatterns = [
        /^(follow|sub|like|view|watch)\s+(me|my|channel|stream)/i,
        /^(check out|visit|go to)\s+(my|this)\s+(channel|stream|link)/i,
        /^(auto|bot|spam)/i,
    ]

    for (const pattern of botPatterns) {
        if (pattern.test(messageContent)) {
            score += 25
            reasons.push('bot-like pattern')
            break
        }
    }

    // Check for URL spam
    const urlMatches = messageContent.match(/https?:\/\/[^\s]+/g)
    if (urlMatches && urlMatches.length > 1) {
        score += 15
        reasons.push('multiple URLs')
    }

    // Threshold: score >= 40 indicates likely bot
    const isBot = score >= 40

    return {
        isBot,
        reasons,
        score,
    }
}
