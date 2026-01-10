'use client'

import { useState, useRef, useEffect } from 'react'
import { toastManager } from './Toast'

interface ChatSettingsProps {
    onClose: () => void
    isOpen: boolean
    userId?: number
}

export default function ChatSettings({ onClose, isOpen, userId }: ChatSettingsProps) {
    const [fontSize, setFontSize] = useState('14px')
    const [showTimestamps, setShowTimestamps] = useState(false)
    const settingsRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isOpen) return

        // Load saved settings from database
        const loadSettings = async () => {
            if (userId) {
                try {
                    const response = await fetch(`/api/user/preferences?kick_user_id=${userId}`)
                    if (response.ok) {
                        const prefs = await response.json()
                        setFontSize(prefs.chat_font_size || '14px')
                        setShowTimestamps(prefs.chat_show_timestamps ?? true)
                        // Apply font size
                        document.documentElement.style.setProperty('--chat-font-size', prefs.chat_font_size || '14px')
                    }
                } catch (error) {
                    console.error('Failed to load chat settings:', error)
                    // Fallback to localStorage for backwards compatibility
                    const savedFontSize = localStorage.getItem('kick_chat_font_size') || '14px'
                    const savedShowTimestamps = localStorage.getItem('kick_chat_timestamps') === 'true'
                    setFontSize(savedFontSize)
                    setShowTimestamps(savedShowTimestamps)
                }
            } else {
                // Fallback to localStorage if no userId
                const savedFontSize = localStorage.getItem('kick_chat_font_size') || '14px'
                const savedShowTimestamps = localStorage.getItem('kick_chat_timestamps') === 'true'
                setFontSize(savedFontSize)
                setShowTimestamps(savedShowTimestamps)
            }
        }

        loadSettings()

        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen, onClose, userId])

    const handleFontSizeChange = async (size: string) => {
        setFontSize(size)
        // Apply font size change immediately
        document.documentElement.style.setProperty('--chat-font-size', size)

        // Save to database if userId available
        if (userId) {
            try {
                await fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        kick_user_id: userId,
                        chat_font_size: size,
                    }),
                })
            } catch (error) {
                console.error('Failed to save font size:', error)
                // Fallback to localStorage
                localStorage.setItem('kick_chat_font_size', size)
            }
        } else {
            localStorage.setItem('kick_chat_font_size', size)
        }

        toastManager.show(`Font size changed to ${size}`, 'success', 3000)
    }

    const handleTimestampsToggle = async (checked: boolean) => {
        setShowTimestamps(checked)

        // Save to database if userId available
        if (userId) {
            try {
                await fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        kick_user_id: userId,
                        chat_show_timestamps: checked,
                    }),
                })
            } catch (error) {
                console.error('Failed to save timestamps setting:', error)
                // Fallback to localStorage
                localStorage.setItem('kick_chat_timestamps', checked.toString())
            }
        } else {
            localStorage.setItem('kick_chat_timestamps', checked.toString())
        }

        toastManager.show(
            checked ? 'Message timestamps enabled' : 'Message timestamps disabled',
            'info',
            3000
        )
    }

    if (!isOpen) return null

    return (
        <div
            ref={settingsRef}
            className="absolute bottom-full right-0 mb-2 w-[280px] bg-kick-surface border border-kick-border rounded-lg shadow-xl z-50"
        >
            {/* Header */}
            <div className="p-3 border-b border-kick-border flex items-center justify-between">
                <h3 className="text-kick-text text-sm font-semibold">Chat Settings</h3>
                <button
                    onClick={onClose}
                    className="text-kick-text-secondary hover:text-kick-text transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Settings Content */}
            <div className="p-0">
                {/* Identity */}
                <button
                    onClick={() => {
                        toastManager.show('Identity settings - Coming soon!', 'info', 3000)
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-kick-surface-hover transition-colors border-b border-kick-border"
                >
                    <span className="text-kick-text text-sm font-medium">Identity</span>
                    <svg className="w-4 h-4 text-kick-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Show Gift Subs Leaderboard */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-kick-border">
                    <label className="text-kick-text text-sm font-medium cursor-pointer flex-1">
                        Show Gift Subs Leaderboard
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            defaultChecked={false}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-kick-surface-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-kick-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-kick-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kick-purple"></div>
                    </label>
                </div>

                {/* Show Message Timestamps */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-kick-border">
                    <label className="text-kick-text text-sm font-medium cursor-pointer flex-1">
                        Show Message Timestamps
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showTimestamps}
                            onChange={(e) => handleTimestampsToggle(e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-kick-surface-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-kick-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-kick-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kick-purple"></div>
                    </label>
                </div>

                {/* Show mod quick actions */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-kick-border">
                    <label className="text-kick-text text-sm font-medium cursor-pointer flex-1">
                        Show mod quick actions
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            defaultChecked={false}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-kick-surface-hover peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-kick-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-kick-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-kick-purple"></div>
                    </label>
                </div>

                {/* Muted Users */}
                <button
                    onClick={() => {
                        toastManager.show('Muted Users - Coming soon!', 'info', 3000)
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-kick-surface-hover transition-colors"
                >
                    <span className="text-kick-text text-sm font-medium">Muted Users</span>
                    <svg className="w-4 h-4 text-kick-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
