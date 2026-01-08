import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.achievementDefinition.count()
  console.log('Achievement definitions count:', count)
  
  const sample = await prisma.achievementDefinition.findMany({
    take: 5,
    orderBy: { sort_order: 'asc' },
    select: { id: true, title: true, reward_coins: true, category: true },
  })
  console.log('Sample achievements:')
  console.table(sample)

  // Check new tables exist
  const tables = [
    'user_achievements',
    'coin_ledger', 
    'dashboard_login_days',
    'chat_counters',
    'chat_days',
    'leaderboard_period_results',
    'monthly_winners',
    'watch_time_aggregates',
  ]
  
  console.log('\nTable verification:')
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table}`)
      console.log(`  ✓ ${table} exists`)
    } catch (e) {
      console.log(`  ✗ ${table} missing`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
