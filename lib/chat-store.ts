// Shared chat message storage
export interface ChatMessage {
    message_id: string
    broadcaster: {
        is_anonymous: boolean
        user_id: number
        username: string
        is_verified: boolean
        profile_picture?: string
        channel_slug: string
        identity: null // no identity for broadcasters at the moment
    }
    sender: {
        is_anonymous: boolean
        user_id: number
        username: string
        is_verified: boolean
        profile_picture?: string
        channel_slug: string
        identity: {
            username_color?: string
            badges: Array<{
                text: string
                type: string
                count?: number
            }>
        } | null
    }
    content: string
    emotes: Array<{
        emote_id: string
        positions: Array<{ s: number; e: number }>
    }>
    timestamp: number
    points_earned?: number
    sent_when_offline?: boolean
}

// In-memory storage for chat messages (in production, use a database)
let chatMessages: ChatMessage[] = []

// Load messages from localStorage on server-side (for API routes)
function loadMessagesFromStorage(): ChatMessage[] {
    if (typeof window === 'undefined') {
        // Server-side: return empty array
        return []
    }

    try {
        const stored = localStorage.getItem('kick_chat_messages')
        if (stored) {
            return JSON.parse(stored)
        }
    } catch (error) {
        console.error('Failed to load messages from localStorage:', error)
    }

    return []
}

// Save messages to localStorage
function saveMessagesToStorage(messages: ChatMessage[]): void {
    if (typeof window === 'undefined') {
        // Server-side: skip localStorage
        return
    }

    try {
        localStorage.setItem('kick_chat_messages', JSON.stringify(messages))
    } catch (error) {
        console.error('Failed to save messages to localStorage:', error)
    }
}

// Initialize messages from localStorage
if (typeof window !== 'undefined') {
    chatMessages = loadMessagesFromStorage()
}

export function addChatMessage(message: ChatMessage): void {
    chatMessages.push(message)
    // Keep last 500 messages
    if (chatMessages.length > 500) {
        chatMessages.shift()
    }
    // Persist to localStorage
    saveMessagesToStorage(chatMessages)
}

export function getChatMessages(): ChatMessage[] {
    return [...chatMessages]
}

// Load messages from localStorage (for client-side use)
export function loadStoredMessages(): ChatMessage[] {
    const stored = loadMessagesFromStorage()
    chatMessages = stored
    return stored
}
