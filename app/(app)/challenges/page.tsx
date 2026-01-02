'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getClientAccessToken } from '@/lib/auth-client'

// Sample challenge data - will be replaced with API data later
const SAMPLE_CHALLENGES = [
  {
    id: '1',
    game: 'Gates of Olympus',
    provider: 'PRAGMATIC',
    image: null,
    multiplier: 500,
    minBet: 0.20,
    reward: 50,
  },
  {
    id: '2',
    game: 'Sweet Bonanza',
    provider: 'PRAGMATIC',
    image: null,
    multiplier: 1000,
    minBet: 0.20,
    reward: 100,
  },
  {
    id: '3',
    game: 'Wanted Dead or Wild',
    provider: 'HACKSAW',
    image: null,
    multiplier: 500,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '4',
    game: 'Chaos Crew',
    provider: 'HACKSAW',
    image: null,
    multiplier: 1000,
    minBet: 0.10,
    reward: 100,
  },
  {
    id: '5',
    game: 'Fruit Party',
    provider: 'PRAGMATIC',
    image: null,
    multiplier: 500,
    minBet: 0.20,
    reward: 75,
  },
  {
    id: '6',
    game: 'Big Bass Bonanza',
    provider: 'PRAGMATIC',
    image: null,
    multiplier: 1000,
    minBet: 0.10,
    reward: 150,
  },
]

export default function ChallengesPage() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

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
            Connect your Kick account to view challenges
          </h2>
          <p className="text-body text-kick-text-secondary mb-6">
            Connect your account to participate in Razed challenges and earn rewards.
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
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-bold text-kick-text">
              Challenges
            </h1>
            <span className="bg-kick-green/20 text-kick-green text-xs font-semibold px-2 py-1 rounded-full">
              RAZED
            </span>
          </div>
          <p className="text-kick-text-secondary text-lg">
            Hit multiplier targets to earn guaranteed rewards!
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-kick-surface rounded-xl border border-kick-border p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-kick-text mb-2">How Challenges Work</h2>
              <ul className="space-y-1 text-kick-text-secondary text-sm">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-kick-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Play selected games on Razed with the minimum bet
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-kick-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Hit the multiplier target to complete the challenge
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-kick-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Claim your guaranteed reward + bonus raffle entries
                </li>
              </ul>
            </div>
            <div className="flex-shrink-0">
              <a
                href="https://razed.com/?ref=sweetflips"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-kick-green text-kick-dark font-semibold rounded-lg hover:bg-kick-green-dark transition-colors"
              >
                Play on Razed
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Challenge Count */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-kick-text">
            {SAMPLE_CHALLENGES.length} Challenges
          </h3>
          <span className="text-sm text-kick-text-secondary">
            Refreshes weekly
          </span>
        </div>

        {/* Challenges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SAMPLE_CHALLENGES.map((challenge) => (
            <div
              key={challenge.id}
              className="bg-kick-surface rounded-xl border border-kick-border overflow-hidden hover:border-kick-green/50 transition-colors group"
            >
              {/* Game Image Placeholder */}
              <div className="relative h-40 bg-gradient-to-br from-kick-purple/30 to-kick-green/20 flex items-center justify-center">
                <span className="text-4xl">🎰</span>
                {/* Provider Badge */}
                <div className="absolute top-3 left-3">
                  <span className="bg-kick-dark/80 backdrop-blur-sm text-kick-text-secondary text-xs font-medium px-2 py-1 rounded">
                    {challenge.provider}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-4">
                <h4 className="text-lg font-semibold text-kick-text mb-4 truncate">
                  {challenge.game}
                </h4>

                {/* Stats Row */}
                <div className="flex items-center justify-between text-sm mb-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-kick-green font-semibold">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                      </svg>
                      {challenge.multiplier}x
                    </div>
                    <div className="text-kick-text-muted text-xs mt-1">Multiplier</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-kick-text font-semibold">
                      <svg className="w-4 h-4 text-kick-text-secondary" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                      ${challenge.minBet.toFixed(2)}
                    </div>
                    <div className="text-kick-text-muted text-xs mt-1">Min Bet</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-yellow-400 font-semibold">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
                      </svg>
                      ${challenge.reward}
                    </div>
                    <div className="text-kick-text-muted text-xs mt-1">Reward</div>
                  </div>
                </div>

                {/* Play Button */}
                <a
                  href="https://razed.com/?ref=sweetflips"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 bg-kick-purple text-white text-center font-semibold rounded-lg hover:bg-kick-purple-dark transition-colors"
                >
                  Play
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Info */}
        <div className="mt-8 bg-kick-surface-hover rounded-xl border border-kick-border p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-kick-green flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p className="text-kick-text-secondary text-sm">
            <span className="text-kick-text font-medium">Pro tip:</span> Completed challenges can stack with raffle entries for even more chances to win in our weekly $10,000 Super Saturday Raffles!
          </p>
        </div>
      </div>
    </div>
  )
}
