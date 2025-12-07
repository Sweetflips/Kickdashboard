export interface AdventItem {
  id: string
  day: number
  pointsCost: number
  image: string
  maxTickets: number
}

export const ADVENT_ITEMS: AdventItem[] = [
  { id: 'day-1', day: 1, pointsCost: 20, image: '/advent/Day 1.png', maxTickets: 25 },
  { id: 'day-2', day: 2, pointsCost: 20, image: '/advent/Day 2.png', maxTickets: 25 },
  { id: 'day-3', day: 3, pointsCost: 20, image: '/advent/Day 3.png', maxTickets: 25 },
  { id: 'day-4', day: 4, pointsCost: 20, image: '/advent/Day 4.png', maxTickets: 25 },
  { id: 'day-5', day: 5, pointsCost: 20, image: '/advent/Day 5.png', maxTickets: 25 },
  { id: 'day-6', day: 6, pointsCost: 20, image: '/advent/Day 6.png', maxTickets: 25 },
  { id: 'day-7', day: 7, pointsCost: 20, image: '/advent/Day 7.png', maxTickets: 25 },
  { id: 'day-8', day: 8, pointsCost: 20, image: '/advent/Day 8.png', maxTickets: 25 },
  { id: 'day-9', day: 9, pointsCost: 20, image: '/advent/Day 9.png', maxTickets: 25 },
  { id: 'day-10', day: 10, pointsCost: 100, image: '/advent/Day 10.png', maxTickets: 25 },
  { id: 'day-11', day: 11, pointsCost: 100, image: '/advent/Day 11.png', maxTickets: 25 },
  { id: 'day-12', day: 12, pointsCost: 100, image: '/advent/Day 12.png', maxTickets: 25 },
  { id: 'day-13', day: 13, pointsCost: 100, image: '/advent/Day 13.png', maxTickets: 25 },
  { id: 'day-14', day: 14, pointsCost: 100, image: '/advent/Day 14.png', maxTickets: 25 },
  { id: 'day-15', day: 15, pointsCost: 100, image: '/advent/Day 15.png', maxTickets: 25 },
  { id: 'day-16', day: 16, pointsCost: 100, image: '/advent/Day 16.png', maxTickets: 25 },
  { id: 'day-17', day: 17, pointsCost: 100, image: '/advent/Day 17.png', maxTickets: 25 },
  { id: 'day-18', day: 18, pointsCost: 100, image: '/advent/Day 18.png', maxTickets: 25 },
  { id: 'day-19', day: 19, pointsCost: 100, image: '/advent/Day 19.png', maxTickets: 25 },
  { id: 'day-20', day: 20, pointsCost: 100, image: '/advent/Day 20.png', maxTickets: 25 },
  { id: 'day-21', day: 21, pointsCost: 100, image: '/advent/Day 21.png', maxTickets: 25 },
  { id: 'day-22', day: 22, pointsCost: 100, image: '/advent/Day 22.png', maxTickets: 25 },
  { id: 'day-23a', day: 23, pointsCost: 20, image: '/advent/Day 23.png', maxTickets: 25 },
  { id: 'day-23b', day: 23, pointsCost: 500, image: '/advent/Day 23.png', maxTickets: 25 },
  { id: 'day-24', day: 24, pointsCost: 1400, image: '/advent/Day 24.png', maxTickets: 25 },
  { id: 'day-25a', day: 25, pointsCost: 500, image: '/advent/Day 25.png', maxTickets: 25 },
  { id: 'day-25b', day: 25, pointsCost: 1000, image: '/advent/Day 25.png', maxTickets: 25 },
  { id: 'day-31a', day: 31, pointsCost: 1000, image: '/advent/Day 31.png', maxTickets: 25 },
  { id: 'day-31b', day: 31, pointsCost: 1000, image: '/advent/Day 31-2.png', maxTickets: 25 },
]

/**
 * Helper to get current UTC date components
 */
function getCurrentUtcDate() {
  const now = new Date()
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1, // 1-12
    day: now.getUTCDate(),
  }
}

/**
 * Helper: day when card should unlock for purchases (UTC)
 * - For day 1: unlocks on Dec 1
 * - For day N>1: unlocks on Dec (N-1), so you can buy one day before the raffle
 */
function getUnlockDayForCalendarDay(day: number): number {
  return Math.max(1, day - 1)
}

/**
 * Check if an advent day is unlocked based on current UTC date
 * - For each calendar day D, tickets are purchasable on unlockDay(D)
 *   (one day before the raffle, except Day 1 which unlocks on itself)
 */
export function isDayUnlocked(day: number): boolean {
  const { year, month, day: currentDay } = getCurrentUtcDate()

  if (year === 2025 && month === 12) {
    const unlockDay = getUnlockDayForCalendarDay(day)
    return currentDay === unlockDay
  }

  return false
}

/**
 * Check if a day is in the past (raffle day or later in UTC)
 * - Once we reach calendar day D in December, that day is considered past/closed
 */
export function isDayPast(day: number): boolean {
  const { year, month, day: currentDay } = getCurrentUtcDate()

  if (year === 2025 && month === 12) {
    return currentDay >= day
  }

  // If we're past December 2025, all days are past
  if (year > 2025 || (year === 2025 && month > 12)) {
    return true
  }

  return false
}

/**
 * Get countdown until a day unlocks
 * Returns null if already unlocked
 */
export function getUnlockCountdown(day: number): { days: number; hours: number; minutes: number } | null {
  if (isDayUnlocked(day)) return null

  const now = new Date()
  const unlockDay = getUnlockDayForCalendarDay(day)
  // Month is 0-indexed, so 11 = December; use UTC to match unlock logic
  const unlockTimeMs = Date.UTC(2025, 11, unlockDay, 0, 0, 0)

  const diff = unlockTimeMs - now.getTime()
  if (diff <= 0) return null

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  return { days, hours, minutes }
}
