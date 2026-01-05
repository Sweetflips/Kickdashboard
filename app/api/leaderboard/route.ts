import { db } from '@/lib/db'
import { memoryCache } from '@/lib/memory-cache'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'
import { ensurePurchaseTransactionsTable } from '@/lib/purchases-ledger'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// Allow caching but revalidate frequently for fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 15 // Revalidate every 15 seconds

type SortBy = 'points' | 'messages' | 'streams' | 'emotes'
type DateRangeFilter = { gte: Date; lte: Date }

type VerificationMethods = { kick: boolean; discord: boolean; telegram: boolean }

export type LeaderboardEntry = {
    rank: number
    user_id: string
    kick_user_id: string
    username: string
    profile_picture_url: string | null
    total_points: number
    coins_balance: number
    coins_earned: number
    coins_spent: number
    total_emotes: number
    total_messages: number
    streams_watched: number
    achievements_unlocked?: number
    last_point_earned_at: string | null
    is_verified: boolean
    last_login_at: string | null
    verification_methods: VerificationMethods
}

type ViewerSummary = {
    rank: number | null
    total_points: number
    coins_balance: number
    coins_earned: number
    coins_spent: number
    total_emotes: number
    total_messages: number
    streams_watched: number
}

type CachedLeaderboard = { rows: LeaderboardEntry[] }

async function getClaimedAchievementCounts(userIds: bigint[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map()

    const rows = await db.sweetCoinHistory.groupBy({
        by: ['user_id'],
        where: {
            user_id: { in: userIds },
            message_id: { startsWith: 'achievement:' },
        },
        _count: { _all: true },
    })

    return new Map((rows as Array<{ user_id: bigint; _count: { _all: number } }>).map((r) => [r.user_id.toString(), r._count._all]))
}

function parseSortBy(value: string | null): SortBy {
    switch (value) {
        case 'messages':
        case 'streams':
        case 'emotes':
        case 'points':
            return value
        default:
            return 'points'
    }
}

function parseViewerKickUserId(value: string | null): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (!/^\d+$/.test(trimmed)) return null
    try {
        return BigInt(trimmed).toString()
    } catch {
        return null
    }
}

function normalizeQuery(value: string | null): string | null {
    if (!value) return null
    const q = value.trim()
    if (!q) return null
    // Keep it sane to avoid accidental huge queries / cache-bust loops
    return q.slice(0, 64)
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50))
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
        const sortBy = parseSortBy(searchParams.get('sortBy'))
        const q = normalizeQuery(searchParams.get('q'))
        const viewerKickUserIdStr = parseViewerKickUserId(searchParams.get('viewer_kick_user_id'))

        // Date filtering
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        const hasDateFilter = Boolean(startDate && endDate)

        let dateFilter: DateRangeFilter | null = null
        if (hasDateFilter) {
            const start = new Date(String(startDate) + 'T00:00:00.000Z')
            const end = new Date(String(endDate) + 'T23:59:59.999Z')
            dateFilter = { gte: start, lte: end }
        }

        // Cache key excludes viewer + pagination (so the heavy work is reused)
        const cacheKey = `leaderboard:v3:${sortBy}:${startDate || 'all'}:${endDate || 'all'}`
        const cacheTTL = hasDateFilter ? 30000 : 15000 // 30s for date-filtered, 15s for overall

        // Try cache first
        const cached = memoryCache.get<CachedLeaderboard>(cacheKey)

        if (cached) {
            const qLower = q ? q.toLowerCase() : null
            const qIsNumeric = q ? /^\d+$/.test(q) : false
            const filtered = qLower
                ? cached.rows.filter(r => {
                    const username = (r.username || '').toLowerCase()
                    if (username.includes(qLower)) return true
                    if (qIsNumeric && String(r.kick_user_id).includes(qLower)) return true
                    return false
                })
                : cached.rows
            const paged = filtered.slice(offset, offset + limit)
            const claimedCounts = await getClaimedAchievementCounts(
                paged.map((r) => BigInt(r.user_id))
            )
            const pagedWithAchievements = paged.map((r) => ({
                ...r,
                achievements_unlocked: claimedCounts.get(r.user_id) || 0,
            }))

            const viewerEntry = viewerKickUserIdStr
                ? cached.rows.find(r => r.kick_user_id === viewerKickUserIdStr) || null
                : null
            const viewer: ViewerSummary | null = viewerKickUserIdStr
                ? viewerEntry
                    ? {
                        rank: viewerEntry.rank,
                        total_points: viewerEntry.total_points,
                        coins_balance: viewerEntry.coins_balance,
                        coins_earned: viewerEntry.coins_earned,
                        coins_spent: viewerEntry.coins_spent,
                        total_emotes: viewerEntry.total_emotes,
                        total_messages: viewerEntry.total_messages,
                        streams_watched: viewerEntry.streams_watched,
                    }
                    : { rank: null, total_points: 0, coins_balance: 0, coins_earned: 0, coins_spent: 0, total_emotes: 0, total_messages: 0, streams_watched: 0 }
                : null

            return NextResponse.json({
                leaderboard: pagedWithAchievements,
                total: filtered.length,
                limit,
                offset,
                sortBy,
                viewer,
            }, {
                headers: {
                    'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
                },
            })
        }

        // Fetch data with caching wrapper
        const result = await memoryCache.getOrSet(
            cacheKey,
            async () => ({ rows: await buildLeaderboardRowsV2(sortBy, dateFilter) }),
            cacheTTL
        )

        const qLower = q ? q.toLowerCase() : null
        const qIsNumeric = q ? /^\d+$/.test(q) : false
        const filtered = qLower
            ? result.rows.filter(r => {
                const username = (r.username || '').toLowerCase()
                if (username.includes(qLower)) return true
                if (qIsNumeric && String(r.kick_user_id).includes(qLower)) return true
                return false
            })
            : result.rows
        const paged = filtered.slice(offset, offset + limit)
        const claimedCounts = await getClaimedAchievementCounts(
            paged.map((r) => BigInt(r.user_id))
        )
        const pagedWithAchievements = paged.map((r) => ({
            ...r,
            achievements_unlocked: claimedCounts.get(r.user_id) || 0,
        }))

        const viewerEntry = viewerKickUserIdStr
            ? result.rows.find(r => r.kick_user_id === viewerKickUserIdStr) || null
            : null
        const viewer: ViewerSummary | null = viewerKickUserIdStr
            ? viewerEntry
                ? {
                    rank: viewerEntry.rank,
                    total_points: viewerEntry.total_points,
                    coins_balance: viewerEntry.coins_balance,
                    coins_earned: viewerEntry.coins_earned,
                    coins_spent: viewerEntry.coins_spent,
                    total_emotes: viewerEntry.total_emotes,
                    total_messages: viewerEntry.total_messages,
                    streams_watched: viewerEntry.streams_watched,
                }
                : { rank: null, total_points: 0, coins_balance: 0, coins_earned: 0, coins_spent: 0, total_emotes: 0, total_messages: 0, streams_watched: 0 }
            : null

        return NextResponse.json({
            leaderboard: pagedWithAchievements,
            total: filtered.length,
            limit,
            offset,
            sortBy,
            viewer,
        }, {
            headers: {
                'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
            },
        })
    } catch (error) {
        console.error('Error fetching leaderboard:', error)
        return NextResponse.json(
            { error: 'Failed to fetch leaderboard', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

type UserSummaryV2 = {
    id: bigint
    kick_user_id: bigint
    username: string
    profile_picture_url: string | null
    custom_profile_picture_url: string | null
    last_login_at: Date | null
    discord_connected: boolean
    telegram_connected: boolean
}

type RowV2 = {
    user: UserSummaryV2
    total_points: number
    coins_balance: number
    coins_earned: number
    coins_spent: number
    total_emotes: number
    total_messages: number
    streams_watched: number
    last_point_earned_at: Date | null
}

function compareBigIntAsc(a: bigint, b: bigint): number {
    if (a < b) return -1
    if (a > b) return 1
    return 0
}

function getSortKeyGettersV2(sortBy: SortBy): Array<(r: RowV2) => number> {
    switch (sortBy) {
        case 'messages':
            return [r => r.total_messages, r => r.total_points, r => r.total_emotes, r => r.streams_watched]
        case 'streams':
            return [r => r.streams_watched, r => r.total_points, r => r.total_messages, r => r.total_emotes]
        case 'emotes':
            return [r => r.total_emotes, r => r.total_points, r => r.total_messages, r => r.streams_watched]
        case 'points':
        default:
            return [r => r.total_points, r => r.total_messages, r => r.total_emotes, r => r.streams_watched]
    }
}

function makeRowComparatorV2(sortBy: SortBy) {
    const getters = getSortKeyGettersV2(sortBy)
    return (a: RowV2, b: RowV2) => {
        for (const getter of getters) {
            const diff = getter(b) - getter(a)
            if (diff !== 0) return diff
        }
        // Stable tiebreaker (no last-login sorting)
        return compareBigIntAsc(a.user.id, b.user.id)
    }
}

/**
 * Retry helper for Prisma queries that may hit transient errors
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    operation: string = 'database operation'
): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn()
        } catch (error: any) {
            const isRetryableError =
                error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === 'P2024' || error.code === 'P2034' || error.code === 'P4001' || error.code === 'P2028') ||
                (error instanceof Error && (
                    error.message.includes('could not serialize access') ||
                    error.message.includes('concurrent update') ||
                    error.message.includes('connection pool') ||
                    error.message.includes('timeout')
                ))

            if (isRetryableError && attempt < maxRetries - 1) {
                const delay = Math.min(100 * Math.pow(2, attempt), 1000) // Exponential backoff: 100ms, 200ms, 400ms max
                const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined
                console.warn(`[${operation}] Retryable error (attempt ${attempt + 1}/${maxRetries}), retrying after ${delay}ms...`, code || error.message)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
            }
            throw error
        }
    }
    throw new Error(`Max retries exceeded for ${operation}`)
}

function formatEntryV2(row: RowV2, rank: number): LeaderboardEntry {
    const user = row.user
    const hasKickLogin = !!user.last_login_at
    const hasDiscord = user.discord_connected || false
    const hasTelegram = user.telegram_connected || false

    return {
        rank,
        user_id: user.id.toString(),
        kick_user_id: user.kick_user_id.toString(),
        username: user.username,
        profile_picture_url: rewriteApiMediaUrlToCdn(user.custom_profile_picture_url || user.profile_picture_url),
        total_points: row.total_points,
        coins_balance: row.coins_balance,
        coins_earned: row.coins_earned,
        coins_spent: row.coins_spent,
        total_emotes: row.total_emotes,
        total_messages: row.total_messages,
        streams_watched: row.streams_watched,
        last_point_earned_at: row.last_point_earned_at?.toISOString() || null,
        is_verified: hasKickLogin || hasDiscord || hasTelegram,
        last_login_at: user.last_login_at?.toISOString() || null,
        verification_methods: {
            kick: hasKickLogin,
            discord: hasDiscord,
            telegram: hasTelegram,
        },
    }
}

async function safeEnsurePurchaseTransactionsTable(): Promise<void> {
    try {
        await ensurePurchaseTransactionsTable(db as any)
    } catch {
        // If DB user can't create tables, we'll just treat spend as 0.
    }
}

async function buildLeaderboardRowsV2(sortBy: SortBy, dateFilter: DateRangeFilter | null): Promise<LeaderboardEntry[]> {
    const rows = dateFilter
        ? await buildDateFilteredRowsV2(dateFilter)
        : await buildOverallRowsV2()

    rows.sort(makeRowComparatorV2(sortBy))
    return rows.map((row, idx) => formatEntryV2(row, idx + 1))
}

async function buildOverallRowsV2(): Promise<RowV2[]> {
    // Fetch users with sweet coins first
    const userPoints = await withRetry(
        () => db.userSweetCoins.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        kick_user_id: true,
                        username: true,
                        profile_picture_url: true,
                        custom_profile_picture_url: true,
                        last_login_at: true,
                        discord_connected: true,
                        telegram_connected: true,
                    },
                },
            },
        }),
        3,
        'buildOverallRowsV2: fetch userSweetCoins'
    )

    if (userPoints.length === 0) return []

    const userIds = userPoints.map(up => up.user_id)

    // Earned/Spent totals
    const [earnedAgg, spentAgg] = await Promise.all([
        withRetry(
            () => db.sweetCoinHistory.groupBy({
                by: ['user_id'],
                where: { user_id: { in: userIds } },
                _sum: { sweet_coins_earned: true },
            }),
            3,
            'buildOverallRowsV2: earnedAgg groupBy'
        ),
        (async () => {
            await safeEnsurePurchaseTransactionsTable()
            try {
                return await withRetry(
                    () => db.purchaseTransaction.groupBy({
                        by: ['user_id'],
                        where: { user_id: { in: userIds } },
                        _sum: { sweet_coins_spent: true },
                    }),
                    3,
                    'buildOverallRowsV2: spentAgg groupBy'
                )
            } catch {
                return []
            }
        })(),
    ])

    const earnedMap = new Map<bigint, number>()
    for (const r of earnedAgg as Array<{ user_id: bigint; _sum: { sweet_coins_earned: number | null } }>) {
        earnedMap.set(r.user_id, r._sum.sweet_coins_earned || 0)
    }

    const spentMap = new Map<bigint, number>()
    for (const r of spentAgg as any[]) {
        // Prisma returns bigint user_id in PG; keep defensive.
        const uid = (r as any).user_id as bigint
        const sum = (r as any)._sum?.sweet_coins_spent as number | null | undefined
        spentMap.set(uid, sum || 0)
    }

    // Derive kick_user_ids to scope queries (keep as BigInt for Prisma compatibility)
    const kickUserIds = userPoints.map(up => {
        const kickId = (up.user as any).kick_user_id
        return typeof kickId === 'bigint' ? kickId : BigInt(kickId)
    }).filter(Boolean)

    if (kickUserIds.length === 0) {
        // No valid kick_user_ids, return rows with zero stats
        return userPoints.map((up) => {
            const user = up.user as unknown as UserSummaryV2
            return {
                user,
                total_points: up.total_sweet_coins,
                coins_balance: up.total_sweet_coins,
                coins_earned: earnedMap.get(user.id) || 0,
                coins_spent: spentMap.get(user.id) || 0,
                total_emotes: up.total_emotes,
                total_messages: 0,
                streams_watched: 0,
                last_point_earned_at: up.last_sweet_coin_earned_at || null,
            }
        })
    }

    // Scope groupBy queries to these specific users
    const [messageCounts, streamPairs] = await Promise.all([
        withRetry(
            () => db.chatMessage.groupBy({
                by: ['sender_user_id'],
                where: {
                    sent_when_offline: false,
                    sender_user_id: { in: kickUserIds },
                },
                _count: { id: true },
            }),
            3,
            'buildOverallRowsV2: messageCounts groupBy'
        ),
        withRetry(
            () => db.chatMessage.groupBy({
                by: ['sender_user_id', 'stream_session_id'],
                where: {
                    sent_when_offline: false,
                    stream_session_id: { not: null },
                    sender_user_id: { in: kickUserIds },
                },
            }),
            3,
            'buildOverallRowsV2: streamPairs groupBy'
        ),
    ])

    const messagesMap = new Map<bigint, number>()
    (messageCounts as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((row) => {
        messagesMap.set(row.sender_user_id, Number(row._count.id))
    })

    const streamsMap = new Map<bigint, number>()
    (streamPairs as Array<{ sender_user_id: bigint; stream_session_id: bigint | null }>).forEach((row) => {
        streamsMap.set(row.sender_user_id, (streamsMap.get(row.sender_user_id) || 0) + 1)
    })

    return userPoints.map((up) => {
        const user = up.user as unknown as UserSummaryV2
        return {
            user,
            total_points: up.total_sweet_coins,
            coins_balance: up.total_sweet_coins,
            coins_earned: earnedMap.get(user.id) || 0,
            coins_spent: spentMap.get(user.id) || 0,
            total_emotes: up.total_emotes,
            total_messages: messagesMap.get(user.kick_user_id) || 0,
            streams_watched: streamsMap.get(user.kick_user_id) || 0,
            last_point_earned_at: up.last_sweet_coin_earned_at || null,
        }
    })
}

async function buildDateFilteredRowsV2(dateFilter: DateRangeFilter): Promise<RowV2[]> {
    const pointAgg = await withRetry(
        () => db.sweetCoinHistory.groupBy({
            by: ['user_id'],
            where: { earned_at: dateFilter },
            _sum: { sweet_coins_earned: true },
            _max: { earned_at: true },
        }),
        3,
        'buildDateFilteredRowsV2: sweetCoinHistory groupBy'
    )

    if (pointAgg.length === 0) return []

    const userIds = pointAgg.map(a => a.user_id)

    // Fetch users first
    const users = await withRetry(
        () => db.user.findMany({
            where: { id: { in: userIds } },
            select: {
                id: true,
                kick_user_id: true,
                username: true,
                profile_picture_url: true,
                custom_profile_picture_url: true,
                last_login_at: true,
                discord_connected: true,
                telegram_connected: true,
            },
        }),
        3,
        'buildDateFilteredRowsV2: fetch users'
    )

    const userById = new Map<bigint, UserSummaryV2>()
    users.forEach((u) => userById.set(u.id, u as unknown as UserSummaryV2))

    // Fetch balances
    const balances = await withRetry(
        () => db.userSweetCoins.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, total_sweet_coins: true },
        }),
        3,
        'buildDateFilteredRowsV2: balances findMany'
    ).catch(() => [] as Array<{ user_id: bigint; total_sweet_coins: number }>)
    const balanceByUserId = new Map<bigint, number>(balances.map(b => [b.user_id, b.total_sweet_coins]))

    // Spent in range
    await safeEnsurePurchaseTransactionsTable()
    let spentAgg: any[] = []
    try {
        spentAgg = await withRetry(
            () => db.purchaseTransaction.groupBy({
                by: ['user_id'],
                where: { user_id: { in: userIds }, created_at: dateFilter },
                _sum: { sweet_coins_spent: true },
            }),
            3,
            'buildDateFilteredRowsV2: spentAgg groupBy'
        ) as any
    } catch {
        spentAgg = []
    }
    const spentByUserId = new Map<bigint, number>()
    for (const r of spentAgg) spentByUserId.set(r.user_id as bigint, r._sum?.sweet_coins_spent || 0)

    // Derive kick_user_ids to scope queries (keep as BigInt for Prisma compatibility)
    const kickUserIds = users.map(u => {
        const kickId = u.kick_user_id
        return typeof kickId === 'bigint' ? kickId : BigInt(kickId)
    }).filter(Boolean)

    // Use Promise.allSettled so non-critical stats can fall back to 0
    const [messageResult, streamResult, emoteResult] = await Promise.allSettled([
        kickUserIds.length > 0
            ? withRetry(
                () => db.chatMessage.groupBy({
                    by: ['sender_user_id'],
                    where: {
                        created_at: dateFilter,
                        sent_when_offline: false,
                        sender_user_id: { in: kickUserIds },
                    },
                    _count: { id: true },
                }),
                3,
                'buildDateFilteredRowsV2: messageCounts groupBy'
            )
            : Promise.resolve([]),
        kickUserIds.length > 0
            ? withRetry(
                () => db.chatMessage.groupBy({
                    by: ['sender_user_id', 'stream_session_id'],
                    where: {
                        created_at: dateFilter,
                        sent_when_offline: false,
                        stream_session_id: { not: null },
                        sender_user_id: { in: kickUserIds },
                    },
                }),
                3,
                'buildDateFilteredRowsV2: streamPairs groupBy'
            )
            : Promise.resolve([]),
        kickUserIds.length > 0
            ? withRetry(
                () => db.chatMessage.groupBy({
                    by: ['sender_user_id'],
                    where: {
                        created_at: dateFilter,
                        sent_when_offline: false,
                        has_emotes: true,
                        sender_user_id: { in: kickUserIds },
                    },
                    _count: { id: true },
                }),
                3,
                'buildDateFilteredRowsV2: emoteCounts groupBy'
            )
            : Promise.resolve([]),
    ])

    const messagesMap = new Map<bigint, number>()
    if (messageResult.status === 'fulfilled') {
        (messageResult.value as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((row) => {
            messagesMap.set(row.sender_user_id, Number(row._count.id))
        })
    } else {
        console.warn('[buildDateFilteredRowsV2] Failed to fetch message counts, using defaults:', messageResult.reason)
    }

    const streamsMap = new Map<bigint, number>()
    if (streamResult.status === 'fulfilled') {
        (streamResult.value as Array<{ sender_user_id: bigint; stream_session_id: bigint | null }>).forEach((row) => {
            streamsMap.set(row.sender_user_id, (streamsMap.get(row.sender_user_id) || 0) + 1)
        })
    } else {
        console.warn('[buildDateFilteredRowsV2] Failed to fetch stream pairs, using defaults:', streamResult.reason)
    }

    const emotesMap = new Map<bigint, number>()
    if (emoteResult.status === 'fulfilled') {
        (emoteResult.value as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((row) => {
            emotesMap.set(row.sender_user_id, Number(row._count.id))
        })
    } else {
        console.warn('[buildDateFilteredRowsV2] Failed to fetch emote counts, using defaults:', emoteResult.reason)
    }

    return pointAgg
        .map((agg) => {
            const user = userById.get(agg.user_id)
            if (!user) return null

            const kickId = user.kick_user_id
            return {
                user,
                total_points: agg._sum.sweet_coins_earned || 0,
                coins_balance: balanceByUserId.get(user.id) || 0,
                coins_earned: agg._sum.sweet_coins_earned || 0,
                coins_spent: spentByUserId.get(user.id) || 0,
                total_emotes: emotesMap.get(kickId) || 0,
                total_messages: messagesMap.get(kickId) || 0,
                streams_watched: streamsMap.get(kickId) || 0,
                last_point_earned_at: agg._max.earned_at || null,
            }
        })
        .filter(Boolean) as RowV2[]
}

/**
 * Fetch overall leaderboard (no date filter) - use UserPoints table
 */
async function fetchOverallLeaderboard(limit: number, offset: number) {
    // Get total count
    const total = await db.userSweetCoins.count()

    // Get paginated users ordered by total_points DESC
    // Join with User table to get user details
    const userPoints = await db.userSweetCoins.findMany({
        orderBy: {
            total_sweet_coins: 'desc',
        },
        skip: offset,
        take: limit,
        include: {
            user: {
                select: {
                    id: true,
                    kick_user_id: true,
                    username: true,
                    profile_picture_url: true,
                    custom_profile_picture_url: true,
                    last_login_at: true,
                    discord_connected: true,
                    telegram_connected: true,
                },
            },
        },
    })

    // Get kick_user_ids for batch message/stream queries
    const kickUserIds = userPoints.map(up => Number(up.user.kick_user_id))
    const userIds = userPoints.map(up => Number(up.user_id))

    // Batch fetch message counts and streams watched
    const [messageCounts, streamsWatched] = await Promise.all([
        db.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                sent_when_offline: false,
            },
            _count: {
                id: true,
            },
        }),
        db.chatMessage.groupBy({
            by: ['sender_user_id', 'stream_session_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                stream_session_id: { not: null },
                sent_when_offline: false,
            },
        }),
    ])

    // Build maps
    const messagesMap = new Map<number, number>()
    (messageCounts as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((count) => {
        messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
    })

    const streamsMap = new Map<number, number>()
    const streamsByUser = new Map<number, Set<number>>()
    (streamsWatched as Array<{ sender_user_id: bigint; stream_session_id: bigint | null }>).forEach((stream) => {
        const kickUserId = Number(stream.sender_user_id)
        const sessionId = stream.stream_session_id ? Number(stream.stream_session_id) : null
        if (sessionId) {
            if (!streamsByUser.has(kickUserId)) {
                streamsByUser.set(kickUserId, new Set())
            }
            streamsByUser.get(kickUserId)!.add(sessionId)
        }
    })
    streamsByUser.forEach((sessionSet, kickUserId) => {
        streamsMap.set(kickUserId, sessionSet.size)
    })

    // Build leaderboard entries
    const leaderboard = userPoints.map((up, index) => {
        const user = up.user
        const kickUserId = Number(user.kick_user_id)
        const userId = Number(user.id)

        const hasKickLogin = !!user.last_login_at
        const hasDiscord = user.discord_connected || false
        const hasTelegram = user.telegram_connected || false

        return {
            rank: offset + index + 1,
            user_id: userId.toString(),
            kick_user_id: kickUserId.toString(),
            username: user.username,
            profile_picture_url: rewriteApiMediaUrlToCdn(user.custom_profile_picture_url || user.profile_picture_url),
            total_points: up.total_sweet_coins,
            total_emotes: up.total_emotes,
            total_messages: messagesMap.get(kickUserId) || 0,
            streams_watched: streamsMap.get(kickUserId) || 0,
            last_point_earned_at: up.last_sweet_coin_earned_at?.toISOString() || null,
            is_verified: hasKickLogin || hasDiscord || hasTelegram,
            last_login_at: user.last_login_at?.toISOString() || null,
            verification_methods: {
                kick: hasKickLogin,
                discord: hasDiscord,
                telegram: hasTelegram,
            },
        }
    })

    return { leaderboard, total }
}

/**
 * Fetch date-filtered leaderboard - aggregate from pointHistory
 */
async function fetchDateFilteredLeaderboard(
    limit: number,
    offset: number,
    dateFilter: { gte: Date; lte: Date }
) {
    // Get total users who earned points in this period
    const totalAggregates = await db.sweetCoinHistory.groupBy({
        by: ['user_id'],
        where: {
            earned_at: dateFilter,
        },
    })
    const total = totalAggregates.length

    // Get top users by points earned in this period (paginated)
    // Note: Prisma groupBy doesn't support orderBy on aggregated fields directly
    // So we need to fetch more and sort in memory, or use raw SQL
    // For now, fetch all aggregates, sort, then paginate
    const pointAggregates = await db.sweetCoinHistory.groupBy({
        by: ['user_id'],
        where: {
            earned_at: dateFilter,
        },
        _sum: {
            sweet_coins_earned: true,
        },
        _max: {
            earned_at: true,
        },
    })

    // Sort by points descending
    pointAggregates.sort((a, b) => {
        const aPoints = a._sum.sweet_coins_earned || 0
        const bPoints = b._sum.sweet_coins_earned || 0
        return bPoints - aPoints
    })

    // Paginate
    const paginatedAggregates = pointAggregates.slice(offset, offset + limit)
    const userIds = paginatedAggregates.map(agg => Number(agg.user_id))

    // Get user details
    const users = await db.user.findMany({
        where: {
            id: { in: userIds },
        },
        select: {
            id: true,
            kick_user_id: true,
            username: true,
            profile_picture_url: true,
            custom_profile_picture_url: true,
            last_login_at: true,
            discord_connected: true,
            telegram_connected: true,
        },
    })

    const userMap = new Map(users.map(u => [Number(u.id), u]))
    const kickUserIds = users.map(u => Number(u.kick_user_id))

    // Batch fetch stats for these users
    const [messageCounts, streamsWatched, emotesQuery] = await Promise.all([
        db.chatMessage.groupBy({
            by: ['sender_user_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                sent_when_offline: false,
            },
            _count: {
                id: true,
            },
        }),
        db.chatMessage.groupBy({
            by: ['sender_user_id', 'stream_session_id'],
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                stream_session_id: { not: null },
                sent_when_offline: false,
            },
        }),
        db.chatMessage.findMany({
            where: {
                sender_user_id: { in: kickUserIds },
                created_at: dateFilter,
                sent_when_offline: false,
            },
            select: {
                sender_user_id: true,
                emotes: true,
            },
        }),
    ])

    // Build maps
    const pointsMap = new Map<number, number>()
    const lastPointEarnedMap = new Map<number, Date | null>()
    paginatedAggregates.forEach((agg) => {
        const userId = Number(agg.user_id)
        pointsMap.set(userId, agg._sum.sweet_coins_earned || 0)
        lastPointEarnedMap.set(userId, agg._max.earned_at || null)
    })

    const messagesMap = new Map<number, number>()
    (messageCounts as Array<{ sender_user_id: bigint; _count: { id: number } }>).forEach((count) => {
        messagesMap.set(Number(count.sender_user_id), Number(count._count.id))
    })

    const emotesMap = new Map<number, number>()
    emotesQuery.forEach((msg) => {
        const kickUserId = Number(msg.sender_user_id)
        const emotes = msg.emotes
        if (emotes && Array.isArray(emotes) && emotes.length > 0) {
            emotesMap.set(kickUserId, (emotesMap.get(kickUserId) || 0) + 1)
        }
    })

    const streamsMap = new Map<number, number>()
    const streamsByUser = new Map<number, Set<number>>()
    (streamsWatched as Array<{ sender_user_id: bigint; stream_session_id: bigint | null }>).forEach((stream) => {
        const kickUserId = Number(stream.sender_user_id)
        const sessionId = stream.stream_session_id ? Number(stream.stream_session_id) : null
        if (sessionId) {
            if (!streamsByUser.has(kickUserId)) {
                streamsByUser.set(kickUserId, new Set())
            }
            streamsByUser.get(kickUserId)!.add(sessionId)
        }
    })
    streamsByUser.forEach((sessionSet, kickUserId) => {
        streamsMap.set(kickUserId, sessionSet.size)
    })

    // Build leaderboard entries maintaining sort order
    const leaderboard = paginatedAggregates.map((agg, index) => {
        const userId = Number(agg.user_id)
        const user = userMap.get(userId)
        if (!user) {
            // User not found, skip
            return null
        }

        const kickUserId = Number(user.kick_user_id)
        const hasKickLogin = !!user.last_login_at
        const hasDiscord = user.discord_connected || false
        const hasTelegram = user.telegram_connected || false

        return {
            rank: offset + index + 1,
            user_id: userId.toString(),
            kick_user_id: kickUserId.toString(),
            username: user.username,
            profile_picture_url: rewriteApiMediaUrlToCdn(user.custom_profile_picture_url || user.profile_picture_url),
            total_points: pointsMap.get(userId) || 0,
            total_emotes: emotesMap.get(kickUserId) || 0,
            total_messages: messagesMap.get(kickUserId) || 0,
            streams_watched: streamsMap.get(kickUserId) || 0,
            last_point_earned_at: lastPointEarnedMap.get(userId)?.toISOString() || null,
            is_verified: hasKickLogin || hasDiscord || hasTelegram,
            last_login_at: user.last_login_at?.toISOString() || null,
            verification_methods: {
                kick: hasKickLogin,
                discord: hasDiscord,
                telegram: hasTelegram,
            },
        }
    }).filter(Boolean) as LeaderboardEntry[]

    return { leaderboard, total }
}
