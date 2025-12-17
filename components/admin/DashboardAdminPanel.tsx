'use client'

import { useEffect, useState } from 'react'
import { DashboardSettingsPanel } from './DashboardSettingsPanel'
import { ModerationBotSettingsPanel } from './ModerationBotSettingsPanel'

export function DashboardAdminPanel(props: { onDashboardSettingsSaved?: (settings: any) => void }) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function verify() {
      try {
        const resp = await fetch('/api/admin/verify', { method: 'GET' })
        const data = await resp.json()
        if (cancelled) return
        setIsAdmin(Boolean(data?.is_admin))
      } catch {
        if (!cancelled) setIsAdmin(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    verify()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  if (!isAdmin) return null

  return (
    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-h4 font-semibold text-gray-900 dark:text-kick-text">Admin panel</div>
          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Dashboard-only controls (admins only)</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-kick-bg-secondary text-gray-900 dark:text-kick-text"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <div className="mt-5 space-y-5">
          <DashboardSettingsPanel onSaved={props.onDashboardSettingsSaved} />
          <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg-secondary">
            <ModerationBotSettingsPanel
              title="AI moderator settings"
              description="Controls Sweetflipsbot behavior (AI moderation, replies, and slot calls)."
            />
          </div>
        </div>
      )}
    </div>
  )
}
