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
    userTickets: number
  }
  userBalance: number
  onPurchase: () => void
}

export default function AdventCard({ item, userBalance, onPurchase }: AdventCardProps) {
  const [showModal, setShowModal] = useState(false)
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
    <>
      <div className="relative bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 rounded-xl overflow-hidden border-2 border-blue-300 shadow-lg">
        {/* Points cost badge - top left */}
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-gradient-to-r from-yellow-400 via-orange-400 to-orange-500 text-white font-bold px-3 py-1 rounded-full shadow-lg text-sm">
            {item.pointsCost.toLocaleString()} pts
          </div>
        </div>

        {/* Day number banner - bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <div className="bg-gradient-to-r from-red-500 via-red-600 to-blue-600 text-white font-bold text-center py-2 px-4">
            Day {item.day}
          </div>
        </div>

        {/* Prize image */}
        <div className="relative aspect-square bg-white/10 flex items-center justify-center p-4">
          <Image
            src={item.image}
            alt={`Day ${item.day} prize`}
            width={200}
            height={200}
            className="object-contain max-w-full max-h-full"
            unoptimized
          />
        </div>

        {/* Locked overlay */}
        {!item.unlocked && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 p-4">
            <div className="text-white text-center">
              <div className="text-2xl font-bold mb-2">🔒 Locked</div>
              {countdown && (
                <div className="text-sm">
                  <div>Unlocks in:</div>
                  <div className="font-semibold mt-1">
                    {countdown.days}d {countdown.hours}h {countdown.minutes}m
                  </div>
                </div>
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

      {showModal && (
        <AdventBuyModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          item={item}
          userBalance={userBalance}
          onPurchase={handleBuy}
        />
      )}
    </>
  )
}
