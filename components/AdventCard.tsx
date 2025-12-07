'use client'

import { getUnlockCountdown } from '@/lib/advent-calendar'
import Image from 'next/image'
import { useState, useMemo } from 'react'
import AdventBuyModal from './AdventBuyModal'

// Cache-busting version - increment this when images are updated
const IMAGE_VERSION = '3'

interface AdventCardProps {
  item: {
    id: string
    day: number
    pointsCost: number
    image: string
    maxTickets: number
    unlocked: boolean
    isPast?: boolean
    userTickets: number
  }
  userBalance: number
  onPurchase: () => void
}

export default function AdventCard({ item, userBalance, onPurchase }: AdventCardProps) {
  const [showModal, setShowModal] = useState(false)
  const [imageError, setImageError] = useState(false)
  const countdown = getUnlockCountdown(item.day)
  const imageUrl = useMemo(() => `${item.image}?v=${IMAGE_VERSION}`, [item.image])

  const handleBuy = async (quantity: number) => {
    const response = await fetch(`/api/advent/${item.id}/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to purchase')
    }

    const data = await response.json()
    onPurchase()
    return data
  }

  return (
    <div>
      <div className="relative bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 rounded-xl overflow-hidden border-2 border-blue-300 shadow-lg">
        {/* Points cost badge - top left */}
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-gradient-to-r from-yellow-400 via-orange-400 to-orange-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm">
            {item.pointsCost.toLocaleString()} pts
          </div>
        </div>

        {/* Prize image */}
        <div className="relative aspect-square bg-white/10 flex items-center justify-center p-2">
          {imageError ? (
            <div className="text-white/60 text-center">
              <div className="text-4xl mb-2">🎁</div>
              <div className="text-sm font-semibold">Day {item.day} Prize</div>
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={`Day ${item.day} prize`}
              width={240}
              height={240}
              className="object-contain w-full h-full"
              unoptimized
              onError={() => setImageError(true)}
            />
          )}
        </div>

        {/* Locked / Drawn / Coming Soon overlay */}
        {!item.unlocked && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 p-4">
            <div className="text-white text-center">
              {item.isPast ? (
                <>
                  <div className="text-2xl font-bold mb-2">🎲 Drawn</div>
                  <div className="text-sm">This day has passed</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold mb-2">⏳ Coming Soon</div>
                  {countdown && (
                    <div className="text-sm">
                      <div>Opens in:</div>
                      <div className="font-semibold mt-1">
                        {countdown.days}d {countdown.hours}h {countdown.minutes}m
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Buy button under the card */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setShowModal(true)}
          disabled={!item.unlocked || item.isPast || userBalance < item.pointsCost}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${item.isPast
            ? 'bg-white/10 text-white/50 cursor-not-allowed'
            : item.unlocked && userBalance >= item.pointsCost
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-white/10 text-white/60 cursor-not-allowed'
            }`}
        >
          {item.isPast ? 'Closed' : item.unlocked ? 'Buy Tickets' : 'Coming Soon'}
        </button>
        {item.userTickets > 0 && (
          <div className="px-3 py-2 rounded-lg text-sm font-semibold bg-purple-600 text-white flex items-center">
            {item.userTickets} 🎫
          </div>
        )}
      </div>

      {showModal && (
        <AdventBuyModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          item={item}
          userBalance={userBalance}
          onPurchase={handleBuy}
        />
      )}
    </div>
  )
}
