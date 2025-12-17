'use client'

import { useEffect, useState } from 'react'

type DashboardSettings = {
  channel_slug: string
  channel_refresh_ms: number
  leaderboard_refresh_ms: number
  chat_height_px: number
  show_chat: boolean
  show_leaderboard: boolean
  show_redeem_code_button: boolean
  leaderboard_max_rows: number
}

const DEFAULTS: DashboardSettings = {
  channel_slug: 'sweetflips',
  channel_refresh_ms: 60000,
  leaderboard_refresh_ms: 10000,
  chat_height_px: 600,
  show_chat: true,
  show_leaderboard: true,
  show_redeem_code_button: true,
  leaderboard_max_rows: 50,
}

function clampInt(n: number, min: number, max: number) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

export function DashboardSettingsPanel(props: { onSaved?: (settings: DashboardSettings) => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const resp = await fetch('/api/admin/dashboard-settings', { method: 'GET' })
        const data = await resp.json()
        if (!resp.ok) throw new Error(data?.error || 'Failed to load dashboard settings')
        if (cancelled) return
        setSettings({ ...DEFAULTS, ...(data?.settings || {}) })
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const normalized: DashboardSettings = {
        ...settings,
        channel_slug: String(settings.channel_slug || '').trim().toLowerCase(),
        channel_refresh_ms: clampInt(settings.channel_refresh_ms, 5000, 300000),
        leaderboard_refresh_ms: clampInt(settings.leaderboard_refresh_ms, 2500, 60000),
        chat_height_px: clampInt(settings.chat_height_px, 300, 1200),
        leaderboard_max_rows: clampInt(settings.leaderboard_max_rows, 5, 200),
      }

      const resp = await fetch('/api/admin/dashboard-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: normalized }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || data?.details || 'Save failed')
      const saved = { ...DEFAULTS, ...(data?.settings || {}) }
      setSettings(saved)
      props.onSaved?.(saved)
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-kick-purple" />
      </div>
    )
  }

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg-secondary space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-kick-text">Dashboard settings</div>
          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">
            These settings change what this dashboard page shows + how often it refreshes.
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-kick-purple text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Channel slug</span>
          <input
            value={settings.channel_slug}
            onChange={(e) => setSettings((s) => ({ ...s, channel_slug: e.target.value }))}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            placeholder="sweetflips"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Chat height (px)</span>
          <input
            type="number"
            min={300}
            max={1200}
            step={10}
            value={settings.chat_height_px}
            onChange={(e) => setSettings((s) => ({ ...s, chat_height_px: Number(e.target.value) }))}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Channel refresh (ms)</span>
          <input
            type="number"
            min={5000}
            max={300000}
            step={1000}
            value={settings.channel_refresh_ms}
            onChange={(e) => setSettings((s) => ({ ...s, channel_refresh_ms: Number(e.target.value) }))}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Leaderboard refresh (ms)</span>
          <input
            type="number"
            min={2500}
            max={60000}
            step={500}
            value={settings.leaderboard_refresh_ms}
            onChange={(e) => setSettings((s) => ({ ...s, leaderboard_refresh_ms: Number(e.target.value) }))}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Leaderboard max rows</span>
          <input
            type="number"
            min={5}
            max={200}
            step={1}
            value={settings.leaderboard_max_rows}
            onChange={(e) => setSettings((s) => ({ ...s, leaderboard_max_rows: Number(e.target.value) }))}
            className="px-3 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
          />
        </label>

        <div className="space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Show chat panel</span>
            <input
              type="checkbox"
              checked={settings.show_chat}
              onChange={(e) => setSettings((s) => ({ ...s, show_chat: e.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Show leaderboard</span>
            <input
              type="checkbox"
              checked={settings.show_leaderboard}
              onChange={(e) => setSettings((s) => ({ ...s, show_leaderboard: e.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Show redeem code button</span>
            <input
              type="checkbox"
              checked={settings.show_redeem_code_button}
              onChange={(e) => setSettings((s) => ({ ...s, show_redeem_code_button: e.target.checked }))}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
