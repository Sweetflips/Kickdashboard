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
const CHALLENGES = [
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">
          {CHALLENGES.length} Challenges
        </h1>
      </div>

      {/* Challenges Grid - 6 columns on xl, 4 on lg, 3 on md, 2 on sm, 1 on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {CHALLENGES.map((challenge) => (
          <div
            key={challenge.id}
            className="group bg-[#1a1a2e] rounded-xl overflow-hidden hover:ring-2 hover:ring-kick-purple/50 transition-all duration-200"
          >
            {/* Game Image with overlay */}
            <div className="relative aspect-square overflow-hidden">
              <Image
                src={challenge.image}
                alt={challenge.game}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
              />
              
              {/* Provider Badge */}
              <div className="absolute top-2 left-2 z-10">
                <span className="bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
                  {challenge.provider}
                </span>
              </div>

              {/* Game Title Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6">
                <h3 className="text-white text-xs font-bold leading-tight truncate">
                  {challenge.game}
                </h3>
              </div>
            </div>

            {/* Stats Row */}
            <div className="px-2 py-2 flex items-center justify-between gap-1 text-[10px]">
              {/* Multiplier */}
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                </svg>
                <span className="text-kick-green font-bold">{challenge.multiplier.toLocaleString()}x</span>
              </div>

              {/* Min Bet */}
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-kick-text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                </svg>
                <span className="text-kick-text-secondary font-medium">${challenge.minBet.toFixed(2)}</span>
              </div>

              {/* Reward */}
              <div className="flex items-center gap-0.5">
                <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
                </svg>
                <span className="text-yellow-500 font-bold">${challenge.reward}</span>
              </div>
            </div>

            {/* Play Button */}
            <div className="px-2 pb-2">
              <a
                href={getRazedGameUrl(challenge.game)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2 bg-kick-purple text-white text-center text-xs font-bold rounded-lg hover:bg-kick-purple/80 transition-colors"
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
