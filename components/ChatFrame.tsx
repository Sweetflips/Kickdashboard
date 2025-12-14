'use client'

import Pusher from 'pusher-js'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import EmotePicker from './EmotePicker'
import ChatSettings from './ChatSettings'
import { toastManager } from './Toast'
import { getAccessToken, getRefreshToken, setAuthTokens, clearAuthTokens } from '@/lib/cookies'

interface ChatMessage {
    message_id: string
    broadcaster: {
        is_anonymous: boolean
        user_id: number
        username: string
        is_verified: boolean
        profile_picture?: string
        channel_slug: string
        identity: null
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
    sweet_coins_earned?: number
    sweet_coins_reason?: string
    sent_when_offline?: boolean
}

interface Emote {
    id: string
    name: string
    url?: string
    original?: any
}

interface ChatFrameProps {
    chatroomId?: number
    broadcasterUserId?: number
    slug?: string
    username?: string
    // Optional: real stream live status (from /api/channel). If omitted, keep legacy behavior.
    isStreamLive?: boolean
}

// Helper function to check if a user should be verified
function isVerifiedUser(username: string, badges: Array<{ type: string }> = []): boolean {
    const verifiedUsernames = ['botrix', 'kickbot', 'sweetflips']
    const usernameLower = username?.toLowerCase() || ''

    // Check if username is in verified list
    if (verifiedUsernames.includes(usernameLower)) {
        return true
    }

    // Check if there's a verified badge
    if (badges.some(badge => badge.type === 'verified' || badge.type === 'verified_user')) {
        return true
    }

    return false
}

// Helper function to extract text content from contenteditable div (including emote codes)
function extractTextFromContentEditable(element: HTMLElement): string {
    let text = ''

    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null
    )

    let node
    while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent || ''
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if (el.tagName === 'IMG' && el.getAttribute('data-emote-code')) {
                // Get emote code from data attribute
                text += el.getAttribute('data-emote-code') || ''
            }
        }
    }

    return text
}

// Helper function to get proxied emote URL (bypasses ad blockers)
function getProxiedEmoteUrl(originalUrl: string): string {
    // Use image proxy to bypass ad blockers and CORS issues
    return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`
}

// Helper function to insert emote as image in contenteditable div
function insertEmoteAsImage(input: HTMLDivElement, emote: { id: string; name: string; url?: string }) {
    if (!input) return

    // Focus the input first
    input.focus()

    // Get selection
    let selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
        // Create range at end if no selection
        const range = document.createRange()
        range.selectNodeContents(input)
        range.collapse(false)
        const newSelection = window.getSelection()
        if (newSelection) {
            newSelection.removeAllRanges()
            newSelection.addRange(range)
        }
        selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) {
            return
        }
    }

    const range = selection.getRangeAt(0)

    // Check if user typed ':' and we should replace it
    const textNode = range.startContainer
    let shouldReplaceColon = false
    let colonOffset = 0

    if (textNode.nodeType === Node.TEXT_NODE && textNode.parentElement === input) {
        const text = textNode.textContent || ''
        const start = range.startOffset

        // Check if there's a ':' before cursor
        if (start > 0 && text.charAt(start - 1) === ':') {
            shouldReplaceColon = true
            colonOffset = start - 1
        }
    }

    // Create emote image element
    const emoteText = emote.id.length > 10 ? emote.id : `[emote:${emote.id}:${emote.name}]`
    const emoteImg = document.createElement('img')
    const emoteUrl = emote.url || `https://files.kick.com/emotes/${emote.id}/fullsize`
    // Use proxied URL to bypass ad blockers
    emoteImg.src = getProxiedEmoteUrl(emoteUrl)
    emoteImg.alt = emote.name
    emoteImg.className = 'inline-block mx-0.5 align-text-bottom'
    emoteImg.style.width = '20px'
    emoteImg.style.height = '20px'
    emoteImg.style.verticalAlign = 'text-bottom'
    emoteImg.style.display = 'inline-block'
    emoteImg.crossOrigin = 'anonymous'
    emoteImg.referrerPolicy = 'no-referrer'
    emoteImg.setAttribute('data-emote-id', emote.id)
    emoteImg.setAttribute('data-emote-name', emote.name)
    emoteImg.setAttribute('data-emote-code', emoteText)

    // Create a span to wrap the image (for spacing)
    const emoteWrapper = document.createElement('span')
    emoteWrapper.className = 'inline-block mx-0.5'
    emoteWrapper.style.display = 'inline-block'
    emoteWrapper.style.verticalAlign = 'text-bottom'
    emoteWrapper.appendChild(emoteImg)

    // Add space after emote (as text node)
    const spaceNode = document.createTextNode(' ')

    if (shouldReplaceColon) {
        // Delete the ':' character
        const textNode = range.startContainer as Text
        if (textNode.nodeType === Node.TEXT_NODE) {
            const before = textNode.textContent?.substring(0, colonOffset) || ''
            const after = textNode.textContent?.substring(colonOffset + 1) || ''
            textNode.textContent = before + after

            // Adjust range position
            range.setStart(textNode, colonOffset)
            range.collapse(true)
        }
    }

    // Insert emote wrapper
    range.insertNode(emoteWrapper)

    // Insert space after emote
    range.setStartAfter(emoteWrapper)
    range.insertNode(spaceNode)

    // Move cursor after space
    range.setStartAfter(spaceNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    return emoteText
}

// Function to render message content with emotes
function renderMessageWithEmotes(
    content: string,
    emotes: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }>,
    emoteMap?: Map<string, Emote>
) {
    // First, check if content contains [emote:ID:NAME] format and parse those
    const emotePattern = /\[emote:(\d+):([^\]]+)\]/g
    const emoteMatches: Array<{ emoteId: string; name: string; fullMatch: string; index: number }> = []

    // Use matchAll for better compatibility and to avoid regex state issues
    const matches = content.matchAll(emotePattern)

    for (const match of matches) {
        if (match[1] && match[2]) {
            emoteMatches.push({
                emoteId: match[1],
                name: match[2],
                fullMatch: match[0],
                index: match.index || 0
            })
        }
    }

    // If we found emote placeholders in the content, use those
    if (emoteMatches.length > 0) {
        const parts: Array<{ type: 'text' | 'emote'; content: string; emoteId?: string }> = []
        let lastIndex = 0

        emoteMatches.forEach((emoteMatch) => {
            // Add text before this emote
            if (emoteMatch.index > lastIndex) {
                parts.push({
                    type: 'text',
                    content: content.substring(lastIndex, emoteMatch.index)
                })
            }

            // Add emote
            parts.push({
                type: 'emote',
                content: emoteMatch.fullMatch,
                emoteId: emoteMatch.emoteId
            })

            lastIndex = emoteMatch.index + emoteMatch.fullMatch.length
        })

        // Add remaining text after last emote
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                content: content.substring(lastIndex)
            })
        }

        // Render parts
        return (
            <>
                {parts.map((part, idx) => {
                    if (part.type === 'emote' && part.emoteId) {
                        return renderEmote(part.emoteId, part.content, emoteMap, `emote-${part.emoteId}-${idx}`)
                    }
                    if (part.content) {
                        return <span key={`text-${idx}`}>{part.content}</span>
                    }
                    return null
                })}
            </>
        )
    }

    // Fallback to position-based parsing if emotes array is provided
    if (!emotes || emotes.length === 0) {
        return <span>{content}</span>
    }

    // Collect all emote positions and sort by start position (descending to replace from end)
    const emotePositions: Array<{ emoteId: string; start: number; end: number }> = []

    emotes.forEach((emote) => {
        emote.positions.forEach((pos) => {
            emotePositions.push({
                emoteId: emote.emote_id,
                start: pos.s,
                end: pos.e
            })
        })
    })

    // Sort by start position descending to replace from end to start
    emotePositions.sort((a, b) => b.start - a.start)

    const parts: Array<{ type: 'text' | 'emote'; content: string; emoteId?: string }> = []
    let lastIndex = content.length

    // Process emotes from end to start
    emotePositions.forEach(({ emoteId, start, end }) => {
        // Add text after this emote (end is inclusive, so use end + 1)
        if (end + 1 < lastIndex) {
            parts.unshift({
                type: 'text',
                content: content.substring(end + 1, lastIndex)
            })
        }

        // Add emote (end is inclusive, so use end + 1)
        const emoteText = content.substring(start, end + 1)
        parts.unshift({
            type: 'emote',
            content: emoteText,
            emoteId: emoteId
        })

        lastIndex = start
    })

    // Add remaining text at the beginning
    if (lastIndex > 0) {
        parts.unshift({
            type: 'text',
            content: content.substring(0, lastIndex)
        })
    }

    // Render parts
    return (
        <>
            {parts.map((part, idx) => {
                if (part.type === 'emote' && part.emoteId) {
                    return renderEmote(part.emoteId, part.content, emoteMap, `emote-${part.emoteId}-${idx}`)
                }
                if (part.content) {
                    return <span key={`text-${idx}`}>{part.content}</span>
                }
                return null
            })}
        </>
    )
}

// Helper function to render a single emote
function renderEmote(emoteId: string, emoteText: string, emoteMap?: Map<string, Emote>, key?: string | number) {
    // Try to get emote URL from emote map first
    let emoteUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`

    if (emoteMap) {
        const emote = emoteMap.get(emoteId)
        if (emote?.url) {
            emoteUrl = emote.url
        }
    }

    // Use proxied URL to bypass ad blockers
    const proxiedUrl = getProxiedEmoteUrl(emoteUrl)

    // Kick emote URL formats (try multiple):
    const altUrls = [
        `https://files.kick.com/emotes/${emoteId}/fullsize`,
        `https://files.kick.com/emotes/${emoteId}/1.0x.webp`,
        `https://files.kick.com/emotes/${emoteId}/1.0x.png`,
        `https://files.kick.com/emotes/${emoteId}/small`,
        `https://files.kick.com/emotes/${emoteId}/medium`
    ]

    return (
        <span
            key={key}
            className="chat-emote-container inline-block mx-0.5"
            style={{
                width: '28px',
                height: '20px',
                verticalAlign: 'text-bottom',
                lineHeight: '1',
                flexShrink: 0
            }}
        >
            <Image
                src={proxiedUrl}
                alt={emoteText}
                width={28}
                height={28}
                className="chat-emote object-contain"
                style={{
                    width: '28px',
                    height: '20px',
                    display: 'block',
                    verticalAlign: 'bottom'
                }}
                unoptimized
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                    // Try alternative URL formats via proxy
                    const target = e.target as HTMLImageElement
                    const currentSrc = target.src
                    const currentIndex = altUrls.findIndex(url => currentSrc.includes(url.split('/').pop() || ''))
                    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0

                    if (nextIndex < altUrls.length && !currentSrc.includes(altUrls[nextIndex])) {
                        target.src = getProxiedEmoteUrl(altUrls[nextIndex])
                    } else {
                        // Fallback to text if all URLs fail
                        target.style.display = 'none'
                        const fallback = document.createElement('span')
                        fallback.textContent = emoteText
                        fallback.className = 'inline-block text-kick-text'
                        target.parentElement?.appendChild(fallback)
                    }
                }}
            />
        </span>
    )
}

export default function ChatFrame({ chatroomId, broadcasterUserId, slug, username, isStreamLive }: ChatFrameProps) {
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatLoading, setChatLoading] = useState(false)
    const [chatInput, setChatInput] = useState('')
    const pusherRef = useRef<Pusher | null>(null)
    const [pusherConnected, setPusherConnected] = useState(false)
    const [emoteMap, setEmoteMap] = useState<Map<string, Emote>>(new Map())
    const [categorizedEmotes, setCategorizedEmotes] = useState<{
        emojis: Emote[]
        channel: Emote[]
        global: Emote[]
    }>({ emojis: [], channel: [], global: [] })
    const [emotesLoaded, setEmotesLoaded] = useState(false)
    const [accessToken, setAccessToken] = useState<string | null>(null)
    const [isSending, setIsSending] = useState(false)
    const [emotePickerOpen, setEmotePickerOpen] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [recentEmotes, setRecentEmotes] = useState<Emote[]>([])
    const inputRef = useRef<HTMLDivElement>(null)
    const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([])
    const [pinnedLocked, setPinnedLocked] = useState(false)
    const [isScrolledUp, setIsScrolledUp] = useState(false)
    const [showNewMessagesSeparator, setShowNewMessagesSeparator] = useState(false)
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const [currentUserId, setCurrentUserId] = useState<number | undefined>(undefined)
    const [userData, setUserData] = useState<{ id?: number; username?: string; email?: string; profile_picture?: string; [key: string]: any } | null>(null)
    const processedMessageIdsRef = useRef<Set<string>>(new Set())

    // Batch chat-save requests to avoid hammering the origin (and spamming 502s when it’s unhealthy)
    const chatSaveQueueRef = useRef<ChatMessage[]>([])
    const chatSaveFlushTimerRef = useRef<number | null>(null)
    const chatSaveInFlightRef = useRef(false)
    const chatSaveBackoffUntilRef = useRef(0)
    const chatSaveBackoffMsRef = useRef(1000)

    // Backoff for sweet-coins polling when the API is unhealthy
    const sweetCoinsBackoffUntilRef = useRef(0)
    const sweetCoinsBackoffMsRef = useRef(2000)

    const streamLive = isStreamLive ?? true
    const canChat = !!accessToken && streamLive

    const bumpChatSaveBackoff = () => {
        const now = Date.now()
        const delay = chatSaveBackoffMsRef.current
        chatSaveBackoffUntilRef.current = now + delay
        chatSaveBackoffMsRef.current = Math.min(delay * 2, 30_000)
    }

    const resetChatSaveBackoff = () => {
        chatSaveBackoffUntilRef.current = 0
        chatSaveBackoffMsRef.current = 1000
    }

    const scheduleChatSaveFlush = () => {
        if (typeof window === 'undefined') return
        if (chatSaveFlushTimerRef.current !== null) return
        chatSaveFlushTimerRef.current = window.setTimeout(() => {
            chatSaveFlushTimerRef.current = null
            void flushChatSaveQueue()
        }, 500)
    }

    const flushChatSaveQueue = async () => {
        if (typeof window === 'undefined') return
        if (chatSaveInFlightRef.current) return
        if (Date.now() < chatSaveBackoffUntilRef.current) return

        const batch = chatSaveQueueRef.current.splice(0, 50)
        if (batch.length === 0) return

        chatSaveInFlightRef.current = true
        try {
            const res = await fetch('/api/chat/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messages: batch }),
            })

            if (!res.ok) {
                throw new Error(`chat save failed (${res.status})`)
            }

            resetChatSaveBackoff()
        } catch (e) {
            // Drop batch (non-critical) and back off to avoid flooding the origin during outages.
            bumpChatSaveBackoff()
        } finally {
            chatSaveInFlightRef.current = false
            // Keep flushing if more messages are queued (but allow the browser to breathe)
            if (chatSaveQueueRef.current.length > 0) {
                scheduleChatSaveFlush()
            }
        }
    }

    const enqueueChatSave = (message: ChatMessage) => {
        if (typeof window === 'undefined') return
        if (Date.now() < chatSaveBackoffUntilRef.current) return

        chatSaveQueueRef.current.push(message)
        // Cap memory in case something goes wild
        if (chatSaveQueueRef.current.length > 300) {
            chatSaveQueueRef.current.splice(0, chatSaveQueueRef.current.length - 300)
        }

        if (chatSaveQueueRef.current.length >= 25) {
            void flushChatSaveQueue()
            return
        }

        scheduleChatSaveFlush()
    }

    const bumpSweetCoinsBackoff = () => {
        const now = Date.now()
        const delay = sweetCoinsBackoffMsRef.current
        sweetCoinsBackoffUntilRef.current = now + delay
        sweetCoinsBackoffMsRef.current = Math.min(delay * 2, 60_000)
    }

    const resetSweetCoinsBackoff = () => {
        sweetCoinsBackoffUntilRef.current = 0
        sweetCoinsBackoffMsRef.current = 2000
    }

    // Cleanup any pending flush timers on unmount
    useEffect(() => {
        return () => {
            if (chatSaveFlushTimerRef.current !== null) {
                clearTimeout(chatSaveFlushTimerRef.current)
                chatSaveFlushTimerRef.current = null
            }
        }
    }, [])

    // Load recent emotes from localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !emotesLoaded) return
        const stored = localStorage.getItem('kick_recent_emotes')
        if (stored) {
            try {
                const recentIds = JSON.parse(stored)
                const recent = recentIds
                    .map((id: string) => Array.from(emoteMap.values()).find(e => e.id === id))
                    .filter(Boolean) as Emote[]
                setRecentEmotes(recent)
            } catch {
                setRecentEmotes([])
            }
        }
    }, [emotesLoaded, emoteMap])

    // Load pinned messages from localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !chatroomId) return
        const storageKey = `kick_pinned_messages_${chatroomId}`
        const stored = localStorage.getItem(storageKey)
        if (stored) {
            try {
                const parsed = JSON.parse(stored)
                setPinnedMessages(parsed)
            } catch {
                setPinnedMessages([])
            }
        }
    }, [chatroomId])

    // Load pinned lock state
    useEffect(() => {
        if (typeof window === 'undefined' || !chatroomId) return
        const storageKey = `kick_pinned_locked_${chatroomId}`
        const stored = localStorage.getItem(storageKey)
        if (stored === 'true') {
            setPinnedLocked(true)
        }
    }, [chatroomId])

    // Save pinned messages to localStorage
    useEffect(() => {
        if (typeof window === 'undefined' || !chatroomId) return
        const storageKey = `kick_pinned_messages_${chatroomId}`
        localStorage.setItem(storageKey, JSON.stringify(pinnedMessages))
    }, [pinnedMessages, chatroomId])

    // Save pinned lock state
    useEffect(() => {
        if (typeof window === 'undefined' || !chatroomId) return
        const storageKey = `kick_pinned_locked_${chatroomId}`
        localStorage.setItem(storageKey, pinnedLocked.toString())
    }, [pinnedLocked, chatroomId])

    // Handle scroll position tracking
    useEffect(() => {
        const container = chatContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const scrollTop = container.scrollTop
            const scrollHeight = container.scrollHeight
            const clientHeight = container.clientHeight
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

            if (isNearBottom) {
                setIsScrolledUp(false)
                setShowNewMessagesSeparator(false)
            } else {
                setIsScrolledUp(true)
            }
        }

        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
    }, [])

    // Load access token from cookies/localStorage (no longer from URL params)
    useEffect(() => {
        if (typeof window === 'undefined') return

        // Get token from cookies or localStorage (backward compatibility)
        const token = getAccessToken()
        if (token && token.trim().length > 0) {
            setAccessToken(token)
        } else {
            console.error('❌ [TOKEN] No valid token found')
        }

        // Fetch current user data
        const fetchUserData = async () => {
            const currentToken = getAccessToken()
            if (currentToken) {
                try {
                    const response = await fetch(`/api/user?access_token=${encodeURIComponent(currentToken)}`)
                    if (response.ok) {
                        const data = await response.json()
                        setCurrentUserId(data.id)
                        setUserData(data)
                    } else if (response.status === 401) {
                        // Token expired, try to refresh
                        const refreshToken = getRefreshToken()
                        if (refreshToken) {
                            try {
                                const refreshResponse = await fetch('/api/auth/refresh', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        refresh_token: refreshToken,
                                    }),
                                })
                                if (refreshResponse.ok) {
                                    const refreshData = await refreshResponse.json()
                                    // Update tokens in both cookies and localStorage
                                    setAuthTokens(refreshData.access_token, refreshData.refresh_token)
                                    setAccessToken(refreshData.access_token)
                                    // Retry user fetch
                                    const retryResponse = await fetch(`/api/user?access_token=${encodeURIComponent(refreshData.access_token)}`)
                                    if (retryResponse.ok) {
                                        const retryData = await retryResponse.json()
                                        setCurrentUserId(retryData.id)
                                        setUserData(retryData)
                                    }
                                }
                            } catch (refreshError) {
                                console.error('Failed to refresh token:', refreshError)
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch user data:', error)
                }
            }
        }
        fetchUserData()
    }, [])

    // Load emotes from API
    useEffect(() => {
        if (!chatroomId) return

        const fetchEmotes = async () => {
            try {
                console.log(`🎭 [ChatFrame] Fetching emotes for chatroom_id=${chatroomId}, slug=${slug || 'sweetflips'}`)
                const response = await fetch(`/api/emotes?chatroom_id=${chatroomId}&slug=${slug || 'sweetflips'}`)

                if (response.ok) {
                    const data = await response.json()
                    console.log(`✅ [ChatFrame] Received emote data:`, {
                        total: data.total,
                        hasAll: !!data.all,
                        allCount: data.all?.length || 0,
                        hasCategorized: !!data.emotes && typeof data.emotes === 'object',
                        categorizedCounts: data.emotes && typeof data.emotes === 'object' ? {
                            emojis: data.emotes.emojis?.length || 0,
                            channel: data.emotes.channel?.length || 0,
                            global: data.emotes.global?.length || 0,
                        } : null,
                    })

                    // Handle both old format (array) and new format (categorized)
                    const emotesToProcess = data.all || (Array.isArray(data.emotes) ? data.emotes : [])

                    console.log(`📦 [ChatFrame] Processing ${emotesToProcess?.length || 0} emotes`)

                    if (emotesToProcess && Array.isArray(emotesToProcess)) {
                        const newEmoteMap = new Map<string, Emote>()

                        emotesToProcess.forEach((emote: Emote) => {
                            if (emote.id) {
                                newEmoteMap.set(emote.id, emote)
                            }
                        })

                        console.log(`🗺️  [ChatFrame] Created emote map with ${newEmoteMap.size} emotes`)
                        setEmoteMap(newEmoteMap)

                        // Store categorized emotes if available
                        if (data.emotes && typeof data.emotes === 'object' && !Array.isArray(data.emotes)) {
                            const categorized = {
                                emojis: data.emotes.emojis || [],
                                channel: data.emotes.channel || [],
                                global: data.emotes.global || [],
                            }
                            console.log(`📊 [ChatFrame] Setting categorized emotes:`, {
                                emojis: categorized.emojis.length,
                                channel: categorized.channel.length,
                                global: categorized.global.length,
                            })
                            setCategorizedEmotes(categorized)
                        } else {
                            // Fallback: categorize from all emotes if not provided
                            const capitalizeSlug = (slugStr: string) => {
                                return slugStr
                                    .split(/[-_\s]/)
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                    .join('')
                            }

                            const channelPrefix = capitalizeSlug(slug || 'sweetflips')
                            const emojis: Emote[] = []
                            const channelEmotes: Emote[] = []
                            const globalEmotes: Emote[] = []

                            emotesToProcess.forEach((emote: Emote) => {
                                const emoteNameLower = emote.name.toLowerCase()

                                if (emoteNameLower.startsWith('emoji')) {
                                    emojis.push(emote)
                                } else if (emote.name.startsWith(channelPrefix) || emoteNameLower.startsWith(channelPrefix.toLowerCase())) {
                                    channelEmotes.push(emote)
                                } else {
                                    globalEmotes.push(emote)
                                }
                            })

                            const fallbackCategorized = {
                                emojis,
                                channel: channelEmotes,
                                global: globalEmotes,
                            }
                            console.log(`📊 [ChatFrame] Fallback categorization:`, {
                                emojis: fallbackCategorized.emojis.length,
                                channel: fallbackCategorized.channel.length,
                                global: fallbackCategorized.global.length,
                            })
                            setCategorizedEmotes(fallbackCategorized)
                        }

                        setEmotesLoaded(true)
                        console.log(`✅ [ChatFrame] Emotes loaded successfully`)
                    }
                } else {
                    console.error(`❌ [ChatFrame] Failed to fetch emotes:`, response.status, response.statusText)
                    const errorText = await response.text()
                    console.error(`❌ [ChatFrame] Error response:`, errorText)
                }
            } catch (error) {
                console.error(`❌ [ChatFrame] Error fetching emotes:`, error)
            }
        }

        fetchEmotes()
    }, [chatroomId, slug])

    useEffect(() => {
        // Load messages from database API - don't require chatroomId, just broadcasterUserId
        const loadMessagesFromDatabase = async () => {
            try {
                setChatLoading(true)
                const params = new URLSearchParams()
                if (broadcasterUserId) {
                    params.append('broadcaster_user_id', broadcasterUserId.toString())
                } else {
                    console.warn('[ChatFrame] broadcasterUserId missing, loading all messages')
                }
                params.append('limit', '500') // Load last 500 messages (includes offline messages)

                console.log(`[ChatFrame] Loading messages with params: ${params.toString()}`)
                const response = await fetch(`/api/chat?${params.toString()}`)

                if (!response.ok) {
                    const errorText = await response.text()
                    console.error(`[ChatFrame] Failed to fetch messages: ${response.status} - ${errorText}`)
                    return
                }

                const data = await response.json()
                console.log(`[ChatFrame] Received ${data.messages?.length || 0} messages from API`)

                if (data.messages && Array.isArray(data.messages)) {
                    // Ensure messages are properly formatted and sorted by timestamp
                    const formattedMessages = data.messages
                        .map((msg: ChatMessage) => ({
                            ...msg,
                            sender: {
                                ...msg.sender,
                                is_verified: msg.sender.is_verified || isVerifiedUser(
                                    msg.sender.username || '',
                                    msg.sender.identity?.badges || []
                                ),
                                identity: msg.sender.identity || {
                                    username_color: '#FFFFFF',
                                    badges: [],
                                },
                            },
                        }))
                        .sort((a: ChatMessage, b: ChatMessage) => a.timestamp - b.timestamp)

                    setChatMessages(formattedMessages)

                    // Mark all loaded messages as processed to prevent duplicate saves
                    formattedMessages.forEach((msg: ChatMessage) => {
                        processedMessageIdsRef.current.add(msg.message_id)
                    })

                    // Scroll to bottom after messages load
                    setTimeout(() => {
                        if (chatContainerRef.current) {
                            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
                        }
                    }, 100)
                } else {
                    console.warn('[ChatFrame] No messages in response or invalid format:', data)
                }
            } catch (error) {
                console.error('[ChatFrame] Failed to load messages from database:', error)
            } finally {
                setChatLoading(false)
            }
        }

        loadMessagesFromDatabase()

        // Connect to Kick's Pusher for real-time chat updates
        // Use Kick's Pusher credentials (from Kick's frontend WebSocket connection)
        const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY || '32cbd69e4b950bf97679' // Kick's public Pusher key
        const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2' // Kick uses us2 cluster
        const pusherWsHost = process.env.NEXT_PUBLIC_PUSHER_WS_HOST || `ws-${pusherCluster}.pusher.com`

        // Clean up any existing Pusher instance before creating a new one
        if (pusherRef.current) {
            try {
                const existingPusher = pusherRef.current
                if (existingPusher.connection) {
                    const state = existingPusher.connection.state
                    if (state !== 'closed' && state !== 'disconnected') {
                        existingPusher.disconnect()
                    }
                }
            } catch (e) {
                console.debug('Error cleaning up existing Pusher instance:', e)
            }
            pusherRef.current = null
        }

        const pusher = new Pusher(pusherKey, {
            cluster: pusherCluster,
            wsHost: pusherWsHost,
            wsPort: 443,
            wssPort: 443,
            enabledTransports: ['ws', 'wss'],
            forceTLS: true,
        })

        pusherRef.current = pusher

        // Store handlers in refs so they can be cleaned up properly
        const handleConnected = () => {
            // Check if pusher is still valid before updating state
            if (pusherRef.current && pusherRef.current.connection) {
                const state = pusherRef.current.connection.state
                if (state === 'connected' || state === 'connecting') {
                    setPusherConnected(true)
                    setChatLoading(false)
                }
            }
        }

        const handleDisconnected = () => {
            setPusherConnected(false)
        }

        // Only bind if connection exists and is not already closed
        if (pusher.connection) {
            const currentState = pusher.connection.state
            if (currentState !== 'closed' && currentState !== 'disconnected') {
                pusher.connection.bind('connected', handleConnected)
                pusher.connection.bind('disconnected', handleDisconnected)
            }
        }

        const channelName = `chatrooms.${chatroomId}.v2`
        const channelNameAlt = `chatrooms.${chatroomId}`

        let channel: any = null
        let channelAlt: any = null

        try {
            // Only subscribe if pusher is valid
            if (pusher.connection && pusher.connection.state !== 'closed') {
                channel = pusher.subscribe(channelName)
                channelAlt = pusher.subscribe(channelNameAlt)
            }
        } catch (subscribeError) {
            console.warn('Error subscribing to Pusher channels:', subscribeError)
        }

        const handleChatMessage = async (data: any) => {
            // Early return if Pusher is no longer valid
            if (!pusherRef.current || !pusherRef.current.connection) {
                return
            }

            const connectionState = pusherRef.current.connection.state
            if (connectionState === 'closed' || connectionState === 'disconnected' || connectionState === 'disconnecting') {
                return
            }

            let parsedData = data
            if (typeof data === 'string') {
                try {
                    parsedData = JSON.parse(data)
                } catch (e) {
                    return
                }
            }

            let messageData = parsedData
            if (parsedData.message) messageData = parsedData.message
            if (parsedData.data) {
                if (typeof parsedData.data === 'string') {
                    try {
                        messageData = JSON.parse(parsedData.data)
                    } catch (e) {
                        messageData = parsedData.data
                    }
                } else {
                    messageData = parsedData.data
                }
            }

            if (!messageData.content && !messageData.message && !messageData.text) return

            // Extract message ID - ensure it's always present and unique
            // Prefer IDs from Kick API, but generate a reliable fallback if missing
            let messageId = messageData.id ||
                           messageData.message_id ||
                           messageData.data?.id ||
                           messageData.data?.message_id ||
                           null

            // If no message ID provided, generate a deterministic unique ID
            // Use sender ID + timestamp + content hash to ensure uniqueness even if same message arrives twice
            if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
                const senderId = messageData.sender?.id || messageData.sender?.user_id || messageData.user_id || 'unknown'
                const timestamp = messageData.created_at ? new Date(messageData.created_at).getTime() : Date.now()
                const content = messageData.content || messageData.message || messageData.text || ''
                // Create a deterministic hash-based ID to avoid collisions
                const contentHash = content.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
                messageId = `kick_${senderId}_${timestamp}_${contentHash}_${Math.random().toString(36).substr(2, 9)}`
            }

            // Validate message ID format (should be non-empty string)
            if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
                console.warn('⚠️ Failed to generate valid message_id, skipping message:', messageData)
                return
            }

            const message: ChatMessage = {
                message_id: messageId,
                broadcaster: {
                    is_anonymous: false,
                    user_id: broadcasterUserId || 42962282,
                    username: username || 'sweetflips',
                    is_verified: false,
                    channel_slug: slug || 'sweetflips',
                    identity: null,
                },
                sender: {
                    is_anonymous: messageData.sender?.is_anonymous || false,
                    user_id: messageData.sender?.id || messageData.sender?.user_id || messageData.user_id || 0,
                    username: messageData.sender?.username || messageData.username || 'Unknown',
                    is_verified: messageData.sender?.is_verified || isVerifiedUser(
                        messageData.sender?.username || messageData.username || '',
                        messageData.sender?.identity?.badges || messageData.badges || []
                    ),
                    profile_picture: messageData.sender?.profile_picture || messageData.profile_picture,
                    channel_slug: messageData.sender?.slug || messageData.slug || '',
                    identity: {
                        username_color: messageData.sender?.identity?.color || messageData.sender?.identity?.username_color || messageData.color || '#FFFFFF',
                        badges: (messageData.sender?.identity?.badges || messageData.badges || []).map((badge: any) => ({
                            text: badge.text || badge.type || '',
                            type: badge.type || '',
                            count: badge.count,
                        })),
                    },
                },
                content: messageData.content || messageData.message || messageData.text || '',
                emotes: (() => {
                    let emotes = messageData.emotes || messageData.emote || []
                    if (messageData.all && Array.isArray(messageData.all)) {
                        emotes = messageData.all
                    }
                    if (!Array.isArray(emotes)) {
                        emotes = []
                    }
                    return emotes
                })(),
                timestamp: messageData.created_at ? new Date(messageData.created_at).getTime() : Date.now(),
            }

            if (!message.content || !message.sender.user_id) {
                console.warn('⚠️ Skipping message with missing content or user_id:', message)
                return
            }

            // Check if we've already processed this message
            if (processedMessageIdsRef.current.has(message.message_id)) {
                return
            }

            // Mark message as processed
            processedMessageIdsRef.current.add(message.message_id)

            // Update UI with new message
            setChatMessages((prev) => {
                const exists = prev.some(m => m.message_id === message.message_id)
                if (exists) return prev

                const updated = [...prev, message].sort((a, b) => a.timestamp - b.timestamp)

                // Check scroll position
                const container = chatContainerRef.current
                if (container) {
                    const scrollTop = container.scrollTop
                    const scrollHeight = container.scrollHeight
                    const clientHeight = container.clientHeight
                    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

                    if (!isNearBottom) {
                        setShowNewMessagesSeparator(true)
                    }

                    if (!pinnedLocked && isNearBottom) {
                        setTimeout(() => {
                            if (chatContainerRef.current) {
                                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
                            }
                        }, 100)
                    }
                }

                return updated
            })

            // Fallback: Save message to database (webhook may not receive all messages)
            // Batched + backoff to avoid hammering the origin when it’s unhealthy
            enqueueChatSave(message)
        }

        const bindEvents = (ch: any) => {
            ch.bind('App\\Events\\ChatMessageEvent', (data: any) => handleChatMessage(data))
            ch.bind_global((eventName: string, data: any) => {
                if (eventName.startsWith('pusher:')) return
                if (data && (data.content || data.message || data.text || data.data?.content || data.data?.message)) {
                    handleChatMessage(data)
                }
            })
        }

        // Only bind events if channels were successfully created
        if (channel) {
            try {
                bindEvents(channel)
            } catch (e) {
                console.warn('Error binding events to channel:', e)
            }
        }
        if (channelAlt) {
            try {
                bindEvents(channelAlt)
            } catch (e) {
                console.warn('Error binding events to channelAlt:', e)
            }
        }

        // Poll for updated points on pending messages
        const pollForUpdatedPoints = () => {
            // Use functional update to get latest state
            setChatMessages((currentMessages) => {
                // Find messages that might need point updates
                const pendingMessageIds = currentMessages
                    .filter((msg) => {
                        // Check if message is pending points
                        return (
                            !msg.sent_when_offline &&
                            (msg.sweet_coins_earned === undefined ||
                                msg.sweet_coins_earned === 0 ||
                                msg.sweet_coins_reason === 'pending')
                        )
                    })
                    .map((msg) => msg.message_id)
                    .slice(0, 100) // Limit to 100 messages per poll

                if (pendingMessageIds.length === 0) {
                    return currentMessages // No change
                }

                // If the endpoint is unhealthy, back off to avoid spamming 5xx/502s
                if (Date.now() < sweetCoinsBackoffUntilRef.current) {
                    return currentMessages
                }

                // Fetch updated sweet coins (async, don't await)
                fetch('/api/chat/sweet-coins', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ messageIds: pendingMessageIds }),
                })
                    .then((response) => {
                        if (!response.ok) {
                            bumpSweetCoinsBackoff()
                            return null
                        }
                        resetSweetCoinsBackoff()
                        return response.json()
                    })
                    .then((data) => {
                        if (!data || !data.sweet_coins) {
                            return
                        }

                        // Update messages with new sweet coins
                        setChatMessages((prev) => {
                            return prev.map((msg) => {
                                const updated = data.sweet_coins[msg.message_id]
                                if (updated && updated.sweet_coins_earned !== undefined) {
                                    // Only update if points changed
                                    if (
                                        msg.sweet_coins_earned !== updated.sweet_coins_earned ||
                                        msg.sweet_coins_reason !== updated.sweet_coins_reason
                                    ) {
                                        return {
                                            ...msg,
                                            sweet_coins_earned: updated.sweet_coins_earned,
                                            sweet_coins_reason: updated.sweet_coins_reason || undefined,
                                        }
                                    }
                                }
                                return msg
                            })
                        })

                        // Also update pinned messages
                        setPinnedMessages((prev) => {
                            return prev.map((msg) => {
                                const updated = data.sweet_coins[msg.message_id]
                                if (updated && updated.sweet_coins_earned !== undefined) {
                                    if (
                                        msg.sweet_coins_earned !== updated.sweet_coins_earned ||
                                        msg.sweet_coins_reason !== updated.sweet_coins_reason
                                    ) {
                                        return {
                                            ...msg,
                                            sweet_coins_earned: updated.sweet_coins_earned,
                                            sweet_coins_reason: updated.sweet_coins_reason || undefined,
                                        }
                                    }
                                }
                                return msg
                            })
                        })
                    })
                    .catch((error) => {
                        // Silently handle errors - polling failures shouldn't break chat
                        bumpSweetCoinsBackoff()
                        console.debug('Failed to poll for updated points:', error)
                    })

                return currentMessages // Return unchanged for now, updates happen in fetch callback
            })
        }

        // Poll every 2 seconds for pending points
        const pointsPollInterval = setInterval(pollForUpdatedPoints, 2000)

        return () => {
            // Use ref instead of closure variable to ensure we're cleaning up the right instance
            const currentPusher = pusherRef.current

            // Clear polling interval
            clearInterval(pointsPollInterval)

            // Cleanup channels first (use local variables from closure)
            if (channel) {
                try {
                    const channelState = channel.state || 'unknown'
                    if (channelState !== 'unsubscribed') {
                        channel.unbind_all()
                        channel.unsubscribe()
                    }
                } catch (e: any) {
                    // Ignore errors if channel is already closed/unsubscribed
                    const errorMsg = e?.message || String(e || '')
                    if (!errorMsg.includes('CLOSING') && !errorMsg.includes('CLOSED')) {
                        console.warn('Error cleaning up channel:', e)
                    }
                }
            }

            if (channelAlt) {
                try {
                    const channelState = channelAlt.state || 'unknown'
                    if (channelState !== 'unsubscribed') {
                        channelAlt.unbind_all()
                        channelAlt.unsubscribe()
                    }
                } catch (e: any) {
                    // Ignore errors if channel is already closed/unsubscribed
                    const errorMsg = e?.message || String(e || '')
                    if (!errorMsg.includes('CLOSING') && !errorMsg.includes('CLOSED')) {
                        console.warn('Error cleaning up channelAlt:', e)
                    }
                }
            }

            // Unbind connection event listeners
            if (currentPusher?.connection) {
                try {
                    const connectionState = currentPusher.connection.state
                    if (connectionState !== 'closed' && connectionState !== 'disconnected') {
                        currentPusher.connection.unbind('connected', handleConnected)
                        currentPusher.connection.unbind('disconnected', handleDisconnected)
                    }
                } catch (e: any) {
                    // Ignore errors if connection is already closed
                    const errorMsg = e?.message || String(e || '')
                    if (!errorMsg.includes('CLOSING') && !errorMsg.includes('CLOSED')) {
                        console.warn('Error unbinding connection events:', e)
                    }
                }
            }

            // Disconnect pusher (use ref to ensure we disconnect the right instance)
            if (currentPusher?.connection) {
                try {
                    const state = currentPusher.connection.state
                    // Only disconnect if not already closed/disconnected/closing
                    if (state !== 'closed' && state !== 'disconnected' && state !== 'disconnecting') {
                        currentPusher.disconnect()
                    }
                } catch (e: any) {
                    // Ignore WebSocket errors - they're expected if already closed
                    const errorMsg = e?.message || String(e || '')
                    if (!errorMsg.includes('CLOSING') &&
                        !errorMsg.includes('CLOSED') &&
                        !errorMsg.includes('disconnect')) {
                        console.debug('Pusher disconnect error:', e)
                    }
                }
            }

            // Clear ref after cleanup
            pusherRef.current = null
        }
    }, [chatroomId, broadcasterUserId, slug, username])

    const handlePinMessage = (message: ChatMessage) => {
        setPinnedMessages((prev) => {
            const exists = prev.some(m => m.message_id === message.message_id)
            if (exists) {
                toastManager.show('Message is already pinned', 'warning', 3000)
                return prev
            }
            toastManager.show('Message pinned successfully', 'success', 3000)
            return [...prev, message]
        })
    }

    const handleUnpinMessage = (messageId: string) => {
        setPinnedMessages((prev) => {
            const updated = prev.filter(m => m.message_id !== messageId)
            if (updated.length !== prev.length) {
                toastManager.show('Message unpinned', 'info', 3000)
            }
            return updated
        })
    }

    const handleScrollToBottom = () => {
        const container = chatContainerRef.current
        if (container) {
            container.scrollTop = container.scrollHeight
            setShowNewMessagesSeparator(false)
            setIsScrolledUp(false)
        }
    }

    const handleSendMessage = async () => {
        // Get message content from contenteditable div (extract text including emote codes)
        const input = inputRef.current as HTMLDivElement
        const messageContent = input ? extractTextFromContentEditable(input).trim() : chatInput.trim()

        if (!messageContent || isSending) return
        if (!streamLive) {
            toastManager.show('Stream is offline — chat is read-only right now.', 'info', 3500)
            return
        }

        // Get access token from cookies/localStorage (preferred method)
        const currentToken = getAccessToken()
        if (!currentToken) {
            toastManager.show('Please authenticate with Kick first', 'error', 4000)
            return
        }

        if (!broadcasterUserId) {
            toastManager.show('Broadcaster user ID is required to send messages', 'error', 4000)
            return
        }

        setIsSending(true)

        try {
            // Send message to Kick API using Authorization header
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`,
                },
                body: JSON.stringify({
                    broadcasterUserId,
                    content: messageContent,
                    type: 'user',
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                const errorMessage = errorData.error || 'Failed to send message'
                const errorDetails = errorData.details || ''
                const isSlowMode = errorData.isSlowMode || false

                // Handle slow mode error - backend already retried, just show user-friendly message
                if (isSlowMode) {
                    toastManager.show(
                        errorDetails || 'Message sent too quickly. Please wait a moment before sending another message.',
                        'warning',
                        4000
                    )
                    setIsSending(false)
                    return
                }

                // If 401, try to refresh token first
                if (response.status === 401) {
                    const refreshToken = getRefreshToken()
                    if (refreshToken) {
                        try {
                            const refreshResponse = await fetch('/api/auth/refresh', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    refresh_token: refreshToken,
                                    kick_user_id: currentUserId?.toString(),
                                }),
                            })

                            if (refreshResponse.ok) {
                                const refreshData = await refreshResponse.json()
                                // Update tokens in both cookies and localStorage
                                setAuthTokens(refreshData.access_token, refreshData.refresh_token)
                                setAccessToken(refreshData.access_token)

                                // Retry sending message with new token using Authorization header
                                const retryResponse = await fetch('/api/chat/send', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${refreshData.access_token}`,
                                    },
                                    body: JSON.stringify({
                                        broadcasterUserId,
                                        content: messageContent,
                                        type: 'user',
                                    }),
                                })

                                if (retryResponse.ok) {
                                    // Message sent successfully after refresh
                                    if (input) {
                                        input.innerHTML = ''
                                    }
                                    setChatInput('')
                                    setTimeout(() => {
                                        const container = chatContainerRef.current
                                        if (container && !pinnedLocked && !isScrolledUp) {
                                            container.scrollTop = container.scrollHeight
                                        }
                                    }, 100)
                                    setIsSending(false)
                                    return
                                } else {
                                    // Retry failed, clear tokens
                                    console.error('❌ Failed to send message after token refresh')
                                    clearAuthTokens()
                                    setAccessToken(null)
                                    alert('Authentication failed. Please log in again.')
                                    window.location.href = '/login?error=token_refresh_failed'
                                    setIsSending(false)
                                    return
                                }
                            } else {
                                // Refresh failed, clear tokens
                                console.error('❌ Token refresh failed:', refreshResponse.status)
                                clearAuthTokens()
                                setAccessToken(null)
                            }
                        } catch (refreshError) {
                            console.error('❌ Token refresh error:', refreshError)
                            clearAuthTokens()
                            setAccessToken(null)
                        }
                    }

                    // If refresh failed or no refresh token, prompt for re-auth
                    const shouldReauth = confirm(
                        'Authentication failed. This might be because:\n' +
                        '1. Your token expired\n' +
                        '2. You need to re-authenticate with new permissions\n\n' +
                        'Would you like to re-authenticate now?'
                    )
                    if (shouldReauth) {
                        clearAuthTokens()
                        setAccessToken(null)
                        window.location.href = '/api/auth?action=authorize'
                        return
                    }
                }

                throw new Error(errorMessage + (errorDetails ? `: ${errorDetails}` : ''))
            }

            // Removed: toastManager.show('Message sent successfully', 'success', 3000)

            // Clear contenteditable input
            if (input) {
                input.innerHTML = ''
            }
            setChatInput('')

            // Scroll to bottom
            setTimeout(() => {
                const container = chatContainerRef.current
                if (container && !pinnedLocked && !isScrolledUp) {
                    container.scrollTop = container.scrollHeight
                }
            }, 100)
        } catch (error) {
            console.error('Error sending message:', error)
            const errorMessage = error instanceof Error ? error.message : 'Failed to send message. Please try again.'
            toastManager.show(errorMessage, 'error', 5000)
        } finally {
            setIsSending(false)
        }
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-kick-dark rounded-lg overflow-hidden border border-gray-200 dark:border-kick-border shadow-sm">
            {/* Chat Header */}
            <div className="flex h-11 flex-row items-center justify-between border-b border-gray-200 dark:border-kick-border px-3.5 bg-white dark:bg-kick-surface">
                <span className="text-body font-semibold text-gray-900 dark:text-kick-text">Chat</span>
                <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                        !streamLive
                            ? 'bg-gray-100 dark:bg-kick-surface-hover border-gray-300 dark:border-kick-border'
                            : pusherConnected
                                ? 'bg-kick-green/20 border-kick-green/50'
                                : 'bg-blue-100/60 dark:bg-blue-900/20 border-blue-300/50 dark:border-blue-800/50'
                    }`}
                    title={
                        !streamLive
                            ? 'Stream is offline'
                            : pusherConnected
                                ? 'Connected to live chat'
                                : 'Connecting to live chat…'
                    }
                >
                    <div
                        className={`w-2 h-2 rounded-full ${
                            !streamLive
                                ? 'bg-gray-400'
                                : pusherConnected
                                    ? 'bg-kick-green animate-pulse'
                                    : 'bg-blue-500 animate-pulse'
                        }`}
                    ></div>
                    <span
                        className={`text-xs font-medium ${
                            !streamLive
                                ? 'text-gray-700 dark:text-kick-text-secondary'
                                : pusherConnected
                                    ? 'text-kick-green'
                                    : 'text-blue-700 dark:text-blue-300'
                        }`}
                    >
                        {!streamLive ? 'Offline' : pusherConnected ? 'Live' : 'Connecting'}
                    </span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="relative flex grow flex-col overflow-hidden bg-gray-100 dark:bg-transparent">
                {/* Pinned Message Section */}
                {pinnedMessages.length > 0 && (
                    <div className="border-b border-gray-200 dark:border-kick-border px-3 py-2 bg-gray-200 dark:bg-kick-surface">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-600 dark:text-kick-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                        <span className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Pinned message</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setPinnedLocked(!pinnedLocked)
                                        toastManager.show(
                                            !pinnedLocked ? 'Pinned section locked' : 'Pinned section unlocked',
                                            'info',
                                            3000
                                        )
                                    }}
                                    className={`text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors ${pinnedLocked ? 'text-kick-purple' : ''}`}
                                    title={pinnedLocked ? "Unlock pinned message" : "Lock pinned message"}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </button>
                                {pinnedMessages.length > 0 && (
                                    <button
                                        onClick={() => {
                                            setPinnedMessages([])
                                            toastManager.show('All pinned messages cleared', 'info', 3000)
                                        }}
                                        className="text-kick-text-secondary hover:text-kick-text transition-colors"
                                        title="Clear all pinned messages"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1">
                            {pinnedMessages.map((message, index) => {
                                const usernameColor = message.sender.identity?.username_color || '#FFFFFF'
                                // In light mode, use black for readability; in dark mode use custom color
                                const effectiveUsernameColor = '#000000' // Always black in light mode for readability
                                const badges = message.sender.identity?.badges || []
                                return (
                                    <div key={message.message_id || `pinned-${index}`} className="flex items-start justify-between group">
                                        <div className="flex-1 break-words">
                                            <span className="chat-message-identity">
                                                <span className="inline-flex translate-y-[3px] items-center mr-1">
                                                    {message.sender.is_verified && (
                                                        <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                            <button type="button" className="base-badge ml-1 first:ml-0">
                                                                <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                    <img
                                                                        src="/icons/verifiedicon.svg"
                                                                        alt="Verified"
                                                                        width={16}
                                                                        height={16}
                                                                        className="object-contain"
                                                                        style={{ width: '16px', height: '16px', display: 'block' }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {badges.find(b => b.type === 'moderator') && (
                                                        <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                            <button type="button" className="base-badge ml-1 first:ml-0">
                                                                <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                    <svg version="1.1" x="0px" y="0px" viewBox="0 0 16 16" xmlSpace="preserve" width="16" height="16">
                                                                        <path d="M11.7,1.3v1.5h-1.5v1.5H8.7v1.5H7.3v1.5H5.8V5.8h-3v3h1.5v1.5H2.8v1.5H1.3v3h3v-1.5h1.5v-1.5h1.5v1.5h3v-3H8.7V8.7h1.5V7.3h1.5V5.8h1.5V4.3h1.5v-3C14.7,1.3,11.7,1.3,11.7,1.3z" style={{ fill: 'rgb(0, 199, 255)' }}></path>
                                                                    </svg>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {badges.find(b => b.type === 'founder') && (
                                                        <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                            <button type="button" className="base-badge ml-1 first:ml-0">
                                                                <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                    <img
                                                                        src="/OG.svg"
                                                                        alt="Founder"
                                                                        width={16}
                                                                        height={16}
                                                                        className="object-contain"
                                                                        style={{ width: '16px', height: '16px', display: 'block' }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {badges.find(b => b.type === 'sub_gifter') && (
                                                        <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                            <button type="button" className="base-badge ml-1 first:ml-0">
                                                                <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                        <g clipPath="url(#clip0_subgifter_pinned)">
                                                                            <path d="M7.99999 9.14999V6.62499L0.484985 3.35999V6.34499L1.14999 6.63999V12.73L7.99999 16V9.14999Z" fill="#2FA604"></path>
                                                                            <path d="M8.00002 10.74V9.61501L1.15002 6.64001V7.71001L8.00002 10.74Z" fill="#2FA604"></path>
                                                                            <path d="M15.515 3.355V6.345L14.85 6.64V12.73L12.705 13.755L11.185 14.48L8.00499 15.995V6.715L4.81999 5.295H4.81499L3.29499 4.61L0.484985 3.355L3.66999 1.935L3.67999 1.93L5.09499 1.3L8.00499 0L10.905 1.3L12.32 1.925L12.33 1.935L15.515 3.355Z" fill="#53F918"></path>
                                                                            <path d="M14.85 6.64001V7.71001L8 10.74V9.61501L14.85 6.64001Z" fill="#2FA604"></path>
                                                                        </g>
                                                                        <defs>
                                                                            <clipPath id="clip0_subgifter_pinned">
                                                                                <rect width="16" height="16" fill="white"></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                    </svg>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Subscriber badge */}
                                                    {(() => {
                                                        const subBadge = badges.find(b =>
                                                            b.type === 'subscriber' ||
                                                            b.type === 'sub' ||
                                                            (b.type && b.type.toLowerCase().includes('sub') && b.type !== 'sub_gifter' && b.type !== 'founder')
                                                        )
                                                        if (!subBadge) return null

                                                        // Determine badge image based on subscription months (count)
                                                        const months = subBadge.count || 1
                                                        let badgeImage = '/Base.png' // Default/base badge

                                                        if (months >= 9) {
                                                            badgeImage = '/rewards/9-Months.png'
                                                        } else if (months >= 6) {
                                                            badgeImage = '/rewards/6-Month.png'
                                                        } else if (months >= 3) {
                                                            badgeImage = '/rewards/3-Month.png'
                                                        } else if (months >= 2) {
                                                            badgeImage = '/rewards/2-Month.png'
                                                        }

                                                        return (
                                                            <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                <button type="button" className="base-badge ml-1 first:ml-0">
                                                                    <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                        <Image
                                                                            src={badgeImage}
                                                                            alt={`${months} month${months !== 1 ? 's' : ''} subscriber`}
                                                                            width={16}
                                                                            height={16}
                                                                            className="object-contain"
                                                                            unoptimized
                                                                        />
                                                                    </div>
                                                                </button>
                                                            </div>
                                                        )
                                                    })()}

                                                    <span className="chat-entry-username" style={{ color: usernameColor, fontSize: '0.875rem', fontWeight: '700', lineHeight: '1.5', display: 'inline' }}>
                                                        {message.sent_when_offline ? (
                                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 dark:bg-red-500/30 border border-red-500/40 dark:border-red-500/50">
                                                                <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">OFFLINE</span>
                                                                <span>{message.sender.username}</span>
                                                            </span>
                                                        ) : (
                                                            message.sender.username
                                                        )}
                                                    </span>
                                                </span>
                                            </span>
                                            <span className="font-bold text-gray-900 dark:text-kick-text mx-1">: </span>
                                            <span className="chat-entry-content inline" style={{ verticalAlign: 'baseline' }}>
                                                {renderMessageWithEmotes(message.content, message.emotes, emoteMap)}
                                            </span>
                                            <span className="ml-2 inline-flex items-center gap-1 flex-shrink-0">
                                                {!message.sent_when_offline && message.sweet_coins_earned !== undefined ? (
                                                    message.sweet_coins_earned === 0 ? (
                                                        message.sweet_coins_reason === 'Kick account not connected' ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/20 dark:bg-red-500/30 text-red-600 dark:text-red-400 border border-red-500/40 dark:border-red-500/50">
                                                                <Image
                                                                    src="/logos/kick-icon.svg"
                                                                    alt="Kick logo"
                                                                    width={14}
                                                                    height={14}
                                                                    className="w-3.5 h-3.5"
                                                                    unoptimized
                                                                />
                                                                <span>No Kick connect</span>
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-kick-surface-hover text-kick-text-secondary border border-kick-border">
                                                                <img
                                                                    src="https://www.clipartmax.com/png/small/360-3608833_alarm-timeout-comments-icon.png"
                                                                    alt="Timeout - Message sent too quickly"
                                                                    className="w-3.5 h-3.5"
                                                                    title="Message sent too quickly (rate limited)"
                                                                />
                                                                <span>0 Sweet Coins</span>
                                                            </span>
                                                        )
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-kick-green/20 dark:bg-kick-green/30 text-kick-green dark:text-kick-green border border-kick-green/30 dark:border-kick-green/50">
                                                            +{message.sweet_coins_earned} {message.sweet_coins_earned !== 1 ? 'Sweet Coins' : 'Sweet Coin'}
                                                        </span>
                                                    )
                                                ) : null}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleUnpinMessage(message.message_id)}
                                            className="ml-2 opacity-0 group-hover:opacity-100 text-kick-text-secondary hover:text-kick-text transition-all"
                                            title="Unpin message"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="overflow-x-hidden overflow-y-scroll py-3 flex-1 bg-gray-100 dark:bg-transparent" id="chat-container" ref={chatContainerRef}>
                    {chatLoading && chatMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 dark:text-kick-text-secondary">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-kick-purple mb-3"></div>
                            <p className="text-small">Loading chat messages...</p>
                        </div>
                    ) : chatMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 dark:text-kick-text-secondary">
                            <p className="text-small font-medium">No chat messages yet</p>
                            <p className="text-xs mt-1 text-gray-600 dark:text-kick-text-secondary">
                                {pusherConnected ? 'Connected - waiting for messages...' : 'Connecting...'}
                            </p>
                        </div>
                    ) : (
                        <div id="chat-messages">
                            {showNewMessagesSeparator && (
                                <div className="relative flex items-center justify-center py-2 px-2">
                                    <div className="flex-1 border-t border-kick-green"></div>
                                    <button
                                        onClick={handleScrollToBottom}
                                        className="mx-3 px-2 py-1 text-xs font-medium text-kick-green hover:text-kick-green transition-colors cursor-pointer"
                                    >
                                        New messages
                                    </button>
                                    <div className="flex-1 border-t border-kick-green"></div>
                                </div>
                            )}
                            {chatMessages.map((message, index) => {
                                // Ensure message has required fields
                                if (!message || !message.sender || !message.content) {
                                    return null
                                }

                                const usernameColor = message.sender.identity?.username_color || '#FFFFFF'
                                // In light mode, use black for readability; in dark mode use custom color
                                const effectiveUsernameColor = '#000000' // Always black in light mode for readability
                                const badges = message.sender.identity?.badges || []

                                return (
                                    <div key={message.message_id || `msg-${index}`} className="break-words px-3 py-1 group hover:bg-gray-50 dark:hover:bg-kick-surface/50 transition-colors" data-chat-entry={message.message_id}>
                                        <div className="chat-entry">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="chat-message-identity">
                                                        <span className="inline-flex items-center mr-1">
                                                            {message.sender.is_verified && (
                                                                <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                    <button type="button" className="base-badge ml-1 first:ml-0">
                                                                        <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                            <img
                                                                                src="/icons/verifiedicon.svg"
                                                                                alt="Verified"
                                                                                width={16}
                                                                                height={16}
                                                                                className="object-contain"
                                                                                style={{ width: '16px', height: '16px', display: 'block' }}
                                                                            />
                                                                        </div>
                                                                    </button>
                                                                </div>
                                                            )}

                                                    {badges.find(b => b.type === 'moderator') && (
                                                        <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                            <button type="button" className="base-badge ml-1 first:ml-0">
                                                                <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                    <img
                                                                        src="/icons/mod.svg"
                                                                        alt="Moderator"
                                                                        width={16}
                                                                        height={16}
                                                                        className="object-contain"
                                                                        style={{ width: '16px', height: '16px', display: 'block' }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}

                                                            {badges.find(b => b.type === 'vip') && (
                                                                <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                    <button type="button" className="base-badge ml-1 first:ml-0">
                                                                        <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                            <Image
                                                                                src="/icons/vip.svg"
                                                                                alt="VIP"
                                                                                width={16}
                                                                                height={16}
                                                                                className="object-contain"
                                                                                unoptimized
                                                                            />
                                                                        </div>
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {badges.find(b => b.type === 'founder') && (
                                                                <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                    <button type="button" className="base-badge ml-1 first:ml-0">
                                                                        <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                            <Image
                                                                                src="/OG.svg"
                                                                                alt="Founder"
                                                                                width={16}
                                                                                height={16}
                                                                                className="object-contain"
                                                                                unoptimized
                                                                            />
                                                                        </div>
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {badges.find(b => b.type === 'sub_gifter') && (
                                                                <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                    <button type="button" className="base-badge ml-1 first:ml-0">
                                                                        <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                                <g clipPath="url(#clip0_301_17830)">
                                                                                    <path d="M7.99999 9.14999V6.62499L0.484985 3.35999V6.34499L1.14999 6.63999V12.73L7.99999 16V9.14999Z" fill="#2FA604"></path>
                                                                                    <path d="M8.00002 10.74V9.61501L1.15002 6.64001V7.71001L8.00002 10.74Z" fill="#2FA604"></path>
                                                                                    <path d="M15.515 3.355V6.345L14.85 6.64V12.73L12.705 13.755L11.185 14.48L8.00499 15.995V6.715L4.81999 5.295H4.81499L3.29499 4.61L0.484985 3.355L3.66999 1.935L3.67999 1.93L5.09499 1.3L8.00499 0L10.905 1.3L12.32 1.925L12.33 1.935L15.515 3.355Z" fill="#53F918"></path>
                                                                                    <path d="M14.85 6.64001V7.71001L8 10.74V9.61501L14.85 6.64001Z" fill="#2FA604"></path>
                                                                                </g>
                                                                                <defs>
                                                                                    <clipPath id="clip0_301_17830">
                                                                                        <rect width="16" height="16" fill="white"></rect>
                                                                                    </clipPath>
                                                                                </defs>
                                                                            </svg>
                                                                        </div>
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {/* Subscriber badge */}
                                                            {(() => {
                                                                const subBadge = badges.find(b =>
                                                                    b.type === 'subscriber' ||
                                                                    b.type === 'sub' ||
                                                                    (b.type && b.type.toLowerCase().includes('sub') && b.type !== 'sub_gifter' && b.type !== 'founder')
                                                                )
                                                                if (!subBadge) return null

                                                                // Determine badge image based on subscription months (count)
                                                                const months = subBadge.count || 1
                                                                let badgeImage = '/Base.png' // Default/base badge

                                                                if (months >= 9) {
                                                                    badgeImage = '/rewards/9-Months.png'
                                                                } else if (months >= 6) {
                                                                    badgeImage = '/rewards/6-Month.png'
                                                                } else if (months >= 3) {
                                                                    badgeImage = '/rewards/3-Month.png'
                                                                } else if (months >= 2) {
                                                                    badgeImage = '/rewards/2-Month.png'
                                                                }

                                                                return (
                                                                    <div className="relative badge-tooltip h-4 ml-1 first:ml-0">
                                                                        <button type="button" className="base-badge ml-1 first:ml-0">
                                                                            <div className="base-icon icon size-sm" style={{ width: '16px', height: '16px' }}>
                                                                                <Image
                                                                                    src={badgeImage}
                                                                                    alt={`${months} month${months !== 1 ? 's' : ''} subscriber`}
                                                                                    width={16}
                                                                                    height={16}
                                                                                    className="object-contain"
                                                                                    unoptimized
                                                                                />
                                                                            </div>
                                                                        </button>
                                                                    </div>
                                                                )
                                                            })()}

                                                            <span className="chat-entry-username" style={{ color: usernameColor, fontSize: '0.875rem', fontWeight: '700', lineHeight: '1.5', display: 'inline' }}>
                                                                {message.sent_when_offline ? (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 dark:bg-red-500/30 border border-red-500/40 dark:border-red-500/50">
                                                                        <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">OFFLINE</span>
                                                                        <span>{message.sender.username}</span>
                                                                    </span>
                                                                ) : (
                                                                    message.sender.username
                                                                )}
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span className="font-bold text-gray-900 dark:text-kick-text mx-1">: </span>
                                                    <span className="chat-entry-content inline" style={{ verticalAlign: 'baseline' }}>
                                                        {renderMessageWithEmotes(message.content, message.emotes, emoteMap)}
                                                    </span>
                                                    <span className="ml-2 inline-flex items-center gap-1 flex-shrink-0">
                                                        {!message.sent_when_offline && message.sweet_coins_earned !== undefined ? (
                                                            message.sweet_coins_earned === 0 ? (
                                                                message.sweet_coins_reason === 'Kick account not connected' ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/20 dark:bg-red-500/30 text-red-600 dark:text-red-400 border border-red-500/40 dark:border-red-500/50">
                                                                        <Image
                                                                            src="/logos/kick-icon.svg"
                                                                            alt="Kick logo"
                                                                            width={14}
                                                                            height={14}
                                                                            className="w-3.5 h-3.5"
                                                                            unoptimized
                                                                        />
                                                                        <span>No Kick connect</span>
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-kick-surface-hover text-kick-text-secondary border border-kick-border">
                                                                        <img
                                                                            src="https://www.clipartmax.com/png/small/360-3608833_alarm-timeout-comments-icon.png"
                                                                            alt="Timeout - Message sent too quickly"
                                                                            className="w-3.5 h-3.5"
                                                                            title="Message sent too quickly (rate limited)"
                                                                        />
                                                                        <span>0 Sweet Coins</span>
                                                                    </span>
                                                                )
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-kick-green/20 dark:bg-kick-green/30 text-kick-green dark:text-kick-green border border-kick-green/30 dark:border-kick-green/50">
                                                                    +{message.sweet_coins_earned} {message.sweet_coins_earned !== 1 ? 'Sweet Coins' : 'Sweet Coin'}
                                                                </span>
                                                            )
                                                        ) : null}
                                                    </span>
                                                </div>
                                                {!pinnedMessages.some(m => m.message_id === message.message_id) && (
                                                    <button
                                                        onClick={() => handlePinMessage(message)}
                                                        className="ml-2 opacity-0 group-hover:opacity-100 text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-all"
                                                        title="Pin message"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Input Footer */}
            <div data-v-4e50b6cd="" id="chatroom-footer" className="chatroom-footer border-t border-gray-200 dark:border-kick-border relative bg-gray-100 dark:bg-transparent" style={{ padding: '12px 14px' }}>
                {/* Settings Menu - Opens from settings button */}
                <div className="absolute bottom-full right-0 mb-2 z-50">
                    <ChatSettings
                        isOpen={settingsOpen}
                        onClose={() => setSettingsOpen(false)}
                        userId={currentUserId}
                    />
                </div>

                {/* Quick Emote Selection Bar - Panel Tabs */}
                <div data-v-0d1a850d="" className="panel-tabs mb-2">
                    <div data-v-ea41cbb2="" className="section-emote-list flex gap-1 overflow-x-auto py-1">
                        {recentEmotes.length > 0 ? (
                            recentEmotes.slice(0, 20).map((emote) => (
                                <button
                                    key={emote.id}
                                    onClick={() => {
                                        const input = inputRef.current as HTMLDivElement
                                        if (input) {
                                            const emoteText = insertEmoteAsImage(input, emote)
                                            const textContent = extractTextFromContentEditable(input)
                                            setChatInput(textContent)
                                        }
                                    }}
                                    className="section-emote-list-item flex-shrink-0 w-8 h-8 rounded-md hover:bg-kick-green/30 dark:hover:bg-kick-surface-hover transition-colors p-1 flex items-center justify-center"
                                    title={emote.name}
                                >
                                    <Image
                                        src={getProxiedEmoteUrl(emote.url || `https://files.kick.com/emotes/${emote.id}/fullsize`)}
                                        alt={emote.name}
                                        width={24}
                                        height={24}
                                        className="w-full h-full object-contain"
                                        unoptimized
                                        crossOrigin="anonymous"
                                        referrerPolicy="no-referrer"
                                    />
                                </button>
                            ))
                        ) : (
                            Array.from(emoteMap.values()).slice(0, 20).map((emote) => (
                                <button
                                    key={emote.id}
                                    onClick={() => {
                                        const input = inputRef.current as HTMLDivElement
                                        if (input) {
                                            const emoteText = insertEmoteAsImage(input, emote)
                                            const textContent = extractTextFromContentEditable(input)
                                            setChatInput(textContent)
                                        }
                                    }}
                                    className="section-emote-list-item flex-shrink-0 w-8 h-8 rounded-md hover:bg-kick-green/30 dark:hover:bg-kick-surface-hover transition-colors p-1 flex items-center justify-center"
                                    title={emote.name}
                                >
                                    <Image
                                        src={getProxiedEmoteUrl(emote.url || `https://files.kick.com/emotes/${emote.id}/fullsize`)}
                                        alt={emote.name}
                                        width={24}
                                        height={24}
                                        className="w-full h-full object-contain"
                                        unoptimized
                                        crossOrigin="anonymous"
                                        referrerPolicy="no-referrer"
                                    />
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Send Row */}
                <div data-v-3993509a="" className="send-row">
                    <div className="relative flex flex-col gap-2.5">
                        <div className="chat-mode text-mode">
                            <div className="flex gap-2 items-center">
                            {/* Chat Input Wrapper */}
                            <div className="flex-1 relative chat-input-wrapper">
                                {/* Verified Badge Icon */}
                                <div className="chat-input-icon absolute left-2 top-1/2 -translate-y-1/2 z-10">
                                    <div className="relative">
                                        <div className="base-icon" style={{ width: '20px', height: '20px' }}>
                                            <svg version="1.1" x="0px" y="0px" viewBox="0 0 16 16" xmlSpace="preserve" width="20" height="20">
                                                <path d="M11.7,1.3v1.5h-1.5v1.5H8.7v1.5H7.3v1.5H5.8V5.8h-3v3h1.5v1.5H2.8v1.5H1.3v3h3v-1.5h1.5v-1.5h1.5v1.5h3v-3H8.7V8.7h1.5V7.3h1.5V5.8h1.5V4.3h1.5v-3C14.7,1.3,11.7,1.3,11.7,1.3z" style={{ fill: 'rgb(0, 199, 255)' }}></path>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Contenteditable Input */}
                                <div
                                    ref={inputRef as any}
                                    id="message-input"
                                    contentEditable={canChat}
                                    suppressContentEditableWarning
                                    data-placeholder={
                                        !accessToken
                                            ? 'Login to send messages'
                                            : !streamLive
                                                ? 'Stream is offline (read-only)'
                                                : 'Send message...'
                                    }
                                    spellCheck={false}
                                    onInput={(e) => {
                                        // Extract text including emote codes from contenteditable
                                        const text = extractTextFromContentEditable(e.currentTarget)
                                        setChatInput(text)

                                        // Auto-open emote picker if user types ':'
                                        if (text.endsWith(':') && !emotePickerOpen && emotesLoaded) {
                                            setEmotePickerOpen(true)
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSendMessage()
                                        }
                                        if (e.key === 'Escape') {
                                            setEmotePickerOpen(false)
                                            setSettingsOpen(false)
                                        }
                                    }}
                                    className="chat-input w-full px-10 py-2 bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text rounded-lg border border-gray-200 dark:border-kick-border focus:border-kick-purple focus:outline-none focus:ring-2 focus:ring-kick-purple/20 text-body placeholder:text-gray-500 dark:placeholder:text-kick-text-secondary disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px] max-h-[120px] overflow-y-auto"
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}
                                />

                                {/* Placeholder styling */}
                                <style dangerouslySetInnerHTML={{__html: `
                                    .chat-input:empty:before {
                                        content: attr(data-placeholder);
                                        color: rgb(107, 114, 128);
                                        pointer-events: none;
                                    }
                                    .chat-input:focus:empty:before {
                                        color: rgb(107, 114, 128);
                                    }
                                `}} />
                            </div>

                        {/* Emote Button - Opens Emote Picker */}
                        <div className="relative">
                            <button
                                ref={(el) => {
                                    if (el) {
                                        // Always store button position for emote picker positioning
                                        const rect = el.getBoundingClientRect()
                                        ;(window as any).__emoteButtonRect = rect
                                    }
                                }}
                                onClick={(e) => {
                                    // Update button position on click
                                    const rect = e.currentTarget.getBoundingClientRect()
                                    ;(window as any).__emoteButtonRect = rect
                                    setEmotePickerOpen(!emotePickerOpen)
                                    setSettingsOpen(false)
                                }}
                                disabled={!canChat}
                                className={`hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:focus:bg-gray-100 dark:hover:focus:bg-kick-surface-hover disabled:text-gray-500 dark:disabled:text-kick-text-secondary disabled:bg-gray-50 dark:disabled:bg-kick-surface relative box-border inline-flex h-8 w-8 items-center justify-center rounded bg-transparent fill-gray-900 dark:fill-kick-text p-2 font-semibold text-gray-900 dark:text-kick-text transition-colors focus:bg-transparent disabled:pointer-events-none ${
                                    emotePickerOpen
                                        ? 'bg-kick-purple'
                                        : ''
                                }`}
                                title="Emotes"
                            >
                                <div className="base-icon icon" style={{ width: '20px', height: '20px' }}>
                                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M11 2H5L2 5V11L5 14H11L14 11V5L11 2ZM10.25 5C10.8725 5 11.375 5.5025 11.375 6.125C11.375 6.7475 10.8725 7.25 10.25 7.25C9.6275 7.25 9.125 6.7475 9.125 6.125C9.125 5.5025 9.6275 5 10.25 5ZM5.75 5C6.3725 5 6.875 5.5025 6.875 6.125C6.875 6.7475 6.3725 7.25 5.75 7.25C5.1275 7.25 4.625 6.7475 4.625 6.125C4.625 5.5025 5.1275 5 5.75 5ZM11.75 9.875C11.0188 10.6062 10.6062 11.0188 9.875 11.75H6.125C5.39375 11.0188 4.98125 10.6062 4.25 9.875V8.75H11.75V9.875Z" fill="currentColor" />
                                    </svg>
                                </div>
                            </button>
                        </div>

                        {/* Emote Picker - Positioned fixed to overlay chat */}
                        {emotesLoaded && (
                            <EmotePicker
                                emotes={emoteMap}
                                categorizedEmotes={categorizedEmotes}
                                isOpen={emotePickerOpen}
                                onClose={() => setEmotePickerOpen(false)}
                                slug={slug}
                                onEmoteSelect={(emote) => {
                                    // Insert emote as visual image in contenteditable div
                                    const input = inputRef.current as HTMLDivElement
                                    if (!input) {
                                        // Fallback if input ref is not available
                                        const emoteText = emote.id.length > 10 ? emote.id : `[emote:${emote.id}:${emote.name}]`
                                        setChatInput((prev) => prev + emoteText + ' ')
                                        return
                                    }

                                    const emoteText = insertEmoteAsImage(input, emote)
                                    const textContent = extractTextFromContentEditable(input)
                                    setChatInput(textContent)
                                }}
                                />
                            )}

                        {/* Chat Button - Disabled when not logged in */}
                        <button
                            id="send-message-button"
                            onClick={handleSendMessage}
                            disabled={!chatInput.trim() || isSending || !canChat}
                            className="group inline-flex gap-1.5 items-center justify-center rounded font-semibold box-border relative transition-all disabled:pointer-events-none select-none whitespace-nowrap [&_svg]:size-[1em] outline-transparent outline-2 outline-offset-2 bg-kick-green focus-visible:outline-kick-green text-[#081902] [&_svg]:fill-current hover:bg-kick-green-dark focus-visible:bg-kick-green disabled:bg-kick-green-dark disabled:opacity-50 px-3 py-1.5 text-sm"
                            style={{
                                WebkitTextSizeAdjust: '100%',
                                tabSize: 4,
                                WebkitTapHighlightColor: 'transparent',
                                WebkitFontSmoothing: 'antialiased',
                                pointerEvents: 'auto',
                                direction: 'ltr',
                                border: '0 solid #e5e7eb',
                                fontFamily: 'inherit',
                                fontFeatureSettings: 'inherit',
                                fontVariationSettings: 'inherit',
                                letterSpacing: 'inherit',
                                margin: 0,
                                textTransform: 'none',
                                WebkitAppearance: 'button',
                                backgroundImage: 'none',
                                cursor: 'pointer',
                                position: 'relative',
                                boxSizing: 'border-box',
                                display: 'inline-flex',
                                userSelect: 'none',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.375rem',
                                whiteSpace: 'nowrap',
                                borderRadius: '0.25rem',
                                backgroundColor: 'rgba(83,252,24,1)',
                                paddingLeft: '0.75rem',
                                paddingRight: '0.75rem',
                                paddingTop: '0.375rem',
                                paddingBottom: '0.375rem',
                                fontSize: '0.875rem',
                                lineHeight: '1.25rem',
                                fontWeight: 600,
                                color: 'rgba(8,25,2,1)',
                                outlineWidth: '2px',
                                outlineOffset: '2px',
                                outlineColor: 'transparent',
                                transitionProperty: 'all',
                                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                                transitionDuration: '0.15s'
                            }}
                        >
                            {isSending ? 'Sending...' : streamLive ? 'Chat' : 'Offline'}
                        </button>
                        {!accessToken && (
                            <a
                                href={`/api/auth?action=authorize`}
                                className="px-4 py-2 bg-kick-green hover:bg-kick-green-dark text-white text-body font-medium rounded transition-colors whitespace-nowrap hidden"
                            >
                                Login
                            </a>
                        )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
