export type EngagementType =
    | 'command'
    | 'question'
    | 'reaction'
    | 'short_message'
    | 'enthusiastic'
    | 'conversation'
    | 'discussion'
    | 'emote_response'
    | 'regular'

export type StoredEmote = { emote_id: string; positions: Array<{ s: number; e: number }> }

function safeLower(s: string) {
    return (s || '').trim().toLowerCase()
}

export function countExclamations(content: string): number {
    const matches = (content || '').match(/!/g)
    return matches ? matches.length : 0
}

export function countSentences(content: string): number {
    const matches = (content || '').match(/[.!?]+/g)
    return matches ? matches.length : 0
}

export function messageLength(content: string): number {
    return (content || '').length
}

export function extractEmotesFromContent(content: string): StoredEmote[] {
    const emotePattern = /\[emote:(\d+):([^\]]+)\]/g
    const emotesMap = new Map<string, Array<{ s: number; e: number }>>()

    let match: RegExpExecArray | null
    while ((match = emotePattern.exec(content || '')) !== null) {
        const emoteId = match[1]
        const start = match.index
        const end = start + match[0].length - 1

        if (!emotesMap.has(emoteId)) emotesMap.set(emoteId, [])
        emotesMap.get(emoteId)!.push({ s: start, e: end })
    }

    return Array.from(emotesMap.entries()).map(([emote_id, positions]) => ({ emote_id, positions }))
}

export function hasEmotes(emotes: unknown, content: string): boolean {
    // If we already have structured emotes (worker payload usually does), this is cheapest.
    if (Array.isArray(emotes) && emotes.length > 0) return true

    // If emotes stored as JSON string (legacy), try parsing.
    if (typeof emotes === 'string') {
        try {
            const parsed = JSON.parse(emotes)
            if (Array.isArray(parsed) && parsed.length > 0) return true
        } catch {
            // ignore
        }
    }

    // Fallback: scan content for Kick-style emote tokens.
    return extractEmotesFromContent(content).length > 0
}

export function analyzeEngagementType(content: string, hasEmotesFlag: boolean): EngagementType {
    const text = safeLower(content)
    const length = text.length

    if (text.startsWith('!')) return 'command'

    if (
        text.includes('?') ||
        text.startsWith('what') ||
        text.startsWith('why') ||
        text.startsWith('how') ||
        text.startsWith('when') ||
        text.startsWith('where') ||
        text.startsWith('who')
    ) {
        return 'question'
    }

    if (length <= 5 && hasEmotesFlag) return 'reaction'
    if (length <= 10 && !hasEmotesFlag) return 'short_message'

    if (countExclamations(content) >= 2) return 'enthusiastic'
    if (length > 100) return 'conversation'

    if (countSentences(content) >= 2) return 'discussion'
    if (hasEmotesFlag && length <= 20) return 'emote_response'

    return 'regular'
}







