'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/AppLayout'
import GiveawayAdmin from '@/components/GiveawayAdmin'

interface Segment {
  id: string
  label: string
  color: string
  weight: number
  order_index: number
}

interface Giveaway {
  id: string
  title: string
  description?: string
  prize_amount?: string
  number_of_winners?: number
  status: string
  entry_min_points: number
  entries_count: number
  total_tickets?: number
  winners_count: number
  stream_session_id?: string
  winners?: Array<{
    entry: {
      user: {
        username: string
        kick_user_id: string
        profile_picture_url?: string
      }
    }
    selected_at: string
  }>
}

export default function GiveawaysPage() {
  const [giveaways, setGiveaways] = useState<Giveaway[]>([])
  const [loading, setLoading] = useState(true)
  const [editingGiveaway, setEditingGiveaway] = useState<Giveaway | null>(null)
  const [creatingNew, setCreatingNew] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  useEffect(() => {
    fetchGiveaways()
  }, [selectedStatus])

  const fetchGiveaways = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const statusParam = selectedStatus === 'all' ? '' : `?status=${selectedStatus}`
      const response = await fetch(`/api/giveaways${statusParam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setGiveaways(data.giveaways || [])
      }
    } catch (error) {
      console.error('Error fetching giveaways:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (giveawayData: Partial<Giveaway>) => {
    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch('/api/giveaways', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(giveawayData),
      })

      if (response.ok) {
        await fetchGiveaways()
        setCreatingNew(true) // Keep form open for next giveaway
        setEditingGiveaway(null)
      } else {
        const error = await response.json()
        alert(`Failed to create giveaway: ${error.error}`)
      }
    } catch (error) {
      console.error('Error creating giveaway:', error)
      alert('Failed to create giveaway')
    }
  }

  const handleUpdate = async (giveawayData: Partial<Giveaway>) => {
    if (!editingGiveaway) return

    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/giveaways/${editingGiveaway.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(giveawayData),
      })

      if (response.ok) {
        await fetchGiveaways()
        setEditingGiveaway(null)
      } else {
        const error = await response.json()
        alert(`Failed to update giveaway: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating giveaway:', error)
      alert('Failed to update giveaway')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this giveaway?')) return

    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/giveaways/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        await fetchGiveaways()
      } else {
        const error = await response.json()
        alert(`Failed to delete giveaway: ${error.error}`)
      }
    } catch (error) {
      console.error('Error deleting giveaway:', error)
      alert('Failed to delete giveaway')
    }
  }

  const handleActivate = async (id: string) => {
    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/giveaways/${id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        await fetchGiveaways()
        alert('Giveaway activated! Users will be auto-entered as they chat.')
      } else {
        const error = await response.json()
        alert(`Failed to activate giveaway: ${error.error}`)
      }
    } catch (error) {
      console.error('Error activating giveaway:', error)
      alert('Failed to activate giveaway')
    }
  }

  const handleSpin = async (id: string) => {
    if (!confirm('Spin the wheel and select a winner? This cannot be undone.')) return

    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/giveaways/${id}/spin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        await fetchGiveaways()
        const winners = data.winners || []
        const winnerNames = winners.map((w: any) => w.entry.user.username).join(', ')
        alert(`Winners selected: ${winnerNames}!`)
      } else {
        const error = await response.json()
        alert(`Failed to spin: ${error.error}`)
      }
    } catch (error) {
      console.error('Error spinning giveaway:', error)
      alert('Failed to spin giveaway')
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; label: string }> = {
      draft: { color: 'bg-gray-500', label: 'Draft' },
      active: { color: 'bg-green-500', label: 'Active' },
      completed: { color: 'bg-blue-500', label: 'Completed' },
      cancelled: { color: 'bg-red-500', label: 'Cancelled' },
    }
    const badge = badges[status] || badges.draft
    return (
      <span className={`px-2 py-1 rounded text-xs text-white ${badge.color}`}>
        {badge.label}
      </span>
    )
  }

  const getOverlayUrl = (id: string) => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/giveaways/overlay/${id}?transparent=true`
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">Giveaways</h1>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {['all', 'draft', 'active', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2 rounded-lg ${
                selectedStatus === status
                  ? 'bg-kick-purple text-white'
                  : 'bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Create/Edit Form */}
        {(creatingNew || editingGiveaway) && (
          <GiveawayAdmin
            giveaway={editingGiveaway}
            onSave={editingGiveaway ? handleUpdate : handleCreate}
            onCancel={() => {
              if (editingGiveaway) {
                setEditingGiveaway(null)
              }
              // Don't close form when creating - keep it open
            }}
            onActivate={handleActivate}
            onSpin={handleSpin}
          />
        )}

        {/* Giveaways List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto"></div>
          </div>
        ) : giveaways.length === 0 ? (
          <div className="text-center py-12 text-gray-600 dark:text-kick-text-secondary">
            No giveaways found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {giveaways.map((giveaway) => (
              <div
                key={giveaway.id}
                className="bg-white dark:bg-kick-surface rounded-lg border border-gray-200 dark:border-kick-border p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text">
                    {giveaway.prize_amount || 'Giveaway'}
                  </h3>
                  {getStatusBadge(giveaway.status)}
                </div>

                <div className="space-y-2 mb-4">
                  <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    <strong>Prize:</strong> {giveaway.prize_amount || 'Not specified'}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    <strong>Winners:</strong> {giveaway.number_of_winners || 1}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    <strong>Participants:</strong> {giveaway.entries_count}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    <strong>Total Tickets:</strong> {giveaway.total_tickets || giveaway.entries_count || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    <strong>Min Points:</strong> {giveaway.entry_min_points}
                  </div>
                </div>

                {giveaway.winners && giveaway.winners.length > 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                      {giveaway.winners.length === 1 ? 'Winner:' : 'Winners:'}
                    </div>
                    {giveaway.winners.map((winner, idx) => (
                      <div key={idx} className="text-sm text-yellow-700 dark:text-yellow-300">
                        {idx + 1}. {winner.entry.user.username}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {giveaway.status === 'active' && (
                    <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                      <strong>OBS Overlay URL:</strong>
                      <div className="mt-1 break-all text-blue-600 dark:text-blue-400">
                        {getOverlayUrl(giveaway.id)}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {giveaway.status === 'draft' && (
                      <>
                        <button
                          onClick={() => handleActivate(giveaway.id)}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          Activate
                        </button>
                        <button
                          onClick={() => {
                            fetch(`/api/giveaways/${giveaway.id}`, {
                              headers: {
                                Authorization: `Bearer ${localStorage.getItem('kick_access_token')}`,
                              },
                            })
                              .then((res) => res.json())
                              .then((data) => {
                                setEditingGiveaway(data.giveaway)
                                setCreatingNew(false)
                              })
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text rounded hover:bg-gray-300 dark:hover:bg-kick-surface text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(giveaway.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {giveaway.status === 'active' && (
                      <button
                        onClick={() => handleSpin(giveaway.id)}
                        className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                      >
                        Spin Wheel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
