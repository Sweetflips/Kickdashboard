'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ModerationBotSettingsPanel } from '@/components/admin/ModerationBotSettingsPanel'

export default function AdminModerationBotPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const verify = await fetch('/api/admin/verify', { method: 'GET' })
        const verifyData = await verify.json()
        if (!verifyData?.is_admin) {
          router.replace('/')
          return
        }
        if (!cancelled) setLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text">AI Moderator Control Panel</h1>
          <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
            Controls Sweetflipsbot behavior (AI moderation, replies, and slot calls). Changes apply without redeploy.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/admin/users')}
            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-kick-bg-secondary text-gray-900 dark:text-kick-text"
          >
            Back
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
        Page URL: <span className="font-mono">/admin/moderation-bot</span>
      </div>

      <ModerationBotSettingsPanel />
    </div>
  )
}
