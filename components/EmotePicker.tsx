'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { toastManager } from './Toast'

interface Emote {
    id: string
    name: string
    url?: string
    original?: any
}

interface EmotePickerProps {
    emotes: Map<string, Emote>
    categorizedEmotes?: {
        emojis: Emote[]
        channel: Emote[]
        global: Emote[]
    }
    onEmoteSelect: (emote: Emote) => void
    onEmoteSend?: (emote: Emote) => void // Optional: send emote directly
    onClose: () => void
    isOpen: boolean
    slug?: string
}

export default function EmotePicker({ emotes, categorizedEmotes, onEmoteSelect, onEmoteSend, onClose, isOpen, slug }: EmotePickerProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [recentEmotes, setRecentEmotes] = useState<Emote[]>([])
    const [broadcasterProfilePicture, setBroadcasterProfilePicture] = useState<string | null>(null)
    const pickerRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

    useEffect(() => {
        if (isOpen) {
            console.log(`🎭 [EmotePicker] Opened with:`, {
                emotesCount: emotes.size,
                categorizedEmotes: categorizedEmotes ? {
                    emojis: categorizedEmotes.emojis.length,
                    channel: categorizedEmotes.channel.length,
                    global: categorizedEmotes.global.length,
                } : null,
            })
        }
    }, [isOpen, emotes, categorizedEmotes])

    useEffect(() => {
        if (!isOpen) return

        // Calculate position based on emote button
        const updatePosition = () => {
            const buttonRect = (window as any).__emoteButtonRect
            if (buttonRect) {
                const pickerHeight = 500
                const pickerWidth = 340
                const margin = 8

                // Try to position above the button first
                let top = buttonRect.top - pickerHeight - margin
                let left = buttonRect.left

                // If not enough space above, position below
                if (top < 0) {
                    top = buttonRect.bottom + margin
                }

                // Adjust if picker would go off screen horizontally
                if (left + pickerWidth > window.innerWidth) {
                    left = window.innerWidth - pickerWidth - margin
                }
                if (left < 0) {
                    left = margin
                }

                setPosition({ top, left })
            } else {
                // Fallback: position at bottom right
                setPosition({ top: window.innerHeight - 502, left: window.innerWidth - 360 })
            }
        }

        updatePosition()
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)

        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen, onClose])

    useEffect(() => {
        // Load recent emotes from localStorage for "Frequently Used" section
        const stored = localStorage.getItem('kick_recent_emotes')
        if (stored) {
            try {
                const recentIds = JSON.parse(stored)
                const recent = recentIds
                    .map((id: string) => Array.from(emotes.values()).find(e => e.id === id))
                    .filter(Boolean) as Emote[]
                setRecentEmotes(recent)
            } catch {
                setRecentEmotes([])
            }
        }
    }, [emotes])

    useEffect(() => {
        // Fetch broadcaster profile picture
        if (slug) {
            const fetchBroadcasterProfile = async () => {
                try {
                    const response = await fetch(`/api/channel?slug=${slug}`)
                    if (response.ok) {
                        const data = await response.json()
                        const profilePic = data.profile_picture || data.user?.profile_picture
                        if (profilePic) {
                            setBroadcasterProfilePicture(profilePic)
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch broadcaster profile:', error)
                }
            }
            fetchBroadcasterProfile()
        }
    }, [slug])

    if (!isOpen) return null

    const getEmoteUrl = (emote: Emote) => {
        if (emote.url) return emote.url
        return `https://files.kick.com/emotes/${emote.id}/fullsize`
    }

    const handleEmoteClick = (emote: Emote, event?: React.MouseEvent) => {
        // Save to recent (for "Frequently Used" section)
        const recentIds = JSON.parse(localStorage.getItem('kick_recent_emotes') || '[]')
        const newRecent = [emote.id, ...recentIds.filter((id: string) => id !== emote.id)].slice(0, 20)
        localStorage.setItem('kick_recent_emotes', JSON.stringify(newRecent))

        // Update recent emotes state
        setRecentEmotes(newRecent
            .map((id: string) => Array.from(emotes.values()).find(e => e.id === id))
            .filter(Boolean) as Emote[])

        // Default: insert into input field (don't send)
        onEmoteSelect(emote)
        onClose()
    }

    const getFilteredRecent = () => {
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            return recentEmotes.filter(
                (emote) =>
                    emote.name.toLowerCase().includes(query) ||
                    emote.id.toLowerCase().includes(query)
            )
        }
        return recentEmotes
    }

    const getFilteredChannelEmotes = () => {
        const channelEmotes = categorizedEmotes?.channel || []
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            return channelEmotes.filter(
                (emote) =>
                    emote.name.toLowerCase().includes(query) ||
                    emote.id.toLowerCase().includes(query)
            )
        }
        return channelEmotes
    }

    const getFilteredGlobalEmotes = () => {
        const globalEmotes = categorizedEmotes?.global || []
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            return globalEmotes.filter(
                (emote) =>
                    emote.name.toLowerCase().includes(query) ||
                    emote.id.toLowerCase().includes(query)
            )
        }
        return globalEmotes
    }

    const getFilteredEmojiEmotes = () => {
        const emojiEmotes = categorizedEmotes?.emojis || []
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            return emojiEmotes.filter(
                (emote) =>
                    emote.name.toLowerCase().includes(query) ||
                    emote.id.toLowerCase().includes(query)
            )
        }
        return emojiEmotes
    }


    if (!isOpen || !position) return null

    return (
        <div
            ref={pickerRef}
            className="chat-emote-picker-popout fixed w-[340px] bg-kick-surface border border-kick-border rounded-lg shadow-xl z-[9999] overflow-hidden"
            style={{
                maxHeight: '500px',
                top: `${position.top}px`,
                left: `${position.left}px`,
            }}
        >
            {/* Gradient fade at bottom */}
            <div className="absolute inset-x-0 bottom-0 z-10 h-3 bg-gradient-to-b from-transparent to-kick-surface pointer-events-none"></div>
            {/* Header with Search */}
            <div className="panel-header p-3 border-b border-kick-border flex items-center gap-2">
                <div className="flex-1 relative">
                    <div className="absolute top-1/2 left-2 -translate-y-1/2">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M7.25 2C10.1488 2 12.5 4.35125 12.5 7.25C12.5 8.4275 12.1062 9.51125 11.45 10.3888L14 12.9388L12.9388 14L10.3888 11.45C9.51125 12.1063 8.4275 12.5 7.25 12.5C4.35125 12.5 2 10.1488 2 7.25C2 4.35125 4.35125 2 7.25 2ZM7.25 11C9.31625 11 11 9.31625 11 7.25C11 5.18375 9.31625 3.5 7.25 3.5C5.18375 3.5 3.5 5.18375 3.5 7.25C3.5 9.31625 5.18375 11 7.25 11Z" fill="currentColor" className="text-kick-text-secondary" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Q Search emotes"
                        className="w-full pl-8 pr-8 py-2 bg-kick-dark border border-kick-border rounded-md text-kick-text text-sm placeholder:text-kick-text-secondary focus:outline-none focus:border-kick-purple focus:ring-2 focus:ring-kick-purple/20"
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-kick-text-secondary hover:text-kick-text transition-colors"
                        >
                            <svg width="12" height="12" viewBox="0 0 12 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 1.99602L10.504 0.5L6 4.99867L1.49602 0.5L0 1.99602L4.49867 6.5L0 11.004L1.49602 12.5L6 8.00133L10.504 12.5L12 11.004L7.50133 6.5L12 1.99602Z" fill="currentColor" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Content - All sections in one scrollable view */}
            <div className="p-3">
                <div className="h-[400px] overflow-y-auto">
                    <div className="grid gap-2">
                        {/* Frequently Used Section */}
                        {getFilteredRecent().length > 0 && (
                            <div className="grid gap-2">
                                <span className="text-grey-400 text-xs font-medium" id="emote-picker-section-name-Recent">Frequently Used</span>
                                <div className="grid grid-cols-8 justify-between gap-2">
                                    {getFilteredRecent().map((emote) => (
                                        <button
                                            key={emote.id}
                                            onClick={(e) => handleEmoteClick(emote, e)}
                                            className="betterhover:hover:bg-white/10 disabled:betterhover:hover:bg-white/10 relative aspect-square size-10 rounded-sm p-1 disabled:opacity-40 lg:size-9 cursor-pointer"
                                            data-state="closed"
                                            title={emote.name}
                                        >
                                            <Image
                                                src={getEmoteUrl(emote)}
                                                alt={emote.name}
                                                width={32}
                                                height={32}
                                                className="aspect-square size-8 lg:size-7"
                                                loading="lazy"
                                                unoptimized
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Emojis Section */}
                        <div className="grid gap-2">
                            <span className="text-grey-400 text-xs font-medium" id="emote-picker-section-name-Emojis">Emojis</span>
                            <div className="grid grid-cols-8 justify-between gap-2">
                                {getFilteredEmojiEmotes().length > 0 ? (
                                    getFilteredEmojiEmotes().map((emote) => (
                                        <button
                                            key={emote.id}
                                            onClick={(e) => handleEmoteClick(emote, e)}
                                            className="betterhover:hover:bg-white/10 disabled:betterhover:hover:bg-white/10 relative aspect-square size-10 rounded-sm p-1 disabled:opacity-40 lg:size-9 cursor-pointer"
                                            data-state="closed"
                                            title={emote.name}
                                        >
                                            <Image
                                                src={getEmoteUrl(emote)}
                                                alt={emote.name}
                                                width={32}
                                                height={32}
                                                className="aspect-square size-8 lg:size-7"
                                                loading="lazy"
                                                unoptimized
                                            />
                                        </button>
                                    ))
                                ) : (
                                    <div className="col-span-8 text-center py-4 text-kick-text-secondary text-sm">No emotes available</div>
                                )}
                            </div>
                        </div>

                        {/* Channel Section */}
                        {getFilteredChannelEmotes().length > 0 && (
                            <div className="grid gap-2">
                                <span className="text-grey-400 text-xs font-medium" id={`emote-picker-section-name-${slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Channel'}`}>
                                    {slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Channel'}
                                </span>
                                <div className="grid grid-cols-8 justify-between gap-2">
                                    {getFilteredChannelEmotes().map((emote) => (
                                        <button
                                            key={emote.id}
                                            onClick={(e) => handleEmoteClick(emote, e)}
                                            className="betterhover:hover:bg-white/10 disabled:betterhover:hover:bg-white/10 relative aspect-square size-10 rounded-sm p-1 disabled:opacity-40 lg:size-9 cursor-pointer"
                                            data-state="closed"
                                            title={emote.name}
                                        >
                                            <Image
                                                src={getEmoteUrl(emote)}
                                                alt={emote.name}
                                                width={32}
                                                height={32}
                                                className="aspect-square size-8 lg:size-7"
                                                loading="lazy"
                                                unoptimized
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Global Section */}
                        <div className="grid gap-2">
                            <span className="text-grey-400 text-xs font-medium" id="emote-picker-section-name-Global">Global</span>
                            <div className="grid grid-cols-8 justify-between gap-2">
                                {getFilteredGlobalEmotes().length > 0 ? (
                                    getFilteredGlobalEmotes().map((emote) => (
                                        <button
                                            key={emote.id}
                                            onClick={(e) => handleEmoteClick(emote, e)}
                                            className="betterhover:hover:bg-white/10 disabled:betterhover:hover:bg-white/10 relative aspect-square size-10 rounded-sm p-1 disabled:opacity-40 lg:size-9 cursor-pointer"
                                            data-state="closed"
                                            title={emote.name}
                                        >
                                            <Image
                                                src={getEmoteUrl(emote)}
                                                alt={emote.name}
                                                width={32}
                                                height={32}
                                                className="aspect-square size-8 lg:size-7"
                                                loading="lazy"
                                                unoptimized
                                            />
                                        </button>
                                    ))
                                ) : (
                                    <div className="col-span-8 text-center py-4 text-kick-text-secondary text-sm">No emotes available</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
