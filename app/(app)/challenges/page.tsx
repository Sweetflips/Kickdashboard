'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getClientAccessToken } from '@/lib/auth-client'

// Helper function to generate Razed game URL
const getRazedGameUrl = (gameName: string): string => {
  const gameSlugs: Record<string, string> = {
    'Big Bass Splash 1000': 'big-bass-splash-1000',
    'Big Bass Splash 5000': 'big-bass-splash-5000',
    'Le Zeus': 'le-zeus',
    'Sweet Bonanza 1000': 'sweet-bonanza-1000',
    'Wanted Dead or Wild': 'wanted-dead-or-a-wild',
    'Donny & Danny': 'donny-and-danny',
    'Fruit Party': 'fruit-party',
    'Sugar Rush 1000': 'sugar-rush-1000',
    'Big Stack Nutcracker': 'big-stack-nutcracker',
    'Hammer Storm': 'hammer-storm',
    '1000 Xmas': '1000-xmas',
    'Toshi Ways Club': 'toshi-ways-club',
    'Duck Hunters': 'duck-hunters',
  }

  const slug = gameSlugs[gameName] || gameName.toLowerCase().replace(/\s+/g, '-')
  return `https://razed.com/game/${slug}?ref=sweetflips`
}

// Challenge data with images and game-specific URLs
const SAMPLE_CHALLENGES = [
  {
    id: '1',
    game: 'Big Bass Splash 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/big-bass-splash-1000.avif',
    multiplier: 750,
    minBet: 0.20,
    reward: 100,
  },
  {
    id: '2',
    game: 'Big Bass Splash 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/big-bass-splash-1000.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 200,
  },
  {
    id: '3',
    game: 'Big Bass Splash 5000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/big-bass-splash-1000.avif',
    multiplier: 500,
    minBet: 0.20,
    reward: 100,
  },
  {
    id: '4',
    game: 'Le Zeus',
    provider: 'HACKSAW',
    image: '/Challenges/le-zeus-new (1).avif',
    multiplier: 750,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '5',
    game: 'Sweet Bonanza 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/sugar-rush-1000.avif',
    multiplier: 1500,
    minBet: 0.20,
    reward: 100,
  },
  {
    id: '6',
    game: 'Wanted Dead or Wild',
    provider: 'HACKSAW',
    image: '/Challenges/wanted-dead-or-a-wild.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 200,
  },
  {
    id: '7',
    game: 'Donny & Danny',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/donny-and-danny.avif',
    multiplier: 500,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '8',
    game: 'Donny & Danny',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/donny-and-danny.avif',
    multiplier: 1000,
    minBet: 0.10,
    reward: 100,
  },
  {
    id: '9',
    game: 'Fruit Party',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/prag-vs20fruitswx (1).avif',
    multiplier: 500,
    minBet: 0.20,
    reward: 75,
  },
  {
    id: '10',
    game: 'Sugar Rush 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/sugar-rush-1000.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 100,
  },
  {
    id: '11',
    game: 'Duck Hunters',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/donny-and-danny.avif',
    multiplier: 500,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '12',
    game: 'Duck Hunters',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/donny-and-danny.avif',
    multiplier: 1000,
    minBet: 0.10,
    reward: 100,
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
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-4">
          Connect your Kick account to view challenges
        </h2>
        <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
          Connect your account to participate in Razed challenges and earn rewards.
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
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 rounded-2xl p-8 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.08%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2">
              🎯 Challenges
            </h1>
            <p className="text-lg text-white/90 max-w-2xl">
              Hit multiplier targets on selected games to earn guaranteed rewards. Powered by <span className="font-bold">RAZED</span>.
            </p>
          </div>
          <a
            href="https://razed.com/?ref=sweetflips"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-green-600 font-semibold rounded-lg hover:bg-white/90 transition-colors flex-shrink-0"
          >
            Play on Razed
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-xl">🎮</span>
            </div>
            <div>
              <p className="text-small text-gray-600 dark:text-kick-text-secondary">Active Challenges</p>
              <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{SAMPLE_CHALLENGES.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
            <div>
              <p className="text-small text-gray-600 dark:text-kick-text-secondary">Total Rewards</p>
              <p className="text-h4 font-bold text-kick-green">${SAMPLE_CHALLENGES.reduce((sum, c) => sum + c.reward, 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <span className="text-xl">🔄</span>
            </div>
            <div>
              <p className="text-small text-gray-600 dark:text-kick-text-secondary">Refresh</p>
              <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">Weekly</p>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
        <h2 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-4">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-kick-purple/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-kick-purple">1</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-kick-text">Play on Razed</h3>
              <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Choose a game from the challenges below with the minimum bet.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-kick-purple/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-kick-purple">2</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-kick-text">Hit the Multiplier</h3>
              <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Reach the target multiplier (500x or 1,000x) to complete the challenge.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-kick-purple/20 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-kick-purple">3</span>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-kick-text">Claim Reward</h3>
              <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Get your guaranteed reward + bonus raffle entries!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Challenges Grid */}
      <div>
        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
          Available Challenges
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SAMPLE_CHALLENGES.map((challenge) => (
            <div
              key={challenge.id}
              className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border overflow-hidden hover:border-kick-green dark:hover:border-kick-green transition-colors"
            >
              {/* Game Image */}
              <div className="relative h-36 bg-gradient-to-br from-kick-purple/20 to-kick-green/20 overflow-hidden">
                {challenge.image ? (
                  <Image
                    src={challenge.image}
                    alt={challenge.game}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl">🎰</span>
                  </div>
                )}
                {/* Provider Badge */}
                <div className="absolute top-3 left-3 z-10">
                  <span className="bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2 py-1 rounded">
                    {challenge.provider}
                  </span>
                </div>
              </div>

              {/* Card Content */}
              <div className="p-4">
                <h4 className="text-body font-semibold text-gray-900 dark:text-kick-text mb-4 truncate">
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
                    <div className="text-gray-500 dark:text-kick-text-muted text-xs mt-1">Multiplier</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-gray-900 dark:text-kick-text font-semibold">
                      <svg className="w-4 h-4 text-gray-500 dark:text-kick-text-secondary" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                      ${challenge.minBet.toFixed(2)}
                    </div>
                    <div className="text-gray-500 dark:text-kick-text-muted text-xs mt-1">Min Bet</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-yellow-500 font-semibold">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
                      </svg>
                      ${challenge.reward}
                    </div>
                    <div className="text-gray-500 dark:text-kick-text-muted text-xs mt-1">Reward</div>
                  </div>
                </div>

                {/* Play Button */}
                <a
                  href={getRazedGameUrl(challenge.game)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2.5 bg-kick-purple text-white text-center font-semibold rounded-lg hover:bg-kick-purple-dark transition-colors"
                >
                  Play
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-kick-surface dark:to-kick-dark rounded-xl border border-gray-200 dark:border-kick-border p-6 text-center">
        <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
          Stack your rewards
        </h3>
        <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
          Completed challenges can stack with raffle entries for even more chances to win in our weekly $10,000 Super Saturday Raffles!
        </p>
        <a
          href="/raffles"
          className="inline-flex items-center gap-2 px-6 py-3 bg-kick-green text-white rounded-lg hover:bg-kick-green/90 transition-colors font-medium"
        >
          <span className="text-lg">🎟</span>
          View Raffles
        </a>
      </div>
    </div>
  )
}
