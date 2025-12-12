'use client'

import ChatFrame from '@/components/ChatFrame'
import { useEffect, useState } from 'react'

interface ChannelData {
    chatroom_id?: number
    broadcaster_user_id?: number
    slug?: string
    user?: {
        username?: string
    }
    username?: string
    [key: string]: any
}

export default function ChatPage() {
    const [channelData, setChannelData] = useState<ChannelData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchChannelData()
    }, [])

    const fetchChannelData = async () => {
        try {
            const response = await fetch('/api/channel?slug=sweetflips')
            if (response.ok) {
                const data = await response.json()
                setChannelData(data)
            }
        } catch (err) {
            console.error('Failed to fetch channel data:', err)
        } finally {
            setLoading(false)
        }
    }

    const channelName = channelData?.user?.username || channelData?.username || 'sweetflips'

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                <h1 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-6">Live Chat</h1>
                {loading ? (
                    <div className="flex items-center justify-center h-[600px]">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                    </div>
                ) : (
                    <div className="h-[600px]">
                        <ChatFrame
                            chatroomId={channelData?.chatroom_id}
                            broadcasterUserId={channelData?.broadcaster_user_id}
                            slug={channelData?.slug}
                            username={channelName}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
