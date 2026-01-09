'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================================
// TYPES
// ============================================================================

type ModeratorBotSettings = {
  // AI Moderation
  ai_moderation_enabled: boolean
  ai_action: 'timeout' | 'ban'
  ai_moderation_model: string
  ai_moderation_score_threshold: number
  ai_moderation_timeout_seconds: number
  ai_moderation_cache_ttl_ms: number
  moderation_announce_actions: boolean

  // Spam/Raid
  spam_detection_enabled: boolean
  raid_mode_trigger_msgs_5s: number
  raid_mode_trigger_unique_5s: number
  raid_mode_duration_ms: number
  spam_per_user_msgs_10s: number
  spam_repeat_threshold: number
  timeout_seconds: number
  ban_on_repeat_count: number
  moderation_cooldown_ms: number

  // Bot Replies
  bot_reply_enabled: boolean
  bot_reply_probability: number
  bot_reply_cooldown_ms: number
  bot_reply_require_mention: boolean
  bot_reply_require_ask: boolean

  // AI Replies
  ai_reply_enabled: boolean
  ai_chat_model: string
  ai_chat_temperature: number
  ai_chat_max_tokens: number

  // Slot Calls
  bot_slot_call_enabled: boolean
  bot_slot_call_probability: number
  bot_slot_call_min_interval_ms: number
  bot_slot_call_message: string

  // Allowlist
  moderation_allowlist: string[]

  // Dry Run
  dry_run_mode: boolean
}

type ModerationLog = {
  id: string
  target_username: string
  action_type: string
  duration_seconds?: number
  reason?: string
  rule_id?: string
  ai_flagged: boolean
  ai_max_score?: number
  message_content?: string
  raid_mode_active: boolean
  dry_run: boolean
  success: boolean
  error_message?: string
  created_at: string
}

type ReplyLog = {
  id: string
  trigger_username: string
  trigger_message: string
  reply_content: string
  reply_type: string
  ai_model?: string
  success: boolean
  latency_ms?: number
  created_at: string
}

type Stats = {
  total: number
  last_24h: number
  last_week: number
  by_action_type: { type: string; count: number }[]
  by_rule_id: { rule: string; count: number }[]
  ai_moderated_week: number
  raid_mode_actions_week: number
}

type ReplyStats = {
  total: number
  last_24h: number
  last_week: number
  by_type: { type: string; count: number }[]
  avg_latency_ms: number | null
}

type RiskStatus = {
  mode: 'low' | 'medium' | 'high'
  score: number
  signals: {
    actions_per_minute: number
    raid_action_ratio: number
    coordinated_raids_5min: number
    unique_targets_5min: number
    total_actions_5min: number
  }
  updated_at: string
}

const DEFAULTS: ModeratorBotSettings = {
  ai_moderation_enabled: false,
  ai_action: 'timeout',
  ai_moderation_model: 'omni-moderation-latest',
  ai_moderation_score_threshold: 0.85,
  ai_moderation_timeout_seconds: 600,
  ai_moderation_cache_ttl_ms: 120000,
  moderation_announce_actions: false,
  spam_detection_enabled: true,
  raid_mode_trigger_msgs_5s: 80,
  raid_mode_trigger_unique_5s: 40,
  raid_mode_duration_ms: 300000,
  spam_per_user_msgs_10s: 6,
  spam_repeat_threshold: 3,
  timeout_seconds: 600,
  ban_on_repeat_count: 3,
  moderation_cooldown_ms: 60000,
  bot_reply_enabled: false,
  bot_reply_probability: 1,
  bot_reply_cooldown_ms: 20000,
  bot_reply_require_mention: true,
  bot_reply_require_ask: false,
  ai_reply_enabled: false,
  ai_chat_model: 'gpt-4o-mini',
  ai_chat_temperature: 0.9,
  ai_chat_max_tokens: 140,
  bot_slot_call_enabled: false,
  bot_slot_call_probability: 0.03,
  bot_slot_call_min_interval_ms: 900000,
  bot_slot_call_message: '!slots',
  moderation_allowlist: [],
  dry_run_mode: false,
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function formatDuration(ms: number) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`
  return `${Math.round(ms / 3600000)}h`
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// ============================================================================
// COMPONENTS
// ============================================================================

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-kick-purple focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-kick-purple' : 'bg-gray-300 dark:bg-kick-surface-hover'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface">
      <div className="text-2xl font-bold text-gray-900 dark:text-kick-text">{value}</div>
      <div className="text-sm text-gray-600 dark:text-kick-text-secondary">{label}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-kick-text-secondary mt-1">{sub}</div>}
    </div>
  )
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text">{title}</h3>
        {description && <p className="text-xs text-gray-500 dark:text-kick-text-secondary mt-1">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700 dark:text-kick-text-secondary">{label}</div>
        {hint && <div className="text-xs text-gray-500 dark:text-kick-text-secondary">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className={`px-3 py-1.5 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text outline-none focus:border-kick-purple focus:ring-2 focus:ring-kick-purple/30 ${className || 'w-28'}`}
    />
  )
}

function TextInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-1.5 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text outline-none focus:border-kick-purple focus:ring-2 focus:ring-kick-purple/30 ${className || 'w-full'}`}
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text outline-none focus:border-kick-purple focus:ring-2 focus:ring-kick-purple/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Badge({ type, children }: { type: 'success' | 'error' | 'warning' | 'info' | 'neutral'; children: React.ReactNode }) {
  const colors = {
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type]}`}>{children}</span>
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-kick-purple text-white'
          : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover'
      }`}
    >
      {children}
    </button>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AdminAIModeratorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [settings, setSettings] = useState<ModeratorBotSettings>(DEFAULTS)
  const [activeTab, setActiveTab] = useState<'settings' | 'moderation-logs' | 'reply-logs'>('settings')

  // Logs state
  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>([])
  const [replyLogs, setReplyLogs] = useState<ReplyLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [replyStats, setReplyStats] = useState<ReplyStats | null>(null)
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null)

  // Allowlist state
  const [newAllowlistUser, setNewAllowlistUser] = useState('')

  // Verify admin
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

  // Load settings
  useEffect(() => {
    if (loading) return
    let cancelled = false
    async function load() {
      try {
        const resp = await fetch('/api/admin/moderation-settings')
        const data = await resp.json()
        if (!resp.ok) throw new Error(data?.error || 'Failed to load settings')
        if (!cancelled) {
          setSettings({ ...DEFAULTS, ...(data?.settings || {}) })
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      }
    }
    load()
    return () => { cancelled = true }
  }, [loading])

  // Load logs and stats
  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const [modResp, replyResp, statsResp, replyStatsResp, riskResp] = await Promise.all([
        fetch('/api/admin/moderation-logs?limit=50'),
        fetch('/api/admin/bot-reply-logs?limit=50'),
        fetch('/api/admin/moderation-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stats' }) }),
        fetch('/api/admin/bot-reply-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stats' }) }),
        fetch('/api/admin/moderation-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'risk_status' }) }),
      ])
      const [modData, replyData, statsData, replyStatsData, riskData] = await Promise.all([
        modResp.json(),
        replyResp.json(),
        statsResp.json(),
        replyStatsResp.json(),
        riskResp.json(),
      ])
      setModerationLogs(modData?.logs || [])
      setReplyLogs(replyData?.logs || [])
      setStats(statsData?.stats || null)
      setReplyStats(replyStatsData?.stats || null)
      setRiskStatus(riskData?.risk_status || null)
    } catch {
      // ignore
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loading && activeTab !== 'settings') {
      loadLogs()
    }
  }, [loading, activeTab, loadLogs])

  // Save settings
  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = {
        settings: {
          ...settings,
          bot_reply_probability: clamp01(Number(settings.bot_reply_probability)),
          bot_slot_call_probability: clamp01(Number(settings.bot_slot_call_probability)),
          ai_moderation_score_threshold: clamp01(Number(settings.ai_moderation_score_threshold)),
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
      setSuccess('Settings saved successfully!')
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Add to allowlist
  function addToAllowlist() {
    const username = newAllowlistUser.trim().toLowerCase()
    if (!username || settings.moderation_allowlist.includes(username)) return
    setSettings((s) => ({ ...s, moderation_allowlist: [...s.moderation_allowlist, username] }))
    setNewAllowlistUser('')
  }

  // Remove from allowlist
  function removeFromAllowlist(username: string) {
    setSettings((s) => ({ ...s, moderation_allowlist: s.moderation_allowlist.filter((u) => u !== username) }))
  }

  // Computed values
  const slotIntervalMins = useMemo(() => Math.round(settings.bot_slot_call_min_interval_ms / 60000), [settings.bot_slot_call_min_interval_ms])
  const raidModeDurationMins = useMemo(() => Math.round(settings.raid_mode_duration_ms / 60000), [settings.raid_mode_duration_ms])
  const timeoutMins = useMemo(() => Math.round(settings.timeout_seconds / 60), [settings.timeout_seconds])
  const aiTimeoutMins = useMemo(() => Math.round(settings.ai_moderation_timeout_seconds / 60), [settings.ai_moderation_timeout_seconds])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
      <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text flex items-center gap-2">
            <span className="text-3xl">🛡️</span> AI Moderator Control Center
          </h1>
          <p className="text-sm text-gray-600 dark:text-kick-text-secondary mt-1">
            Complete control over SweetFlipsBot — AI moderation, chat replies, spam detection, and raid protection.
          </p>
        </div>
        {activeTab === 'settings' && (
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-kick-purple hover:bg-kick-purple/90 text-white font-medium disabled:opacity-60 transition-colors"
          >
            {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800">
          {success}
        </div>
      )}

      {/* Dry Run Warning */}
      {settings.dry_run_mode && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-semibold">Dry Run Mode Active</div>
            <div className="text-sm">Moderation actions are being logged but NOT executed. Disable to apply real bans/timeouts.</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-kick-border pb-2">
        <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
          ⚙️ Settings
        </TabButton>
        <TabButton active={activeTab === 'moderation-logs'} onClick={() => setActiveTab('moderation-logs')}>
          📋 Moderation Logs
        </TabButton>
        <TabButton active={activeTab === 'reply-logs'} onClick={() => setActiveTab('reply-logs')}>
          💬 Reply Logs
        </TabButton>
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Moderation */}
          <SectionCard title="🤖 AI Moderation" description="OpenAI-powered content moderation for toxicity, hate speech, harassment, etc.">
            <SettingRow label="Enable AI moderation">
              <Toggle checked={settings.ai_moderation_enabled} onChange={(v) => setSettings((s) => ({ ...s, ai_moderation_enabled: v }))} />
            </SettingRow>
            <SettingRow label="AI action on violation" hint="What happens when AI flags a message">
              <Select
                value={settings.ai_action}
                onChange={(v) => setSettings((s) => ({ ...s, ai_action: v as 'timeout' | 'ban' }))}
                options={[
                  { value: 'timeout', label: 'Timeout' },
                  { value: 'ban', label: 'Ban' },
                ]}
              />
            </SettingRow>
            <SettingRow label="Score threshold" hint={`Flagged if any category ≥ ${(settings.ai_moderation_score_threshold * 100).toFixed(0)}%`}>
              <NumberInput
                value={settings.ai_moderation_score_threshold}
                onChange={(v) => setSettings((s) => ({ ...s, ai_moderation_score_threshold: v }))}
                min={0}
                max={1}
                step={0.05}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Timeout duration" hint={`${aiTimeoutMins} minutes`}>
              <NumberInput
                value={settings.ai_moderation_timeout_seconds}
                onChange={(v) => setSettings((s) => ({ ...s, ai_moderation_timeout_seconds: v }))}
                min={60}
                step={60}
                className="w-28"
              />
            </SettingRow>
            <SettingRow label="OpenAI model">
              <TextInput
                value={settings.ai_moderation_model}
                onChange={(v) => setSettings((s) => ({ ...s, ai_moderation_model: v }))}
                className="w-48"
              />
            </SettingRow>
            <SettingRow label="Cache TTL (ms)" hint="How long to cache moderation results">
              <NumberInput
                value={settings.ai_moderation_cache_ttl_ms}
                onChange={(v) => setSettings((s) => ({ ...s, ai_moderation_cache_ttl_ms: v }))}
                min={0}
                step={10000}
                className="w-32"
              />
            </SettingRow>
            <SettingRow label="Announce actions in chat">
              <Toggle checked={settings.moderation_announce_actions} onChange={(v) => setSettings((s) => ({ ...s, moderation_announce_actions: v }))} />
            </SettingRow>
          </SectionCard>

          {/* Spam & Raid Detection */}
          <SectionCard title="🚨 Spam & Raid Detection" description="Rule-based detection for spam floods and coordinated raids">
            <SettingRow label="Enable spam detection">
              <Toggle checked={settings.spam_detection_enabled} onChange={(v) => setSettings((s) => ({ ...s, spam_detection_enabled: v }))} />
            </SettingRow>
            <SettingRow label="Raid trigger: messages/5s" hint="Messages in 5 seconds to trigger raid mode">
              <NumberInput
                value={settings.raid_mode_trigger_msgs_5s}
                onChange={(v) => setSettings((s) => ({ ...s, raid_mode_trigger_msgs_5s: v }))}
                min={10}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Raid trigger: unique users/5s" hint="Unique senders to trigger raid mode">
              <NumberInput
                value={settings.raid_mode_trigger_unique_5s}
                onChange={(v) => setSettings((s) => ({ ...s, raid_mode_trigger_unique_5s: v }))}
                min={5}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Raid mode duration" hint={`${raidModeDurationMins} minutes`}>
              <NumberInput
                value={settings.raid_mode_duration_ms}
                onChange={(v) => setSettings((s) => ({ ...s, raid_mode_duration_ms: v }))}
                min={60000}
                step={60000}
                className="w-32"
              />
            </SettingRow>
            <SettingRow label="Spam: messages/10s per user" hint="Max messages per user in 10 seconds">
              <NumberInput
                value={settings.spam_per_user_msgs_10s}
                onChange={(v) => setSettings((s) => ({ ...s, spam_per_user_msgs_10s: v }))}
                min={2}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Repeat message threshold" hint="Identical messages before action">
              <NumberInput
                value={settings.spam_repeat_threshold}
                onChange={(v) => setSettings((s) => ({ ...s, spam_repeat_threshold: v }))}
                min={2}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Timeout duration" hint={`${timeoutMins} minutes`}>
              <NumberInput
                value={settings.timeout_seconds}
                onChange={(v) => setSettings((s) => ({ ...s, timeout_seconds: v }))}
                min={60}
                step={60}
                className="w-28"
              />
            </SettingRow>
            <SettingRow label="Ban after N offenses" hint="Repeat offenders get banned">
              <NumberInput
                value={settings.ban_on_repeat_count}
                onChange={(v) => setSettings((s) => ({ ...s, ban_on_repeat_count: v }))}
                min={1}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Cooldown between actions (ms)" hint="Wait time before re-moderating same user">
              <NumberInput
                value={settings.moderation_cooldown_ms}
                onChange={(v) => setSettings((s) => ({ ...s, moderation_cooldown_ms: v }))}
                min={0}
                step={1000}
                className="w-32"
              />
            </SettingRow>
          </SectionCard>

          {/* Bot Replies */}
          <SectionCard title="💬 Bot Replies" description="Configure when and how SweetFlipsBot replies to chat messages">
            <SettingRow label="Enable bot replies">
              <Toggle checked={settings.bot_reply_enabled} onChange={(v) => setSettings((s) => ({ ...s, bot_reply_enabled: v }))} />
            </SettingRow>
            <SettingRow label="Require @ mention" hint="Only reply when bot is mentioned">
              <Toggle checked={settings.bot_reply_require_mention} onChange={(v) => setSettings((s) => ({ ...s, bot_reply_require_mention: v }))} />
            </SettingRow>
            <SettingRow label="Require question/request" hint="Only reply to questions or requests">
              <Toggle checked={settings.bot_reply_require_ask} onChange={(v) => setSettings((s) => ({ ...s, bot_reply_require_ask: v }))} />
            </SettingRow>
            <SettingRow label="Reply probability" hint={`${(settings.bot_reply_probability * 100).toFixed(0)}% chance to reply`}>
              <NumberInput
                value={settings.bot_reply_probability}
                onChange={(v) => setSettings((s) => ({ ...s, bot_reply_probability: v }))}
                min={0}
                max={1}
                step={0.05}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Reply cooldown (ms)" hint={`Wait ${Math.round(settings.bot_reply_cooldown_ms / 1000)}s between replies`}>
              <NumberInput
                value={settings.bot_reply_cooldown_ms}
                onChange={(v) => setSettings((s) => ({ ...s, bot_reply_cooldown_ms: v }))}
                min={0}
                step={1000}
                className="w-32"
              />
            </SettingRow>
          </SectionCard>

          {/* AI Replies */}
          <SectionCard title="🧠 AI-Generated Replies" description="Use OpenAI to generate intelligent responses">
            <SettingRow label="Enable AI replies" hint="Use GPT to generate replies instead of simple responses">
              <Toggle checked={settings.ai_reply_enabled} onChange={(v) => setSettings((s) => ({ ...s, ai_reply_enabled: v }))} />
            </SettingRow>
            <SettingRow label="GPT model">
              <TextInput
                value={settings.ai_chat_model}
                onChange={(v) => setSettings((s) => ({ ...s, ai_chat_model: v }))}
                className="w-40"
              />
            </SettingRow>
            <SettingRow label="Temperature" hint="Higher = more creative (0-2)">
              <NumberInput
                value={settings.ai_chat_temperature}
                onChange={(v) => setSettings((s) => ({ ...s, ai_chat_temperature: v }))}
                min={0}
                max={2}
                step={0.1}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Max tokens" hint="Maximum response length">
              <NumberInput
                value={settings.ai_chat_max_tokens}
                onChange={(v) => setSettings((s) => ({ ...s, ai_chat_max_tokens: v }))}
                min={16}
                max={256}
                className="w-24"
              />
            </SettingRow>
          </SectionCard>

          {/* Random Slot Calls */}
          <SectionCard title="🎰 Random Slot Calls" description="Bot randomly sends slot commands in chat">
            <SettingRow label="Enable slot calls">
              <Toggle checked={settings.bot_slot_call_enabled} onChange={(v) => setSettings((s) => ({ ...s, bot_slot_call_enabled: v }))} />
            </SettingRow>
            <SettingRow label="Tick probability" hint={`${(settings.bot_slot_call_probability * 100).toFixed(1)}% per worker tick`}>
              <NumberInput
                value={settings.bot_slot_call_probability}
                onChange={(v) => setSettings((s) => ({ ...s, bot_slot_call_probability: v }))}
                min={0}
                max={1}
                step={0.01}
                className="w-24"
              />
            </SettingRow>
            <SettingRow label="Minimum interval" hint={`~${slotIntervalMins} minutes between calls`}>
              <NumberInput
                value={settings.bot_slot_call_min_interval_ms}
                onChange={(v) => setSettings((s) => ({ ...s, bot_slot_call_min_interval_ms: v }))}
                min={60000}
                step={60000}
                className="w-36"
              />
            </SettingRow>
            <SettingRow label="Slot command message">
              <TextInput
                value={settings.bot_slot_call_message}
                onChange={(v) => setSettings((s) => ({ ...s, bot_slot_call_message: v }))}
                className="w-32"
              />
            </SettingRow>
          </SectionCard>

          {/* Allowlist */}
          <SectionCard title="✅ Moderation Allowlist" description="Usernames exempt from moderation (broadcaster/mods auto-exempt)">
            <div className="flex gap-2">
              <TextInput
                value={newAllowlistUser}
                onChange={setNewAllowlistUser}
                placeholder="username"
                className="flex-1"
              />
              <button
                onClick={addToAllowlist}
                className="px-4 py-1.5 rounded-lg bg-kick-purple text-white hover:bg-kick-purple/90 transition-colors"
              >
                Add
              </button>
            </div>
            {settings.moderation_allowlist.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {settings.moderation_allowlist.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-kick-surface-hover text-sm text-gray-700 dark:text-kick-text-secondary"
                  >
                    {u}
                    <button
                      onClick={() => removeFromAllowlist(u)}
                      className="text-gray-500 hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-kick-text-secondary mt-2">No custom allowlist entries</div>
            )}
          </SectionCard>

          {/* Dry Run & Debug */}
          <SectionCard title="🧪 Testing & Debug" description="Test moderation without taking real actions">
            <SettingRow label="Dry run mode" hint="Log actions but don't execute bans/timeouts">
              <Toggle checked={settings.dry_run_mode} onChange={(v) => setSettings((s) => ({ ...s, dry_run_mode: v }))} />
            </SettingRow>
            <div className="text-xs text-gray-500 dark:text-kick-text-secondary p-3 rounded-lg bg-gray-50 dark:bg-kick-surface-hover mt-2">
              <strong>Note:</strong> OpenAI API key is configured via environment variables (<code>OPENAI_API_KEY</code>). These settings control behavior only.
            </div>
          </SectionCard>
        </div>
      )}

      {/* Moderation Logs Tab */}
      {activeTab === 'moderation-logs' && (
        <div className="space-y-6">
          {/* Live Risk Status */}
          {riskStatus && (
            <div className={`p-5 rounded-xl border-2 ${
              riskStatus.mode === 'high' 
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20' 
                : riskStatus.mode === 'medium' 
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' 
                  : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{riskStatus.mode === 'high' ? '🚨' : riskStatus.mode === 'medium' ? '⚠️' : '✅'}</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-kick-text">
                      Live Risk Status: <span className={`uppercase ${
                        riskStatus.mode === 'high' ? 'text-red-600' : riskStatus.mode === 'medium' ? 'text-amber-600' : 'text-emerald-600'
                      }`}>{riskStatus.mode}</span>
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-kick-text-secondary">
                      Score: {(riskStatus.score * 100).toFixed(0)}% • Updated: {formatTimeAgo(riskStatus.updated_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={loadLogs}
                  disabled={logsLoading}
                  className="px-3 py-1.5 rounded-lg bg-white/50 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text text-sm hover:bg-white/80 dark:hover:bg-kick-border transition-colors disabled:opacity-60"
                >
                  {logsLoading ? '...' : '↻'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="p-2 rounded-lg bg-white/50 dark:bg-kick-surface">
                  <div className="font-bold text-gray-900 dark:text-kick-text">{riskStatus.signals.actions_per_minute}</div>
                  <div className="text-xs text-gray-600 dark:text-kick-text-secondary">Actions/min</div>
                </div>
                <div className="p-2 rounded-lg bg-white/50 dark:bg-kick-surface">
                  <div className="font-bold text-gray-900 dark:text-kick-text">{riskStatus.signals.total_actions_5min}</div>
                  <div className="text-xs text-gray-600 dark:text-kick-text-secondary">Actions (5m)</div>
                </div>
                <div className="p-2 rounded-lg bg-white/50 dark:bg-kick-surface">
                  <div className="font-bold text-gray-900 dark:text-kick-text">{(riskStatus.signals.raid_action_ratio * 100).toFixed(0)}%</div>
                  <div className="text-xs text-gray-600 dark:text-kick-text-secondary">Raid Ratio</div>
                </div>
                <div className="p-2 rounded-lg bg-white/50 dark:bg-kick-surface">
                  <div className="font-bold text-gray-900 dark:text-kick-text">{riskStatus.signals.coordinated_raids_5min}</div>
                  <div className="text-xs text-gray-600 dark:text-kick-text-secondary">Coord. Raids</div>
                </div>
                <div className="p-2 rounded-lg bg-white/50 dark:bg-kick-surface">
                  <div className="font-bold text-gray-900 dark:text-kick-text">{riskStatus.signals.unique_targets_5min}</div>
                  <div className="text-xs text-gray-600 dark:text-kick-text-secondary">Unique Targets</div>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatCard label="Total Actions" value={stats.total} />
              <StatCard label="Last 24h" value={stats.last_24h} />
              <StatCard label="Last 7 Days" value={stats.last_week} />
              <StatCard label="AI Moderated (7d)" value={stats.ai_moderated_week} />
              <StatCard label="Raid Mode (7d)" value={stats.raid_mode_actions_week} />
              <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface">
                <div className="text-sm font-medium text-gray-900 dark:text-kick-text mb-2">By Rule (7d)</div>
                <div className="space-y-1">
                  {stats.by_rule_id.slice(0, 4).map((r) => (
                    <div key={r.rule} className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-kick-text-secondary">{r.rule}</span>
                      <span className="font-medium text-gray-900 dark:text-kick-text">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <div className="flex justify-end">
            <button
              onClick={loadLogs}
              disabled={logsLoading}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text hover:bg-gray-300 dark:hover:bg-kick-border transition-colors disabled:opacity-60"
            >
              {logsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Logs Table */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-kick-surface-hover border-b border-gray-200 dark:border-kick-border">
                  <tr className="text-left text-gray-600 dark:text-kick-text-secondary">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Rule</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-kick-border">
                  {moderationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-kick-text-secondary">
                        {logsLoading ? 'Loading...' : 'No moderation actions recorded yet'}
                      </td>
                    </tr>
                  ) : (
                    moderationLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-kick-surface-hover">
                        <td className="px-4 py-3 text-gray-500 dark:text-kick-text-secondary whitespace-nowrap">
                          {formatTimeAgo(log.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-kick-text">
                          {log.target_username}
                        </td>
                        <td className="px-4 py-3">
                          <Badge type={log.action_type === 'ban' ? 'error' : 'warning'}>
                            {log.action_type}
                            {log.duration_seconds && ` (${formatDuration(log.duration_seconds * 1000)})`}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge type={log.ai_flagged ? 'info' : 'neutral'}>
                              {log.rule_id || 'unknown'}
                            </Badge>
                            {log.ai_flagged && log.ai_max_score && (
                              <span className="text-xs text-gray-500">({(log.ai_max_score * 100).toFixed(0)}%)</span>
                            )}
                            {log.raid_mode_active && (
                              <Badge type="error">raid</Badge>
                            )}
                            {log.dry_run && (
                              <Badge type="warning">dry-run</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-kick-text-secondary max-w-xs truncate" title={log.reason || ''}>
                          {log.reason || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {log.success ? (
                            <Badge type="success">✓</Badge>
                          ) : (
                            <Badge type="error">✗</Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reply Logs Tab */}
      {activeTab === 'reply-logs' && (
        <div className="space-y-6">
          {/* Stats */}
          {replyStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Replies" value={replyStats.total} />
              <StatCard label="Last 24h" value={replyStats.last_24h} />
              <StatCard label="Last 7 Days" value={replyStats.last_week} />
              <StatCard
                label="Avg Latency"
                value={replyStats.avg_latency_ms ? `${Math.round(replyStats.avg_latency_ms)}ms` : '-'}
                sub="AI reply generation time"
              />
            </div>
          )}

          {/* Refresh Button */}
          <div className="flex justify-end">
            <button
              onClick={loadLogs}
              disabled={logsLoading}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text hover:bg-gray-300 dark:hover:bg-kick-border transition-colors disabled:opacity-60"
            >
              {logsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Logs Table */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-kick-surface-hover border-b border-gray-200 dark:border-kick-border">
                  <tr className="text-left text-gray-600 dark:text-kick-text-secondary">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                    <th className="px-4 py-3 font-medium">Reply</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-kick-border">
                  {replyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-kick-text-secondary">
                        {logsLoading ? 'Loading...' : 'No bot replies recorded yet'}
                      </td>
                    </tr>
                  ) : (
                    replyLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-kick-surface-hover">
                        <td className="px-4 py-3 text-gray-500 dark:text-kick-text-secondary whitespace-nowrap">
                          {formatTimeAgo(log.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-kick-text">
                          {log.trigger_username}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-kick-text-secondary max-w-xs truncate" title={log.trigger_message}>
                          {log.trigger_message}
                        </td>
                        <td className="px-4 py-3 text-gray-900 dark:text-kick-text max-w-xs truncate" title={log.reply_content}>
                          {log.reply_content}
                        </td>
                        <td className="px-4 py-3">
                          <Badge type={log.reply_type === 'ai' ? 'info' : 'neutral'}>
                            {log.reply_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-kick-text-secondary">
                          {log.latency_ms ? `${log.latency_ms}ms` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
