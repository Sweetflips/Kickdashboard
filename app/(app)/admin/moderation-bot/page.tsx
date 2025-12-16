'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type ModeratorBotSettings = {
  ai_moderation_enabled: boolean
  ai_reply_enabled: boolean
  ai_action: 'timeout' | 'ban'

  bot_reply_enabled: boolean
  bot_reply_probability: number
  bot_reply_cooldown_ms: number

  bot_slot_call_enabled: boolean
  bot_slot_call_probability: number
  bot_slot_call_min_interval_ms: number
  bot_slot_call_message: string

  moderation_announce_actions: boolean
}

const DEFAULTS: ModeratorBotSettings = {
  ai_moderation_enabled: false,
  ai_reply_enabled: false,
  ai_action: 'timeout',
  bot_reply_enabled: false,
  bot_reply_probability: 0.35,
  bot_reply_cooldown_ms: 20000,
  bot_slot_call_enabled: false,
  bot_slot_call_probability: 0.03,
  bot_slot_call_min_interval_ms: 900000,
  // Default without emoji to avoid encoding issues in some clients/logs
  bot_slot_call_message: '!slots',
  moderation_announce_actions: false,
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export default function AdminModerationBotPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<ModeratorBotSettings>(DEFAULTS)

  const pretty = useMemo(() => {
    const mins = Math.round(settings.bot_slot_call_min_interval_ms / 60000)
    return { mins }
  }, [settings.bot_slot_call_min_interval_ms])

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

        const resp = await fetch('/api/admin/moderation-settings')
        const data = await resp.json()
        if (!resp.ok) throw new Error(data?.error || 'Failed to load settings')

        if (!cancelled) {
          setSettings({ ...DEFAULTS, ...(data?.settings || data?.settings?.settings || data?.settings) })
          setLoading(false)
        }
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

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        settings: {
          ...settings,
          bot_reply_probability: clamp01(Number(settings.bot_reply_probability)),
          bot_slot_call_probability: clamp01(Number(settings.bot_slot_call_probability)),
        },
      }
      const resp = await fetch('/api/admin/moderation-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || data?.details || 'Save failed')
      setSettings({ ...DEFAULTS, ...(data?.settings || DEFAULTS) })
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

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
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-kick-purple text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg-secondary space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-kick-text">AI moderation</h2>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Enable AI moderation</span>
            <input
              type="checkbox"
              checked={settings.ai_moderation_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, ai_moderation_enabled: e.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">AI action</span>
            <select
              value={settings.ai_action}
              onChange={(e) => setSettings((s) => ({ ...s, ai_action: e.target.value as any }))}
              className="px-2 py-1 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            >
              <option value="timeout">timeout</option>
              <option value="ban">ban</option>
            </select>
          </label>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Announce moderation actions in chat</span>
            <input
              type="checkbox"
              checked={settings.moderation_announce_actions}
              onChange={(e) => setSettings((s) => ({ ...s, moderation_announce_actions: e.target.checked }))}
            />
          </label>

          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">
            Note: OpenAI secret key stays in Railway env vars (`OPENAI_API_KEY`). This panel only controls behavior.
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg-secondary space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-kick-text">Replies (when mentioned)</h2>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Enable replies</span>
            <input
              type="checkbox"
              checked={settings.bot_reply_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, bot_reply_enabled: e.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Reply probability</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.bot_reply_probability}
              onChange={(e) => setSettings((s) => ({ ...s, bot_reply_probability: Number(e.target.value) }))}
              className="w-28 px-2 py-1 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Reply cooldown (ms)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settings.bot_reply_cooldown_ms}
              onChange={(e) => setSettings((s) => ({ ...s, bot_reply_cooldown_ms: Number(e.target.value) }))}
              className="w-36 px-2 py-1 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            />
          </label>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Enable AI-generated reply text</span>
            <input
              type="checkbox"
              checked={settings.ai_reply_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, ai_reply_enabled: e.target.checked }))}
            />
          </label>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg-secondary space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-kick-text">Random slot calls</h2>

          <label className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Enable slot calls</span>
            <input
              type="checkbox"
              checked={settings.bot_slot_call_enabled}
              onChange={(e) => setSettings((s) => ({ ...s, bot_slot_call_enabled: e.target.checked }))}
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Tick probability</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={settings.bot_slot_call_probability}
              onChange={(e) => setSettings((s) => ({ ...s, bot_slot_call_probability: Number(e.target.value) }))}
              className="w-28 px-2 py-1 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Minimum interval</span>
            <input
              type="number"
              min={60000}
              step={60000}
              value={settings.bot_slot_call_min_interval_ms}
              onChange={(e) => setSettings((s) => ({ ...s, bot_slot_call_min_interval_ms: Number(e.target.value) }))}
              className="w-40 px-2 py-1 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            />
          </label>

          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">
            Current minimum interval: ~{pretty.mins} minutes
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary">Message</span>
            <input
              value={settings.bot_slot_call_message}
              onChange={(e) => setSettings((s) => ({ ...s, bot_slot_call_message: e.target.value }))}
              className="px-2 py-2 rounded border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-bg text-gray-900 dark:text-kick-text"
            />
          </label>
        </div>
      </div>

      <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
        Page URL: <span className="font-mono">/admin/moderation-bot</span>
      </div>
    </div>
  )
}
