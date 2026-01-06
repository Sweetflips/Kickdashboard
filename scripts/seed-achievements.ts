/**
 * Seed script for AchievementDefinition records
 * Run: npx ts-node scripts/seed-achievements.ts
 */

import { PrismaClient, AchievementCategory } from '@prisma/client'

const prisma = new PrismaClient()

type AchievementSeed = {
  id: string
  category: AchievementCategory
  title: string
  description: string
  reward_coins: number
  sort_order: number
}

const ACHIEVEMENTS: AchievementSeed[] = [
  // Streams
  {
    id: 'STREAM_STARTER',
    category: 'STREAMS',
    title: 'Stream Starter',
    description: 'Watch your first 30 minutes of streams',
    reward_coins: 25,
    sort_order: 100,
  },
  {
    id: 'GETTING_COZY',
    category: 'STREAMS',
    title: 'Getting Cozy',
    description: 'Watch 2 hours of streams total',
    reward_coins: 50,
    sort_order: 101,
  },
  {
    id: 'DEDICATED_VIEWER',
    category: 'STREAMS',
    title: 'Dedicated Viewer',
    description: 'Watch 10 hours of streams total',
    reward_coins: 150,
    sort_order: 102,
  },
  {
    id: 'STREAM_VETERAN',
    category: 'STREAMS',
    title: 'Stream Veteran',
    description: 'Watch 50 hours of streams total',
    reward_coins: 500,
    sort_order: 103,
  },
  {
    id: 'RIDE_OR_DIE',
    category: 'STREAMS',
    title: 'Ride or Die',
    description: 'Watch 200 hours of streams total',
    reward_coins: 1500,
    sort_order: 104,
  },
  {
    id: 'MULTI_STREAM_HOPPER',
    category: 'STREAMS',
    title: 'Multi-Stream Hopper',
    description: 'Watch 2 different streams within 24 hours',
    reward_coins: 50,
    sort_order: 105,
  },

  // Community
  {
    id: 'DASHBOARD_ADDICT',
    category: 'COMMUNITY',
    title: 'Dashboard Addict',
    description: 'Login to dashboard on 7 days in a month',
    reward_coins: 100,
    sort_order: 200,
  },
  {
    id: 'DISCORD_CONNECTED',
    category: 'COMMUNITY',
    title: 'Discord Connected',
    description: 'Connect your Discord account',
    reward_coins: 25,
    sort_order: 201,
  },
  {
    id: 'TELEGRAM_CONNECTED',
    category: 'COMMUNITY',
    title: 'Telegram Connected',
    description: 'Connect your Telegram account',
    reward_coins: 25,
    sort_order: 202,
  },
  {
    id: 'TWITTER_CONNECTED',
    category: 'COMMUNITY',
    title: 'Twitter Connected',
    description: 'Connect your Twitter account',
    reward_coins: 100,
    sort_order: 203,
  },
  {
    id: 'INSTAGRAM_CONNECTED',
    category: 'COMMUNITY',
    title: 'Instagram Connected',
    description: 'Connect your Instagram account',
    reward_coins: 100,
    sort_order: 204,
  },
  {
    id: 'CUSTOM_PROFILE_PICTURE',
    category: 'COMMUNITY',
    title: 'Custom Profile Picture',
    description: 'Set a custom profile picture',
    reward_coins: 10,
    sort_order: 205,
  },

  // Chat
  {
    id: 'FIRST_WORDS',
    category: 'CHAT',
    title: 'First Words',
    description: 'Send your first chat message',
    reward_coins: 25,
    sort_order: 300,
  },
  {
    id: 'CHATTERBOX',
    category: 'CHAT',
    title: 'Chatterbox',
    description: 'Send 1000 chat messages',
    reward_coins: 100,
    sort_order: 301,
  },
  {
    id: 'EMOTE_MASTER',
    category: 'CHAT',
    title: 'Emote Master',
    description: 'Use 1500 emotes in chat',
    reward_coins: 75,
    sort_order: 302,
  },
  {
    id: 'SUPER_SOCIAL',
    category: 'CHAT',
    title: 'Super Social',
    description: 'Send 4000 chat messages',
    reward_coins: 250,
    sort_order: 303,
  },
  {
    id: 'DAILY_CHATTER',
    category: 'CHAT',
    title: 'Daily Chatter',
    description: 'Send a message on 7 different days',
    reward_coins: 75,
    sort_order: 304,
  },

  // Leaderboard
  {
    id: 'TOP_G_CHATTER',
    category: 'LEADERBOARD',
    title: 'Top G Chatter',
    description: 'Finish in the Top 3 on the leaderboard for a period',
    reward_coins: 300,
    sort_order: 400,
  },

  // Special
  {
    id: 'OG_DASH',
    category: 'SPECIAL',
    title: 'OG Dash',
    description: 'Be one of the first 100 dashboard users',
    reward_coins: 150,
    sort_order: 500,
  },
  {
    id: 'SF_LEGEND_OF_THE_MONTH',
    category: 'SPECIAL',
    title: 'SF Legend of the Month',
    description: 'Earn the most points in a calendar month',
    reward_coins: 1500,
    sort_order: 501,
  },
]

async function main() {
  console.log('Seeding achievement definitions...')

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievementDefinition.upsert({
      where: { id: achievement.id },
      update: {
        category: achievement.category,
        title: achievement.title,
        description: achievement.description,
        reward_coins: achievement.reward_coins,
        sort_order: achievement.sort_order,
      },
      create: achievement,
    })
    console.log(`  ✓ ${achievement.id}`)
  }

  console.log(`\nSeeded ${ACHIEVEMENTS.length} achievement definitions.`)
}

main()
  .catch((e) => {
    console.error('Error seeding achievements:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
