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
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [fetchingThumbnailId, setFetchingThumbnailId] = useState<string | null>(null)
    const limit = 20

    useEffect(() => {
        // Check admin access using dedicated endpoint
        const token = localStorage.getItem('kick_access_token')
        if (!token) {
            router.push('/')
            return
        }

        // SECURITY: Use dedicated admin verification endpoint
        fetch('/api/admin/verify', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (!data.is_admin) {
                    router.push('/')
                    return
                }
                setUserData({ is_admin: true })
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
            // Always sync the monitored channel, not the logged-in user's channel
            const channelSlug = 'sweetflips'

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

            const channelSlug = 'sweetflips'
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

            // Use sync-thumbnails endpoint which uses official Kick Dev API
            // This only works for ACTIVE/LIVE streams
            const response = await fetch(`/api/admin/sync-thumbnails`, {
                method: 'POST',
                credentials: 'include',
            })

            const result = await response.json()
            setSyncResult({
                ...result,
                message: result.stats?.updated > 0
                    ? `Updated thumbnails for ${result.stats.updated} active stream(s)`
                    : result.stats?.processed > 0
                        ? 'Active stream thumbnails are already up to date'
                        : 'No active streams found to update thumbnails',
            })

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

    const handleDeleteStream = async (sessionId: string) => {
        if (!confirm('Are you sure you want to delete this stream session? This action cannot be undone.')) {
            return
        }

        try {
            setDeletingId(sessionId)
            const response = await fetch(`/api/stream-sessions?id=${sessionId}`, {
                method: 'DELETE',
                credentials: 'include',
            })

            const result = await response.json()
            
            if (response.ok) {
                setSyncResult({
                    success: true,
                    message: 'Stream deleted successfully',
                })
                await fetchStreams()
            } else {
                setSyncResult({
                    success: false,
                    error: result.error || 'Failed to delete stream',
                })
            }
        } catch (error) {
            console.error('Delete stream error:', error)
            setSyncResult({ success: false, error: 'Failed to delete stream' })
        } finally {
            setDeletingId(null)
        }
    }

    const handleFetchStreamThumbnail = async (sessionId: string) => {
        try {
            setFetchingThumbnailId(sessionId)
            const response = await fetch('/api/admin/fetch-stream-thumbnail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
                credentials: 'include',
            })

            const result = await response.json()
            
            if (response.ok) {
                setSyncResult({
                    success: true,
                    message: 'Thumbnail updated successfully',
                })
                await fetchStreams()
            } else {
                setSyncResult({
                    success: false,
                    error: result.error || 'Failed to fetch thumbnail',
                })
            }
        } catch (error) {
            console.error('Fetch thumbnail error:', error)
            setSyncResult({ success: false, error: 'Failed to fetch thumbnail' })
        } finally {
            setFetchingThumbnailId(null)
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

    const kickApiUrl = `https://kick.com/api/v2/channels/sweetflips/videos`

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">Stream Management</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleFetchThumbnails}
                            disabled={fetchingThumbnails}
                            title="Update thumbnails for currently live streams using Kick Dev API"
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                            {fetchingThumbnails ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Update Live Thumbnails
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
                    <div className={`p-4 rounded-lg ${
                        syncResult.success && (syncResult.stats?.updated > 0 || syncResult.stats?.liveStreamUpdated > 0)
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                            : syncResult.success
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200'
                                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                    }`}>
                        <h3 className="font-bold">
                            {syncResult.success && (syncResult.stats?.updated > 0 || syncResult.stats?.liveStreamUpdated > 0)
                                ? '✓ Sync Completed'
                                : syncResult.success
                                    ? 'ℹ️ No Updates Available'
                                    : '✕ Sync Failed'}
                        </h3>
                        {syncResult.message && (
                            <p className="text-sm mt-1">{syncResult.message}</p>
                        )}
                        {syncResult.stats && (syncResult.stats.processed > 0 || syncResult.stats.liveStreamUpdated > 0) && (
                            <div className="text-sm mt-2 space-x-4">
                                {syncResult.stats.liveStreamUpdated > 0 && <span>Live: {syncResult.stats.liveStreamUpdated}</span>}
                                {syncResult.stats.processed > 0 && <span>Processed: {syncResult.stats.processed}</span>}
                                {syncResult.stats.matched > 0 && <span>Matched: {syncResult.stats.matched}</span>}
                                {syncResult.stats.updated > 0 && <span>Updated: {syncResult.stats.updated}</span>}
                                {syncResult.stats.errors > 0 && <span className="text-red-600 dark:text-red-400">Errors: {syncResult.stats.errors}</span>}
                            </div>
                        )}
                        {syncResult.note && (
                            <p className="text-xs mt-2 opacity-75">{syncResult.note}</p>
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
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Actions</th>
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
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleFetchStreamThumbnail(session.id)}
                                                    disabled={fetchingThumbnailId === session.id}
                                                    title="Refresh thumbnail from Kick API"
                                                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-kick-surface-hover text-gray-600 dark:text-kick-text-secondary hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50 transition-colors"
                                                >
                                                    {fetchingThumbnailId === session.id ? (
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStream(session.id)}
                                                    disabled={deletingId === session.id}
                                                    title="Delete this stream"
                                                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-600 dark:text-kick-text-secondary hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                                                >
                                                    {deletingId === session.id ? (
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
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
