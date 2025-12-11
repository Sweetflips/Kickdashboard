'use client'

import AppLayout from '@/components/AppLayout'
import { Toast } from '@/components/Toast'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Raffle = { id: string; title: string; status: string }

type OverlayState = {
  mode: 'raffle' | 'custom'
  raffle_id: string | null
  title: string | null
  locked: boolean
  wheel_background_url: string | null
  center_logo_url: string | null
  slice_opacity: number
}

type Entrant = { id: string; label: string; weight: number }

export default function AdminWheelPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [raffles, setRaffles] = useState<Raffle[]>([])
  const [entrants, setEntrants] = useState<Entrant[]>([])

  const [state, setState] = useState<OverlayState>({
    mode: 'raffle',
    raffle_id: null,
    title: null,
    locked: false,
    wheel_background_url: null,
    center_logo_url: null,
    slice_opacity: 0.5,
  })

  const [snapshot, setSnapshot] = useState<{ totalTickets: number; entrants: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [spinning, setSpinning] = useState(false)

  const token = useMemo(() => (typeof window !== 'undefined' ? localStorage.getItem('kick_access_token') : null), [])

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        if (!token) {
          router.push('/')
          return
        }
        const resp = await fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${token}` } })
        if (!resp.ok) {
          router.push('/')
          return
        }
        const data = await resp.json()
        if (!data.is_admin) {
          router.push('/')
          return
        }
        setIsAdminUser(true)
      } catch {
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    checkAdmin()
  }, [router, token])

  const loadAll = async () => {
    if (!token) return
    try {
      // Load raffles
      const rafflesResp = await fetch('/api/raffles?include_hidden=true&status=all', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (rafflesResp.ok) {
        const rd = await rafflesResp.json()
        setRaffles((rd.raffles || []).map((r: any) => ({ id: r.id, title: r.title, status: r.status })))
      }

      // Load overlay state + snapshot (admin auth bypasses overlay key)
      const stateResp = await fetch('/api/wheel/state', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (stateResp.ok) {
        const sd = await stateResp.json()
        setState({
          mode: sd.state.mode,
          raffle_id: sd.state.raffle_id,
          title: sd.state.title,
          locked: sd.state.locked,
          wheel_background_url: sd.state.wheel_background_url,
          center_logo_url: sd.state.center_logo_url,
          slice_opacity: Number(sd.state.slice_opacity ?? 0.5),
        })
        setSnapshot({
          totalTickets: sd.snapshot?.totalTickets || 0,
          entrants: sd.snapshot?.entries?.length || 0,
        })
      }

      // Load custom entrants
      const entrantsResp = await fetch('/api/wheel/entrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'list' }),
      })
      if (entrantsResp.ok) {
        const ed = await entrantsResp.json()
        setEntrants(ed.entrants || [])
      }
    } catch (e) {
      setToast({ message: 'Failed to load wheel data', type: 'error' })
    }
  }

  useEffect(() => {
    if (!isAdminUser) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminUser])

  const saveConfig = async (patch: Partial<OverlayState>) => {
    if (!token) return
    setSaving(true)
    setToast(null)
    try {
      const next = { ...state, ...patch }
      const resp = await fetch('/api/wheel/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: next.mode,
          raffle_id: next.mode === 'raffle' ? next.raffle_id : null,
          title: next.title,
          wheel_background_url: next.wheel_background_url,
          center_logo_url: next.center_logo_url,
          slice_opacity: next.slice_opacity,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err?.error || 'Failed to save')
      }
      setState(next)
      await loadAll()
      setToast({ message: 'Saved', type: 'success' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const setLocked = async (locked: boolean) => {
    if (!token) return
    setSaving(true)
    setToast(null)
    try {
      const resp = await fetch('/api/wheel/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: state.mode,
          raffle_id: state.mode === 'raffle' ? state.raffle_id : null,
          locked,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err?.error || 'Failed to update lock')
      }
      await loadAll()
      setToast({ message: locked ? 'Locked' : 'Unlocked', type: 'success' })
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to update lock', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const spin = async () => {
    if (!token) return
    setSpinning(true)
    setToast(null)
    try {
      const resp = await fetch('/api/wheel/spin', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Spin failed')
      setToast({ message: `Winner: ${data.spin?.winner_label || 'Unknown'}`, type: 'success' })
      await loadAll()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Spin failed', type: 'error' })
    } finally {
      setSpinning(false)
    }
  }

  const [newName, setNewName] = useState('')
  const [newWeight, setNewWeight] = useState(1)

  const addCustomEntrant = async () => {
    if (!token) return
    try {
      const resp = await fetch('/api/wheel/entrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'add', label: newName, weight: newWeight }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to add')
      setEntrants(data.entrants || [])
      setNewName('')
      setNewWeight(1)
      setToast({ message: 'Added', type: 'success' })
      await loadAll()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to add', type: 'error' })
    }
  }

  const removeCustomEntrant = async (id: string) => {
    if (!token) return
    try {
      const resp = await fetch('/api/wheel/entrants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'remove', id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to remove')
      setEntrants(data.entrants || [])
      await loadAll()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to remove', type: 'error' })
    }
  }

  if (loading || !isAdminUser) {
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">Wheel Overlay</h1>
            <p className="text-body text-gray-600 dark:text-kick-text-secondary">
              OBS overlay lives at <span className="font-mono">/wheel?key=...</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={spin}
              disabled={spinning || saving}
              className="px-4 py-2 bg-kick-purple text-white rounded-lg disabled:opacity-50"
            >
              {spinning ? 'Spinning…' : 'Spin'}
            </button>
            <button
              onClick={() => setLocked(!state.locked)}
              disabled={saving}
              className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg disabled:opacity-50"
            >
              {state.locked ? 'Unlock' : 'Lock'}
            </button>
          </div>
        </div>

        {snapshot && (
          <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="text-small text-gray-600 dark:text-kick-text-secondary">Mode</div>
                <div className="font-semibold text-gray-900 dark:text-kick-text">{state.mode}</div>
              </div>
              <div>
                <div className="text-small text-gray-600 dark:text-kick-text-secondary">Entrants</div>
                <div className="font-semibold text-gray-900 dark:text-kick-text">{snapshot.entrants}</div>
              </div>
              <div>
                <div className="text-small text-gray-600 dark:text-kick-text-secondary">Total tickets</div>
                <div className="font-semibold text-gray-900 dark:text-kick-text">{snapshot.totalTickets}</div>
              </div>
              <div>
                <div className="text-small text-gray-600 dark:text-kick-text-secondary">Locked</div>
                <div className="font-semibold text-gray-900 dark:text-kick-text">{state.locked ? 'Yes' : 'No'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 space-y-4">
          <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">Config</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Mode</label>
              <select
                value={state.mode}
                onChange={(e) => setState((s) => ({ ...s, mode: e.target.value as any }))}
                disabled={state.locked}
                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50"
              >
                <option value="raffle">Raffle</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {state.mode === 'raffle' && (
              <div>
                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Raffle</label>
                <select
                  value={state.raffle_id || ''}
                  onChange={(e) => setState((s) => ({ ...s, raffle_id: e.target.value || null }))}
                  disabled={state.locked}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50"
                >
                  <option value="">-- Select raffle --</option>
                  {raffles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} ({r.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Title (optional)</label>
            <input
              value={state.title || ''}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
              placeholder="e.g. Weekly Spin"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Wheel background URL</label>
              <input
                value={state.wheel_background_url || ''}
                onChange={(e) => setState((s) => ({ ...s, wheel_background_url: e.target.value || null }))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Center logo URL</label>
              <input
                value={state.center_logo_url || ''}
                onChange={(e) => setState((s) => ({ ...s, center_logo_url: e.target.value || null }))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                placeholder="https://..."
              />
            </div>
          </div>

          <div>
            <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
              Slice opacity ({state.slice_opacity})
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.slice_opacity}
              onChange={(e) => setState((s) => ({ ...s, slice_opacity: Number(e.target.value) }))}
              className="w-full"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => saveConfig({})}
              disabled={saving}
              className="px-6 py-2 bg-kick-purple text-white rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save config'}
            </button>
          </div>
        </div>

        {state.mode === 'custom' && (
          <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 space-y-4">
            <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">Custom entrants</h2>

            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                className="px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                disabled={state.locked}
              />
              <input
                type="number"
                min={1}
                value={newWeight}
                onChange={(e) => setNewWeight(Number(e.target.value))}
                className="w-28 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                disabled={state.locked}
              />
              <button
                onClick={addCustomEntrant}
                disabled={state.locked}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <div className="space-y-2">
              {entrants.length === 0 ? (
                <div className="text-gray-600 dark:text-kick-text-secondary">No custom entrants yet.</div>
              ) : (
                entrants.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-kick-surface-hover"
                  >
                    <div className="font-semibold text-gray-900 dark:text-kick-text">
                      {e.label}{' '}
                      <span className="text-small font-normal text-gray-600 dark:text-kick-text-secondary">
                        ({e.weight})
                      </span>
                    </div>
                    <button
                      onClick={() => removeCustomEntrant(e.id)}
                      disabled={state.locked}
                      className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AppLayout>
  )
}
