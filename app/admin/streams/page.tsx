'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AppLayout from '@/components/AppLayout'

interface StreamSession {
    id: string
    broadcaster_user_id: string
    channel_slug: string
    session_title: string | null
    thumbnail_url: string | null
    started_at: string
    ended_at: string | null
    duration_formatted: string | null
}

export default function AdminStreamsPage() {
    const router = useRouter()
    const [userData, setUserData] = useState<any>(null)
    const [sessions, setSessions] = useState<StreamSession[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState<any>(null)
    const [offset, setOffset] = useState(0)
    const limit = 20

    useEffect(() => {
        // Check admin access
        const token = localStorage.getItem('kick_access_token')
        if (!token) {
            router.push('/')
            return
        }

        fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.is_admin) {
                    router.push('/')
                    return
                }
                setUserData(data)
                fetchStreams()
            })
            .catch(() => router.push('/'))
    }, [router])

    const fetchStreams = async () => {
        try {
            setLoading(true)
            const response = await fetch(`/api/stream-sessions?limit=${limit}&offset=${offset}`)
            if (response.ok) {
                const data = await response.json()
                setSessions(data.sessions || [])
            }
        } catch (error) {
            console.error('Error fetching streams:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSync = async () => {
        if (syncing) return

        try {
            setSyncing(true)
            setSyncResult(null)

            const channelSlug = userData?.username || 'sweetflips'
            const response = await fetch(`/api/admin/sync-streams?slug=${channelSlug}`, {
                method: 'POST'
            })

            const result = await response.json()
            setSyncResult(result)

            if (response.ok) {
                // Refresh list after sync
                await fetchStreams()
            }
        } catch (error) {
            console.error('Sync error:', error)
            setSyncResult({ success: false, error: 'Failed to execute sync' })
        } finally {
            setSyncing(false)
        }
    }

    if (!userData || !userData.is_admin) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">Stream Management</h1>
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/90 disabled:opacity-50 transition-colors"
                    >
                        {syncing ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Sync from Kick
                            </>
                        )}
                    </button>
                </div>

                {/* Sync Result Message */}
                {syncResult && (
                    <div className={`p-4 rounded-lg ${syncResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        <h3 className="font-bold">{syncResult.success ? 'Sync Completed' : 'Sync Failed'}</h3>
                        {syncResult.stats && (
                            <div className="text-sm mt-1 space-x-4">
                                <span>Processed: {syncResult.stats.processed}</span>
                                <span>Matched: {syncResult.stats.matched}</span>
                                <span>Updated: {syncResult.stats.updated}</span>
                                <span>Errors: {syncResult.stats.errors}</span>
                            </div>
                        )}
                        {syncResult.error && <p className="text-sm mt-1">{syncResult.error}</p>}
                    </div>
                )}

                {/* Streams Table */}
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-dark">
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Thumbnail</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Title / ID</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Started</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Duration</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map((session) => (
                                    <tr
                                        key={session.id}
                                        className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors"
                                    >
                                        <td className="py-3 px-4">
                                            <div className="w-24 h-14 bg-gray-100 dark:bg-kick-surface-hover rounded overflow-hidden relative">
                                                {session.thumbnail_url ? (
                                                    <Image
                                                        src={session.thumbnail_url.startsWith('http')
                                                            ? `/api/image-proxy?url=${encodeURIComponent(session.thumbnail_url)}`
                                                            : session.thumbnail_url}
                                                        alt="Thumbnail"
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-xs text-gray-400">
                                                        No Image
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-gray-900 dark:text-kick-text truncate max-w-xs">
                                                {session.session_title || 'Untitled Stream'}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-kick-text-secondary font-mono">
                                                ID: {session.id}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-kick-text">
                                            {new Date(session.started_at).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-kick-text">
                                            {session.duration_formatted || '-'}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded text-xs ${
                                                session.ended_at
                                                    ? 'bg-gray-100 dark:bg-kick-dark text-gray-600 dark:text-kick-text-secondary'
                                                    : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 animate-pulse'
                                            }`}>
                                                {session.ended_at ? 'Ended' : 'Live'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Simple Pagination */}
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={() => {
                            const newOffset = Math.max(0, offset - limit)
                            setOffset(newOffset)
                            fetchStreams() // trigger re-fetch
                        }}
                        disabled={offset === 0}
                        className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => {
                            const newOffset = offset + limit
                            setOffset(newOffset)
                            fetchStreams()
                        }}
                        className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover"
                    >
                        Next
                    </button>
                </div>
            </div>
        </AppLayout>
    )
}
