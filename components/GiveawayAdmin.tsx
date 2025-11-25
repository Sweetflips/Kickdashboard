'use client'

import { useState, useEffect } from 'react'

interface Giveaway {
  id: string
  title: string
  description?: string
  prize_amount?: string
  number_of_winners?: number
  status: string
  entry_min_points: number
  scheduled_start?: string
  scheduled_end?: string
  stream_session_id?: string
}

interface GiveawayAdminProps {
  giveaway?: Giveaway | null
  onSave: (giveaway: Partial<Giveaway>) => void
  onCancel: () => void
  onActivate?: (id: string) => void
  onSpin?: (id: string) => void
  loading?: boolean
}

export default function GiveawayAdmin({
  giveaway,
  onSave,
  onCancel,
  onActivate,
  onSpin,
  loading = false,
}: GiveawayAdminProps) {
  const [prizeAmount, setPrizeAmount] = useState('')
  const [numberOfWinners, setNumberOfWinners] = useState(1)
  const [entryMinPoints, setEntryMinPoints] = useState(0)
  const [streamSessionId, setStreamSessionId] = useState<string>('')
  const [streamSessions, setStreamSessions] = useState<Array<{ id: string; session_title: string | null; started_at: string }>>([])
  const [loadingSessions, setLoadingSessions] = useState(false)

  useEffect(() => {
    if (giveaway) {
      setPrizeAmount(giveaway.prize_amount || '')
      setNumberOfWinners(giveaway.number_of_winners || 1)
      setEntryMinPoints(giveaway.entry_min_points)
      setStreamSessionId(giveaway.stream_session_id || '')
    } else {
      // Reset form when creating new
      setPrizeAmount('')
      setNumberOfWinners(1)
      setEntryMinPoints(0)
      setStreamSessionId('')
      // Load stream sessions when creating new giveaway
      fetchStreamSessions()
    }
  }, [giveaway])

  const fetchStreamSessions = async () => {
    try {
      setLoadingSessions(true)
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/stream-sessions?limit=50`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include', // Include cookies for authentication
      })

      if (response.ok) {
        const data = await response.json()
        setStreamSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Error fetching stream sessions:', error)
    } finally {
      setLoadingSessions(false)
    }
  }

  const handleSave = () => {
    if (!streamSessionId) {
      alert('Please select a stream session')
      return
    }
    if (!prizeAmount.trim()) {
      alert('Prize amount is required')
      return
    }
    if (numberOfWinners < 1) {
      alert('Number of winners must be at least 1')
      return
    }

    onSave({
      prize_amount: prizeAmount,
      number_of_winners: numberOfWinners,
      entry_min_points: entryMinPoints,
      stream_session_id: streamSessionId,
    })
  }

  return (
    <div className="bg-white dark:bg-kick-surface rounded-lg border border-gray-200 dark:border-kick-border p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-kick-text">
        {giveaway ? 'Edit Giveaway' : 'Create Giveaway'}
      </h2>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
              Stream Session *
            </label>
            {giveaway ? (
              <input
                type="text"
                value={streamSessionId ? `Session ${streamSessionId}` : 'No session'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-gray-100 dark:bg-kick-dark text-gray-500 dark:text-kick-text-secondary"
              />
            ) : (
              <select
                value={streamSessionId}
                onChange={(e) => setStreamSessionId(e.target.value)}
                disabled={loadingSessions}
                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
              >
                <option value="">Select stream...</option>
                {streamSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.session_title || `Session ${session.id}`} ({new Date(session.started_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            )}
            {!giveaway && (
              <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-secondary">
                Select which stream session to use
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
              Prize Amount *
            </label>
            <input
              type="text"
              value={prizeAmount}
              onChange={(e) => setPrizeAmount(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
              placeholder="e.g., $100, 1000 points"
            />
            {!giveaway && (
              <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-secondary">
                What are you giving away?
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
              Number of Winners *
            </label>
            <input
              type="number"
              value={numberOfWinners}
              onChange={(e) => setNumberOfWinners(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
            />
            {!giveaway && (
              <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-secondary">
                How many winners to select
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
            Minimum Points (Optional)
          </label>
          <input
            type="number"
            value={entryMinPoints}
            onChange={(e) => setEntryMinPoints(parseInt(e.target.value) || 0)}
            min={0}
            className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-secondary">
            Minimum points required to enter (0 = all viewers can participate)
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-6 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/90 disabled:opacity-50"
          >
            {giveaway ? 'Update' : 'Create'} Giveaway
          </button>
          {giveaway && giveaway.status === 'draft' && onActivate && (
            <button
              onClick={() => onActivate(giveaway.id)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Activate
            </button>
          )}
          {giveaway && giveaway.status === 'active' && onSpin && (
            <button
              onClick={() => onSpin(giveaway.id)}
              className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Select Winners
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 dark:border-kick-border rounded-lg text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-dark"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
