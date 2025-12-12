'use client'

import AdventCard from '@/components/AdventCard'
import SweetCoinsBar from '@/components/SweetCoinsBar'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface AdventItem {
  id: string
  day: number
  pointsCost: number
  image: string
  maxTickets: number
  unlocked: boolean
  userTickets: number
}

export default function ShopPage() {
  const router = useRouter()
  const [userBalance, setUserBalance] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adventItems, setAdventItems] = useState<AdventItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [utcTime, setUtcTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const utcString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      setUtcTime(utcString)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (isConnected) {
      fetchUserBalance()
      fetchAdventItems()

      // Poll for updated points balance every 5 seconds
      const balanceInterval = setInterval(() => {
        fetchUserBalance()
      }, 5000)

      return () => clearInterval(balanceInterval)
    }
  }, [isConnected])

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) {
        setIsConnected(false)
        setLoading(false)
        return
      }

      const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
      if (response.ok) {
        setIsConnected(true)
      } else {
        setIsConnected(false)
      }
    } catch (error) {
      console.error('Error checking auth:', error)
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserBalance = async () => {
    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.id) {
          const pointsResponse = await fetch(`/api/sweet-coins?kick_user_id=${data.id}`)
          if (pointsResponse.ok) {
            const pointsData = await pointsResponse.json()
            setUserBalance(pointsData.total_sweet_coins || 0)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user balance:', error)
    }
  }

  const fetchAdventItems = async () => {
    try {
      setItemsLoading(true)
      const response = await fetch('/api/advent')
      if (response.ok) {
        const data = await response.json()
        setAdventItems(data.items || [])
      }
    } catch (error) {
      console.error('Error fetching advent items:', error)
    } finally {
      setItemsLoading(false)
    }
  }

  const handlePurchase = () => {
    fetchUserBalance()
    fetchAdventItems()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
      </div>
    )
  }

  if (!isConnected) {
    return (
        <div className="max-w-2xl mx-auto text-center py-12">
          <h2 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-4">
            Connect your Kick account to access the shop
          </h2>
          <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
            The shop is available for verified Kick viewers. Connect your account to exchange points for advent calendar tickets.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
          >
            Connect Kick
          </button>
        </div>
    )
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-800 to-indigo-900 relative overflow-hidden">
        {/* Snowflake decorations */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute text-white/30 text-2xl animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              ❄️
            </div>
          ))}
        </div>

        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* UTC Time Display - Top Right */}
          {isConnected && (
            <div className="absolute top-4 right-4 z-20">
              <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 px-4 py-2">
                <div className="text-white text-sm font-mono">
                  {utcTime}
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <Image
                src="/icon.png"
                alt="SweetFlips"
                width={64}
                height={64}
                className="rounded-full"
                unoptimized
              />
              <h1 className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">
                $25,000 DECEMBER ADVENT CALENDAR
              </h1>
            </div>
            <p className="text-white/90 text-lg">
              Unlock daily prizes throughout December!
            </p>
          </div>

          <div className="max-w-2xl mx-auto mb-6">
            <SweetCoinsBar points={userBalance} />
          </div>

          {/* Shop Sections */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <button
              type="button"
              className="px-4 py-2 rounded-full text-sm font-semibold bg-white text-gray-900 shadow-sm border border-white/60"
              aria-current="page"
            >
              Advent Calendar
            </button>
            {[
              'Raffle Tickets',
              'Rewards',
              'Limited-Time',
            ].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                className="px-4 py-2 rounded-full text-sm font-semibold bg-white/10 text-white/70 border border-white/20 cursor-not-allowed"
                title="Coming soon"
              >
                <span>{label}</span>
                <span className="ml-2 inline-flex items-center rounded-full bg-white/15 border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white/80">
                  Soon
                </span>
              </button>
            ))}
          </div>

          {/* Advent Calendar Grid */}
          {itemsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...adventItems].sort((a, b) => a.day - b.day).map((item) => (
                <AdventCard
                  key={item.id}
                  item={item}
                  userBalance={userBalance}
                  onPurchase={handlePurchase}
                />
              ))}
            </div>
          )}

          {/* Info Section */}
          <div className="mt-12 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 max-w-3xl mx-auto">
            <h2 className="text-h3 font-semibold text-white mb-4 text-center">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📅</span>
                </div>
                <h3 className="text-h4 font-semibold text-white mb-2">
                  Daily Unlocks
                </h3>
                <p className="text-small text-white/80">
                  Each day unlocks on its calendar date in December. Come back daily to see new prizes!
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎫</span>
                </div>
                <h3 className="text-h4 font-semibold text-white mb-2">
                  Buy Tickets
                </h3>
                <p className="text-small text-white/80">
                  Exchange your points for advent calendar tickets. Max 25 tickets per item!
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎁</span>
                </div>
                <h3 className="text-h4 font-semibold text-white mb-2">
                  Win Prizes
                </h3>
                <p className="text-small text-white/80">
                  Use your tickets to enter raffles and win amazing prizes worth $25,000!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}
