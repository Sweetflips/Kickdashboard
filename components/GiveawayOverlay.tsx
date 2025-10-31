'use client'

import { useEffect, useState } from 'react'
import GiveawayWheel from './GiveawayWheel'

interface Segment {
  id: string
  label: string
  color: string
  weight: number
  order_index: number
}

interface GiveawayOverlayProps {
  giveawayId: string
  transparent?: boolean
}

export default function GiveawayOverlay({ giveawayId, transparent = false }: GiveawayOverlayProps) {
  const [giveaway, setGiveaway] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null)

  useEffect(() => {
    const fetchGiveaway = async () => {
      try {
        const response = await fetch(`/api/giveaways/${giveawayId}/overlay`)
        if (response.ok) {
          const data = await response.json()
          setGiveaway(data.giveaway)
        }
      } catch (error) {
        console.error('Error fetching giveaway:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchGiveaway()

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchGiveaway, 2000)

    return () => clearInterval(interval)
  }, [giveawayId])

  useEffect(() => {
    if (giveaway?.winner && !spinning) {
      // Find winner segment index
      const segmentIndex = giveaway.segments.findIndex(
        (seg: Segment) => seg.id === giveaway.winner.segment?.label
      )
      if (segmentIndex !== -1) {
        setWinnerIndex(segmentIndex)
        setSpinning(true)
      }
    }
  }, [giveaway?.winner])

  if (loading) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${transparent ? 'bg-transparent' : 'bg-black'}`}>
        <div className="text-white text-xl">Loading giveaway...</div>
      </div>
    )
  }

  if (!giveaway) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${transparent ? 'bg-transparent' : 'bg-black'}`}>
        <div className="text-white text-xl">Giveaway not found</div>
      </div>
    )
  }

  const segments = giveaway.segments || []

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-8 ${transparent ? 'bg-transparent' : 'bg-black'}`}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">{giveaway.title}</h1>
        {giveaway.description && (
          <p className="text-xl text-gray-300 mb-4">{giveaway.description}</p>
        )}
        <div className="text-lg text-gray-400">
          {giveaway.entries_count} {giveaway.entries_count === 1 ? 'participant' : 'participants'} • {giveaway.total_tickets || 0} {giveaway.total_tickets === 1 ? 'ticket' : 'tickets'}
        </div>
      </div>

      {segments.length > 0 && (
        <div className="mb-8">
          <GiveawayWheel
            segments={segments}
            spinning={spinning}
            winnerIndex={winnerIndex}
            size={500}
            onSpinComplete={(index) => {
              setSpinning(false)
            }}
          />
        </div>
      )}

      {giveaway.winner && (
        <div className="mt-8 text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-2">🎉 Winner! 🎉</div>
          <div className="text-2xl text-white mb-2">{giveaway.winner.username}</div>
          {giveaway.winner.segment && (
            <div className="text-xl text-gray-300">
              Segment: {giveaway.winner.segment.label}
            </div>
          )}
        </div>
      )}

      {giveaway.status === 'active' && !giveaway.winner && (
        <div className="mt-4 text-center">
          <div className="text-xl text-green-400">Giveaway Active</div>
          <div className="text-sm text-gray-400 mt-2">Waiting for spin...</div>
        </div>
      )}

      {giveaway.status === 'completed' && !giveaway.winner && (
        <div className="mt-4 text-center">
          <div className="text-xl text-gray-400">Giveaway Completed</div>
        </div>
      )}
    </div>
  )
}
