'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardSettingsPanel } from '@/components/admin/DashboardSettingsPanel'
import { ModerationBotSettingsPanel } from '@/components/admin/ModerationBotSettingsPanel'
import { AdminAuditLogPanel } from '@/components/admin/AdminAuditLogPanel'

export default function AdminDashboardSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logRefreshKey, setLogRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function verify() {
      try {
        const resp = await fetch('/api/admin/verify', { method: 'GET' })
        const data = await resp.json()
        if (!data?.is_admin) {
          router.replace('/')
          return
        }
        if (!cancelled) setLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to verify admin')
          setLoading(false)
        }
      }
    }
    verify()
    return () => { cancelled = true }
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text">Dashboard settings</h1>
        <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
          Admin-only controls for the main dashboard page and the AI moderator.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      <DashboardSettingsPanel onSaved={() => setLogRefreshKey((v) => v + 1)} />

      <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface">
        <ModerationBotSettingsPanel
          title="AI moderator settings"
          description="Controls Sweetflipsbot behavior (AI moderation, replies, and slot calls)."
          onSaved={() => setLogRefreshKey((v) => v + 1)}
        />
      </div>

      <AdminAuditLogPanel refreshKey={logRefreshKey} />
    </div>
  )
}
