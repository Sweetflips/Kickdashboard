import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { memoryCache } from '@/lib/memory-cache'
import { getAuthenticatedUser } from '@/lib/auth'
import { validateApiKey } from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sweet-coins
 * Get user's sweet coins balance
 * 
 * Authentication: Requires API key (?api_key=) OR authenticated session
 * External tools: Use ?api_key=YOUR_API_SECRET_KEY
 * Internal dashboard: Uses session cookies automatically
 */
export async function GET(request: Request) {
    try {
        // Allow external tools with API key
        const hasValidApiKey = validateApiKey(request, 'sweet-coins')
        
        // Allow authenticated users (internal dashboard)
        const auth = await getAuthenticatedUser(request)
        
        if (!hasValidApiKey && !auth) {
            return NextResponse.json(
                { error: 'Authentication required. Use api_key parameter or login.' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)
        const kickUserId = searchParams.get('kick_user_id')

        if (!kickUserId) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        // Parse kick_user_id as BigInt
        let kickUserIdBigInt: bigint
        try {
            kickUserIdBigInt = BigInt(kickUserId)
        } catch (e) {
            return NextResponse.json(
                { error: 'Invalid kick_user_id format' },
                { status: 400 }
            )
        }

        // Cache key
        const cacheKey = `sweet_coins:${kickUserId}`
        const cacheTTL = 10000 // 10 seconds

        // Try cache first
        const cached = memoryCache.get<{
            kick_user_id: string
            total_sweet_coins: number
            is_subscriber: boolean
        }>(cacheKey)

        if (cached) {
            return NextResponse.json(cached, {
                headers: {
                    'Cache-Control': 'public, max-age=10, stale-while-revalidate=20',
                },
            })
        }

        // Fetch with caching
        const result = await memoryCache.getOrSet(
            cacheKey,
            async () => {
                // Get user with sweet_coins relation in a single query
                const user = await db.user.findUnique({
                    where: { kick_user_id: kickUserIdBigInt },
                    include: {
                        sweet_coins: {
                            select: {
                                total_sweet_coins: true,
                                is_subscriber: true,
                            },
                        },
                    },
                })

                if (!user) {
                    // User not found - return 0 sweet coins (they may not have chatted yet)
                    return {
                        kick_user_id: kickUserId,
                        total_sweet_coins: 0,
                        is_subscriber: false,
                    }
                }

                return {
                    kick_user_id: kickUserId,
                    total_sweet_coins: user.sweet_coins?.total_sweet_coins || 0,
                    is_subscriber: user.sweet_coins?.is_subscriber || false,
                }
            },
            cacheTTL
        )

        return NextResponse.json(result, {
            headers: {
                'Cache-Control': 'public, max-age=10, stale-while-revalidate=20',
            },
        })
    } catch (error) {
        console.error('Error fetching user sweet coins:', error)
        return NextResponse.json(
            { error: 'Failed to fetch user sweet coins', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
