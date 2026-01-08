export type AchievementCategory = 'streams' | 'chat' | 'leaderboard' | 'community' | 'special'

export interface AchievementDefinition {
  id: string
  name: string
  description?: string
  requirement?: string
  icon: string
  reward: number
  category: AchievementCategory
  tiers?: {
    level: number
    requirement: number
    reward: number
    unlocked?: boolean
  }[]
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Stream Achievements
  {
    id: 'stream-starter',
    name: 'Stream Starter',
    requirement: 'Watch your first 30 minutes.',
    description: 'Welcome to the stream!',
    icon: '🎬',
    reward: 25,
    category: 'streams',
  },
  {
    id: 'getting-cozy',
    name: 'Getting Cozy',
    requirement: 'Watch 2 hours total.',
    description: "You're settling in nicely.",
    icon: '🛋️',
    reward: 50,
    category: 'streams',
  },
  {
    id: 'dedicated-viewer',
    name: 'Dedicated Viewer',
    requirement: 'Watch 10 hours total.',
    description: 'A real supporter!',
    icon: '📺',
    reward: 150,
    category: 'streams',
  },
  {
    id: 'stream-veteran',
    name: 'Stream Veteran',
    requirement: 'Watch 50 hours total.',
    description: "You've survived many streams.",
    icon: '🏅',
    reward: 500,
    category: 'streams',
  },
  {
    id: 'ride-or-die',
    name: 'Ride or Die',
    requirement: 'Watch 200 hours total.',
    icon: '🚀',
    reward: 1500,
    category: 'streams',
  },
  {
    id: 'multi-stream-hopper',
    name: 'Multi-Stream Hopper',
    requirement: 'Watch 2 different SweetFlips streams in 24 hours.',
    icon: '🔁',
    reward: 50,
    category: 'streams',
  },

  // Community / Dashboard Achievements
  {
    id: 'dashboard-addict',
    name: 'Dashboard Addict',
    requirement: 'Log into the dashboard 7 days in a month.',
    icon: '📊',
    reward: 100,
    category: 'community',
  },
  {
    id: 'discord-connected',
    name: 'Discord Connected',
    requirement: 'Connect your Discord account.',
    icon: '🔗',
    reward: 25,
    category: 'community',
  },
  {
    id: 'telegram-connected',
    name: 'Telegram Connected',
    requirement: 'Connect your Telegram account.',
    icon: '📨',
    reward: 25,
    category: 'community',
  },
  {
    id: 'twitter-connected',
    name: 'Twitter Connected',
    requirement: 'Connect your Twitter account.',
    icon: '🐦',
    reward: 100,
    category: 'community',
  },
  {
    id: 'instagram-connected',
    name: 'Instagram Connected',
    requirement: 'Connect your Instagram account.',
    icon: '📸',
    reward: 100,
    category: 'community',
  },
  {
    id: 'custom-profile-picture',
    name: 'Custom Profile Picture',
    requirement: 'Set a custom profile picture.',
    icon: '🖼️',
    reward: 10,
    category: 'community',
  },

  // Chat Achievements
  {
    id: 'first-words',
    name: 'First Words',
    requirement: 'Send your first chat message.',
    icon: '💬',
    reward: 25,
    category: 'chat',
  },
  {
    id: 'chatterbox',
    name: 'Chatterbox',
    requirement: 'Send 1000 chat messages.',
    icon: '🗣️',
    reward: 100,
    category: 'chat',
  },
  {
    id: 'emote-master',
    name: 'Emote Master',
    requirement: 'Use 1500 emotes in chat.',
    icon: '😎',
    reward: 75,
    category: 'chat',
  },
  {
    id: 'super-social',
    name: 'Super Social',
    requirement: 'Send 4000 chat messages.',
    icon: '🌐',
    reward: 250,
    category: 'chat',
  },
  {
    id: 'daily-chatter',
    name: 'Daily Chatter',
    requirement: 'Send any message on 7 different days.',
    icon: '📅',
    reward: 75,
    category: 'chat',
  },

  // Leaderboard / Special Achievements
  {
    id: 'top-g-chatter',
    name: 'Top G Chatter',
    requirement: 'Finish in the Top 3 leaderboard.',
    icon: '🏆',
    reward: 300,
    category: 'leaderboard',
  },
  {
    id: 'og-dash',
    name: 'OG Dash',
    requirement: 'Be one of the first 100 users in your dashboard.',
    icon: '⭐',
    reward: 150,
    category: 'special',
  },
  {
    id: 'sf-legend-of-the-month',
    name: 'SF Legend of the Month',
    requirement: 'Earn the most points this month.',
    icon: '👑',
    reward: 1500,
    category: 'special',
  },
]

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDefinition> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
) as Record<string, AchievementDefinition>

export function isValidAchievementId(id: string): id is keyof typeof ACHIEVEMENT_BY_ID {
  return !!ACHIEVEMENT_BY_ID[id]
}
