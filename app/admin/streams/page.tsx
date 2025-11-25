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
    const [fetchingThumbnails, setFetchingThumbnails] = useState(false)
    const [offset, setOffset] = useState(0)
    const [showManualSync, setShowManualSync] = useState(false)
    const [manualJson, setManualJson] = useState('')
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
            const response = await fetch(`/api/stream-sessions?limit=${limit}&offset=${offset}`, {
                credentials: 'include', // Include cookies for authentication
            })
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

            // Strategy 1: Try Server-side sync first (simplest if it works)
            let success = false
            try {
                const response = await fetch(`/api/admin/sync-streams?slug=${channelSlug}`, {
                    method: 'POST',
                    credentials: 'include', // Include cookies for authentication
                })

                const result = await response.json()
                if (response.ok && result.success) {
                    setSyncResult(result)
                    success = true
                } else {
                    // If server returns error (likely 500/403 from Kick), fallback
                    console.warn('Server-side sync failed, trying client-side...', result.error)
                }
            } catch (e) {
                console.warn('Server-side sync network error', e)
            }

            if (success) {
                await fetchStreams()
                setSyncing(false)
                return
            }

            // Strategy 2: Client-side fetch (Browser -> Kick API)
            // This bypasses server IP blocks, but might hit CORS
            try {
                console.log('Attempting client-side fetch...')
                const kickResponse = await fetch(`https://kick.com/api/v2/channels/${channelSlug}/videos`)

                if (kickResponse.ok) {
                    const videos = await kickResponse.json()
                    console.log(`Fetched ${videos.length} videos client-side`)

                    // Send data to backend
                    const syncResponse = await fetch(`/api/admin/sync-streams?slug=${channelSlug}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ videos }),
                        credentials: 'include', // Include cookies for authentication
                    })

                    const result = await syncResponse.json()
                    setSyncResult(result)
                    if (syncResponse.ok) {
                        await fetchStreams()
                        setSyncing(false)
                        return
                    }
                } else {
                    throw new Error(`Kick API Status: ${kickResponse.status}`)
                }
            } catch (clientError) {
                console.error('Client-side sync failed (likely CORS):', clientError)
                // Fallback to manual mode
                setShowManualSync(true)
                setSyncResult({
                    success: false,
                    error: 'Auto-sync blocked by Kick security. Please use the manual sync below.'
                })
            }

        } catch (error) {
            console.error('Sync error:', error)
            setSyncResult({ success: false, error: 'Failed to execute sync' })
        } finally {
            setSyncing(false)
        }
    }

    const handleManualSync = async () => {
        if (!manualJson) return

        try {
            setSyncing(true)
            setSyncResult(null)
            let videos = []
            try {
                videos = JSON.parse(manualJson)
                if (!Array.isArray(videos)) throw new Error('JSON is not an array')
            } catch (e) {
                alert('Invalid JSON format. Please copy the entire array from the Kick API page.')
                setSyncing(false)
                return
            }

            const channelSlug = userData?.username || 'sweetflips'
            const response = await fetch(`/api/admin/sync-streams?slug=${channelSlug}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos }),
                credentials: 'include', // Include cookies for authentication
            })

            const result = await response.json()
            setSyncResult(result)

            if (response.ok) {
                setShowManualSync(false)
                setManualJson('')
                await fetchStreams()
            }
        } catch (error) {
            console.error('Manual sync error:', error)
            setSyncResult({ success: false, error: 'Failed to process manual sync' })
        } finally {
            setSyncing(false)
        }
    }

    const handleFetchThumbnails = async () => {
        if (fetchingThumbnails) return

        try {
            setFetchingThumbnails(true)
            setSyncResult(null)
            const channelSlug = userData?.username || 'sweetflips'

            const response = await fetch(`/api/admin/fetch-thumbnails?slug=${channelSlug}&limit=50`, {
                method: 'POST',
                credentials: 'include', // Include cookies for authentication
            })

            const result = await response.json()
            setSyncResult(result)

            if (response.ok) {
                await fetchStreams()
            }
        } catch (error) {
            console.error('Fetch thumbnails error:', error)
            setSyncResult({ success: false, error: 'Failed to fetch thumbnails' })
        } finally {
            setFetchingThumbnails(false)
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

    const kickApiUrl = `https://kick.com/api/v2/channels/${userData?.username || 'sweetflips'}/videos`

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">Stream Management</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleFetchThumbnails}
                            disabled={fetchingThumbnails}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                            {fetchingThumbnails ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Fetching...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Fetch Thumbnails
                                </>
                            )}
                        </button>
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

                {/* Manual Sync Fallback */}
                {showManualSync && (
                    <div className="bg-white dark:bg-kick-surface rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                        <h3 className="text-lg font-bold text-orange-800 dark:text-orange-200 mb-2">
                            Manual Sync Required
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-4">
                            Automated sync was blocked by Kick's security. Please follow these steps:
                        </p>
                        <ol className="list-decimal list-inside text-sm text-gray-600 dark:text-kick-text-secondary mb-4 space-y-2">
                            <li>
                                Open this link in a new tab: <a href={kickApiUrl} target="_blank" rel="noopener noreferrer" className="text-kick-purple hover:underline">{kickApiUrl}</a>
                            </li>
                            <li>Copy all the text (JSON data) from that page.</li>
                            <li>Paste it into the box below and click "Process Sync".</li>
                        </ol>
                        <textarea
                            value={manualJson}
                            onChange={(e) => setManualJson(e.target.value)}
                            placeholder="Paste JSON here... [ { ... } ]"
                            className="w-full h-48 p-3 border border-gray-300 dark:border-kick-border rounded-lg bg-gray-50 dark:bg-kick-dark text-xs font-mono mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowManualSync(false)}
                                className="px-4 py-2 text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleManualSync}
                                disabled={!manualJson || syncing}
                                className="px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/90 disabled:opacity-50"
                            >
                                {syncing ? 'Processing...' : 'Process Sync'}
                            </button>
                        </div>
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
