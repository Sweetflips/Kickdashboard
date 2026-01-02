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

// Challenge data - One challenge per slot, 1000x multiplier, $50 reward, one-time claimable
const CHALLENGES = [
  {
    id: '1',
    game: 'Big Bass Splash 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/big-bass-splash-1000.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 50,
  },
  {
    id: '2',
    game: 'Le Zeus',
    provider: 'HACKSAW',
    image: '/Challenges/le-zeus-new (1).avif',
    multiplier: 1000,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '3',
    game: 'Sugar Rush 1000',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/sugar-rush-1000.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 50,
  },
  {
    id: '4',
    game: 'Wanted Dead or Wild',
    provider: 'HACKSAW',
    image: '/Challenges/wanted-dead-or-a-wild.avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 50,
  },
  {
    id: '5',
    game: 'Donny & Danny',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/donny-and-danny.avif',
    multiplier: 1000,
    minBet: 0.10,
    reward: 50,
  },
  {
    id: '6',
    game: 'Fruit Party',
    provider: 'PRAGMATIC PLAY',
    image: '/Challenges/prag-vs20fruitswx (1).avif',
    multiplier: 1000,
    minBet: 0.20,
    reward: 50,
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
        <h2 className="text-2xl font-bold text-white mb-4">
          Connect your Kick account to view challenges
        </h2>
        <p className="text-kick-text-secondary mb-6">
          Connect your account to participate in Razed challenges and earn rewards.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/80 transition-colors font-semibold"
        >
          Connect Kick
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl font-bold text-white">
        {CHALLENGES.length} Challenges
      </h1>

      {/* Challenges Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {CHALLENGES.map((challenge) => (
          <div
            key={challenge.id}
            className="group flex flex-col rounded-xl overflow-hidden bg-[#1a1a2e] hover:ring-2 hover:ring-kick-purple/60 transition-all"
          >
            {/* Game Image */}
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
              <Image
                src={challenge.image}
                alt={challenge.game}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
              />

              {/* Provider Badge - centered at top */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                <span className="bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {challenge.provider}
                </span>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-between px-3 py-3 text-sm">
              {/* Multiplier */}
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-5 text-kick-green" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <span className="text-white font-bold">{challenge.multiplier.toLocaleString()}x</span>
              </div>

              {/* Min Bet */}
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-5 text-kick-text-secondary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white font-bold">${challenge.minBet.toFixed(2)}</span>
              </div>

              {/* Reward */}
              <div className="flex items-center gap-1.5">
                <svg className="w-5 h-5 text-kick-purple" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <span className="text-white font-bold">${challenge.reward}</span>
              </div>
            </div>

            {/* Play Button */}
            <div className="px-3 pb-3">
              <a
                href={getRazedGameUrl(challenge.game)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 bg-kick-purple text-white text-center text-sm font-bold rounded-lg hover:bg-kick-purple/80 transition-colors"
              >
                Play
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
