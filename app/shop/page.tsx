'use client'

import AdventCard from '@/components/AdventCard'
import AppLayout from '@/components/AppLayout'
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
          const pointsResponse = await fetch(`/api/points?kick_user_id=${data.id}`)
          if (pointsResponse.ok) {
            const pointsData = await pointsResponse.json()
            setUserBalance(pointsData.total_points || 0)
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
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
        </div>
      </AppLayout>
    )
  }

  if (!isConnected) {
    return (
      <AppLayout>
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
      </AppLayout>
    )
  }

  return (
    <AppLayout>
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

          {/* Points Balance Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 mb-8 max-w-md mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-yellow-400/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <div>
                  <p className="text-small font-medium text-white/80">
                    Your Points Balance
                  </p>
                  <p className="text-h2 font-bold text-yellow-300">
                    {userBalance.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
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
    </AppLayout>
  )
}
