'use client'

import SweetCoinsBar from '@/components/SweetCoinsBar'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getClientAccessToken } from '@/lib/auth-client'

export default function ShopPage() {
  const router = useRouter()
  const [userBalance, setUserBalance] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
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

      // Poll for updated points balance every 5 seconds
      const balanceInterval = setInterval(() => {
        fetchUserBalance()
      }, 5000)

      return () => clearInterval(balanceInterval)
    }
  }, [isConnected])

  const checkAuth = async () => {
    try {
      const token = getClientAccessToken()
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
      const token = getClientAccessToken()
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-kick-dark">
        <div className="max-w-2xl mx-auto text-center py-12 px-4">
          <h2 className="text-h2 font-semibold text-kick-text mb-4">
            Connect your Kick account to access the shop
          </h2>
          <p className="text-body text-kick-text-secondary mb-6">
            The shop is available for verified Kick viewers. Connect your account to participate in raffles and challenges.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
          >
            Connect Kick
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-kick-dark">
      <div className="container mx-auto px-4 py-8">
        {/* UTC Time Display - Top Right */}
        <div className="flex justify-end mb-4">
          <div className="bg-kick-surface rounded-lg border border-kick-border px-4 py-2">
            <div className="text-kick-text-secondary text-sm font-mono">
              {utcTime}
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Image
              src="/icon.png"
              alt="SweetFlips"
              width={56}
              height={56}
              className="rounded-full"
              unoptimized
            />
            <h1 className="text-4xl md:text-5xl font-bold text-kick-text">
              Shop
            </h1>
          </div>
          <p className="text-kick-text-secondary text-lg">
            Powered by <span className="text-kick-green font-bold">RAZED</span>
          </p>
        </div>

        {/* Sweet Coins Balance */}
        <div className="max-w-2xl mx-auto mb-10">
          <SweetCoinsBar points={userBalance} />
        </div>

        {/* Razed Raffles Section */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="bg-kick-surface rounded-2xl border border-kick-border p-8 relative overflow-hidden">
            {/* Accent glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-kick-green/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🎰</span>
                <h2 className="text-2xl md:text-3xl font-bold text-kick-green">
                  RAZED
                </h2>
              </div>
              
              <h3 className="text-xl md:text-2xl font-semibold text-kick-text mb-2">
                Super Saturday Raffles
              </h3>
              
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="bg-kick-green/20 border border-kick-green/30 rounded-lg px-4 py-2">
                  <span className="text-kick-green font-bold text-2xl">$10,000</span>
                  <span className="text-kick-text-secondary ml-2">every week</span>
                </div>
              </div>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-center gap-2 text-kick-text-secondary">
                  <svg className="w-5 h-5 text-kick-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Prizes announced weekly
                </li>
                <li className="flex items-center gap-2 text-kick-text-secondary">
                  <svg className="w-5 h-5 text-kick-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  First raffle: <span className="text-kick-text font-medium">Saturday, January 9</span>
                </li>
              </ul>
              
              <button className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-semibold">
                Learn More
              </button>
            </div>
          </div>
        </div>

        {/* Razed Challenges Section */}
        <div className="max-w-4xl mx-auto mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">👀</span>
            <h2 className="text-2xl font-bold text-kick-text">
              Razed Challenges
            </h2>
            <span className="bg-kick-green/20 text-kick-green text-xs font-semibold px-2 py-1 rounded-full">
              NEW
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Challenge Feature Card 1 */}
            <div className="bg-kick-surface rounded-xl border border-kick-border p-6 hover:border-kick-green/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-kick-purple/20 flex items-center justify-center">
                  <span className="text-xl">🎮</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text">Play Selected Games</h3>
              </div>
              <p className="text-kick-text-secondary text-sm">
                Choose from curated games on Razed to complete challenges and earn rewards.
              </p>
            </div>

            {/* Challenge Feature Card 2 */}
            <div className="bg-kick-surface rounded-xl border border-kick-border p-6 hover:border-kick-green/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-kick-green/20 flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text">Hit Multiplier Targets</h3>
              </div>
              <p className="text-kick-text-secondary text-sm">
                Reach set multiplier targets like <span className="text-kick-green font-semibold">500x</span> or <span className="text-kick-green font-semibold">1,000x</span> to win.
              </p>
            </div>

            {/* Challenge Feature Card 3 */}
            <div className="bg-kick-surface rounded-xl border border-kick-border p-6 hover:border-kick-green/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <span className="text-xl">💰</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text">Low Minimum Bets</h3>
              </div>
              <p className="text-kick-text-secondary text-sm">
                Start with minimal risk. Low bet requirements make challenges accessible to everyone.
              </p>
            </div>

            {/* Challenge Feature Card 4 */}
            <div className="bg-kick-surface rounded-xl border border-kick-border p-6 hover:border-kick-green/50 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <span className="text-xl">🏆</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text">Guaranteed Rewards</h3>
              </div>
              <p className="text-kick-text-secondary text-sm">
                Every completed challenge earns you guaranteed rewards. No luck needed.
              </p>
            </div>
          </div>

          {/* Stacking Note */}
          <div className="bg-kick-surface-hover rounded-xl border border-kick-border p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-kick-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-kick-text-secondary text-sm">
              <span className="text-kick-text font-medium">Pro tip:</span> Challenges refresh regularly and can stack with raffle entries for even more chances to win!
            </p>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-kick-surface rounded-2xl border border-kick-border p-8">
            <h2 className="text-xl font-semibold text-kick-text mb-6 text-center">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-kick-purple/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎟️</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text mb-2">
                  1. Enter Raffles
                </h3>
                <p className="text-sm text-kick-text-secondary">
                  Join weekly $10k Super Saturday draws for a chance to win big prizes.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-kick-green/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text mb-2">
                  2. Complete Challenges
                </h3>
                <p className="text-sm text-kick-text-secondary">
                  Hit multiplier targets on selected games to earn guaranteed rewards.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="text-lg font-semibold text-kick-text mb-2">
                  3. Stack Rewards
                </h3>
                <p className="text-sm text-kick-text-secondary">
                  Challenges can earn extra raffle entries. The more you play, the more you can win!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
