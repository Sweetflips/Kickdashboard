export interface AdventItem {
  id: string
  day: number
  pointsCost: number
  image: string
  maxTickets: number
}

export const ADVENT_ITEMS: AdventItem[] = [
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
 * Check if an advent day is unlocked based on current date
 * Day unlocks on/after December {day}, 2024
 */
export function isDayUnlocked(day: number): boolean {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // getMonth() returns 0-11
  const currentDay = now.getDate()

  // If it's December 2024 or later
  if (currentYear > 2024) return true
  if (currentYear === 2024 && currentMonth > 12) return true
  if (currentYear === 2024 && currentMonth === 12) {
    return currentDay >= day
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
  const unlockDate = new Date(2024, 11, day, 0, 0, 0) // Month is 0-indexed, so 11 = December

  const diff = unlockDate.getTime() - now.getTime()
  if (diff <= 0) return null

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  return { days, hours, minutes }
}
