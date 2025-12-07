'use client'

import { getUnlockCountdown } from '@/lib/advent-calendar'
import Image from 'next/image'
import { useState } from 'react'
import AdventBuyModal from './AdventBuyModal'

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
        <div className="relative aspect-square bg-white/10 flex items-center justify-center p-4">
          {imageError ? (
            <div className="text-white/60 text-center">
              <div className="text-4xl mb-2">🎁</div>
              <div className="text-sm font-semibold">Day {item.day} Prize</div>
            </div>
          ) : (
            <Image
              src={item.image}
              alt={`Day ${item.day} prize`}
              width={200}
              height={200}
              className="object-contain max-w-full max-h-full"
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

        {/* Buy button or tickets owned */}
        {item.unlocked && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="pointer-events-auto">
              {item.userTickets > 0 ? (
                <div className="bg-green-500 text-white font-semibold px-4 py-2 rounded-lg shadow-lg">
                  {item.userTickets} ticket{item.userTickets !== 1 ? 's' : ''} owned
                </div>
              ) : (
                <button
                  onClick={() => setShowModal(true)}
                  disabled={userBalance < item.pointsCost}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-all"
                >
                  Buy
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Secondary buy button under the card */}
      <div className="mt-2">
        <button
          onClick={() => setShowModal(true)}
          disabled={!item.unlocked || item.isPast || userBalance < item.pointsCost}
          className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${item.isPast
            ? 'bg-white/10 text-white/50 cursor-not-allowed'
            : item.unlocked && userBalance >= item.pointsCost
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-white/10 text-white/60 cursor-not-allowed'
            }`}
        >
          {item.isPast ? 'Closed' : item.unlocked ? 'Buy Tickets' : 'Coming Soon'}
        </button>
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
