import { db } from '@/lib/db'

export interface WeightedEntry {
  entryId: bigint
  userId: bigint
  points: number
}

export interface WeightedSegment {
  segmentId: bigint
  weight: number
  label: string
}

/**
 * Calculate probability weights for entries based on points
 * Higher points = higher probability
 */
export function calculateEntryWeights(entries: WeightedEntry[]): Map<bigint, number> {
  const weights = new Map<bigint, number>()

  if (entries.length === 0) {
    return weights
  }

  // Calculate total points
  const totalPoints = entries.reduce((sum, entry) => sum + entry.points, 0)

  if (totalPoints === 0) {
    // If no points, give equal weight to all entries
    const equalWeight = 1 / entries.length
    entries.forEach(entry => weights.set(entry.entryId, equalWeight))
    return weights
  }

  // Calculate weight as percentage of total points
  entries.forEach(entry => {
    const weight = entry.points / totalPoints
    weights.set(entry.entryId, weight)
  })

  return weights
}

/**
 * Select a winner using weighted random selection based on points
 * Returns the entry ID of the winner
 */
export function selectWeightedWinner(entries: WeightedEntry[]): bigint | null {
  if (entries.length === 0) {
    return null
  }

  if (entries.length === 1) {
    return entries[0].entryId
  }

  // Calculate weights
  const weights = calculateEntryWeights(entries)

  // Create cumulative probability array
  const cumulative: Array<{ entryId: bigint; cumulative: number }> = []
  let cumulativeSum = 0

  entries.forEach(entry => {
    const weight = weights.get(entry.entryId) || 0
    cumulativeSum += weight
    cumulative.push({
      entryId: entry.entryId,
      cumulative: cumulativeSum
    })
  })

  // Normalize cumulative to 1.0 (in case of floating point errors)
  const normalized = cumulative.map(item => ({
    ...item,
    cumulative: item.cumulative / cumulativeSum
  }))

  // Generate random number between 0 and 1
  const random = Math.random()

  // Find winner based on cumulative probability
  for (const item of normalized) {
    if (random <= item.cumulative) {
      return item.entryId
    }
  }

  // Fallback to last entry (shouldn't happen, but safety)
  return entries[entries.length - 1].entryId
}

/**
 * Select a segment based on segment weights
 * Returns the segment ID
 */
export function selectSegment(segments: WeightedSegment[]): bigint | null {
  if (segments.length === 0) {
    return null
  }

  if (segments.length === 1) {
    return segments[0].segmentId
  }

  // Calculate total weight
  const totalWeight = segments.reduce((sum, seg) => sum + seg.weight, 0)

  if (totalWeight === 0) {
    // Equal probability if all weights are 0
    const randomIndex = Math.floor(Math.random() * segments.length)
    return segments[randomIndex].segmentId
  }

  // Create cumulative probability array
  const cumulative: Array<{ segmentId: bigint; cumulative: number }> = []
  let cumulativeSum = 0

  segments.forEach(segment => {
    cumulativeSum += segment.weight / totalWeight
    cumulative.push({
      segmentId: segment.segmentId,
      cumulative: cumulativeSum
    })
  })

  // Normalize to 1.0
  const normalized = cumulative.map(item => ({
    ...item,
    cumulative: item.cumulative / cumulativeSum
  }))

  // Generate random number
  const random = Math.random()

  // Find selected segment
  for (const item of normalized) {
    if (random <= item.cumulative) {
      return item.segmentId
    }
  }

  // Fallback to last segment
  return segments[segments.length - 1].segmentId
}

/**
 * Get all eligible users for a giveaway based on stream session points
 */
export async function getEligibleUsers(
  broadcasterUserId: bigint,
  minPoints: number,
  streamSessionId?: bigint | null
): Promise<Array<{ userId: bigint; kickUserId: bigint; points: number }>> {
  if (streamSessionId) {
    // Get users who participated in this specific stream session
    // Calculate points earned in this session
    const pointHistory = await db.pointHistory.findMany({
      where: {
        stream_session_id: streamSessionId,
      },
      include: {
        user: {
          select: {
            id: true,
            kick_user_id: true,
          },
        },
      },
    })

    // Aggregate points per user for this session
    const userPointsMap = new Map<bigint, { userId: bigint; kickUserId: bigint; points: number }>()

    for (const ph of pointHistory) {
      // Skip if user doesn't exist (shouldn't happen, but safety check)
      if (!ph.user) {
        console.warn(`⚠️ PointHistory entry ${ph.id} references non-existent user ${ph.user_id}`)
        continue
      }

      // Use ph.user_id as the key (should match ph.user.id)
      // ph.user_id is the foreign key and should be the same as ph.user.id
      const userId = ph.user_id
      const existing = userPointsMap.get(userId)
      if (existing) {
        existing.points += ph.points_earned
      } else {
        userPointsMap.set(userId, {
          userId: userId, // Use ph.user_id directly (should match ph.user.id)
          kickUserId: ph.user.kick_user_id,
          points: ph.points_earned,
        })
      }
    }

    // Filter by minimum points
    return Array.from(userPointsMap.values()).filter(u => u.points >= minPoints)
  } else {
    // Fallback to total points (for backwards compatibility)
    const eligibleUsers = await db.userPoints.findMany({
      where: {
        total_points: {
          gte: minPoints
        }
      },
      include: {
        user: {
          select: {
            id: true,
            kick_user_id: true
          }
        }
      }
    })

    return eligibleUsers.map(up => ({
      userId: up.user.id,
      kickUserId: up.user.kick_user_id,
      points: up.total_points
    }))
  }
}

/**
 * Check if user has minimum points required for giveaway (from stream session)
 */
export async function isUserEligible(
  kickUserId: bigint,
  minPoints: number,
  streamSessionId?: bigint | null
): Promise<boolean> {
  if (streamSessionId) {
    // Check points from this specific stream session
    const sessionPoints = await db.pointHistory.aggregate({
      where: {
        stream_session_id: streamSessionId,
        user: {
          kick_user_id: kickUserId,
        },
      },
      _sum: {
        points_earned: true,
      },
    })

    const totalPoints = sessionPoints._sum.points_earned || 0
    return totalPoints >= minPoints
  } else {
    // Fallback to total points
    const userPoints = await db.userPoints.findFirst({
      where: {
        user: {
          kick_user_id: kickUserId
        },
        total_points: {
          gte: minPoints
        }
      }
    })

    return !!userPoints
  }
}

/**
 * Get active giveaway for a broadcaster (optionally for a specific stream session)
 */
export async function getActiveGiveaway(broadcasterUserId: bigint, streamSessionId?: bigint | null) {
  const where: any = {
    broadcaster_user_id: broadcasterUserId,
    status: 'active'
  }

  if (streamSessionId) {
    where.stream_session_id = streamSessionId
  }

  return await db.giveaway.findFirst({
    where,
    include: {
      segments: {
        orderBy: {
          order_index: 'asc'
        }
      },
      entries: {
        include: {
          user: {
            select: {
              username: true,
              kick_user_id: true,
              profile_picture_url: true
            }
          }
        }
      }
    }
  })
}
