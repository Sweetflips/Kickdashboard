import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        // Verify admin status using existing auth helper
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        // Get search/filter params
        const searchParams = request.nextUrl.searchParams
        const search = searchParams.get('search') || ''
        const itemFilter = searchParams.get('item') || ''
        const sortBy = searchParams.get('sort') || 'recent'

        // Fetch all purchases with user info
        const purchases = await db.adventPurchase.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        kick_user_id: true,
                        profile_picture_url: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        })

        // Group by user
        const userPurchases: Record<string, {
            userId: string
            kickUserId: string
            username: string
            profilePicture: string | null
            totalTickets: number
            totalPointsSpent: number
            purchases: {
                itemId: string
                tickets: number
                purchasedAt: string
            }[]
        }> = {}

        // Import advent items to get point costs
        const { ADVENT_ITEMS } = await import('@/lib/advent-calendar')

        for (const purchase of purchases) {
            const item = ADVENT_ITEMS.find(i => i.id === purchase.item_id)
            const pointsSpent = item ? item.pointsCost * purchase.tickets : 0

            const key = purchase.user.id.toString()

            if (!userPurchases[key]) {
                userPurchases[key] = {
                    userId: purchase.user.id.toString(),
                    kickUserId: purchase.user.kick_user_id.toString(),
                    username: purchase.user.username,
                    profilePicture: purchase.user.profile_picture_url,
                    totalTickets: 0,
                    totalPointsSpent: 0,
                    purchases: [],
                }
            }

            userPurchases[key].totalTickets += purchase.tickets
            userPurchases[key].totalPointsSpent += pointsSpent
            userPurchases[key].purchases.push({
                itemId: purchase.item_id,
                tickets: purchase.tickets,
                purchasedAt: purchase.created_at.toISOString(),
            })
        }

        let users = Object.values(userPurchases)

        // Apply search filter
        if (search) {
            const lowerSearch = search.toLowerCase()
            users = users.filter(u => u.username.toLowerCase().includes(lowerSearch))
        }

        // Apply item filter
        if (itemFilter) {
            users = users.filter(u => u.purchases.some(p => p.itemId === itemFilter))
        }

        // Sort
        switch (sortBy) {
            case 'tickets':
                users.sort((a, b) => b.totalTickets - a.totalTickets)
                break
            case 'points':
                users.sort((a, b) => b.totalPointsSpent - a.totalPointsSpent)
                break
            case 'username':
                users.sort((a, b) => a.username.localeCompare(b.username))
                break
            case 'recent':
            default:
                // Already sorted by recent from DB query
                break
        }

        // Calculate totals
        const totals = {
            totalUsers: users.length,
            totalTickets: users.reduce((sum, u) => sum + u.totalTickets, 0),
            totalPointsSpent: users.reduce((sum, u) => sum + u.totalPointsSpent, 0),
        }

        // Get unique items purchased for filter dropdown
        const uniqueItems = [...new Set(purchases.map(p => p.item_id))].sort()

        // Group by raffle/item for raffle view
        const rafflePurchases: Record<string, {
            itemId: string
            totalTickets: number
            totalPointsSpent: number
            players: {
                userId: string
                kickUserId: string
                username: string
                profilePicture: string | null
                tickets: number
                pointsSpent: number
                purchasedAt: string
            }[]
        }> = {}

        for (const purchase of purchases) {
            const item = ADVENT_ITEMS.find(i => i.id === purchase.item_id)
            const pointsSpent = item ? item.pointsCost * purchase.tickets : 0

            if (!rafflePurchases[purchase.item_id]) {
                rafflePurchases[purchase.item_id] = {
                    itemId: purchase.item_id,
                    totalTickets: 0,
                    totalPointsSpent: 0,
                    players: [],
                }
            }

            rafflePurchases[purchase.item_id].totalTickets += purchase.tickets
            rafflePurchases[purchase.item_id].totalPointsSpent += pointsSpent
            rafflePurchases[purchase.item_id].players.push({
                userId: purchase.user.id.toString(),
                kickUserId: purchase.user.kick_user_id.toString(),
                username: purchase.user.username,
                profilePicture: purchase.user.profile_picture_url,
                tickets: purchase.tickets,
                pointsSpent,
                purchasedAt: purchase.created_at.toISOString(),
            })
        }

        // Sort raffles by day number
        const raffles = Object.values(rafflePurchases).sort((a, b) => {
            const dayA = parseInt(a.itemId.match(/day-(\d+)/)?.[1] || '0')
            const dayB = parseInt(b.itemId.match(/day-(\d+)/)?.[1] || '0')
            return dayA - dayB
        })

        return NextResponse.json({
            users,
            totals,
            items: uniqueItems,
            raffles,
        })
    } catch (error) {
        console.error('Error fetching purchases:', error)
        return NextResponse.json(
            { error: 'Failed to fetch purchases', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
