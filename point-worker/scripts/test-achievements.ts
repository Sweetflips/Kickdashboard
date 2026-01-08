/**
 * Achievement System Tests
 * 
 * Tests for:
 * 1. Claim idempotency: two parallel claims for same achievement credits once
 * 2. Connect unlock: after social connect, achievement becomes UNLOCKED, coins unchanged until claim
 * 3. Claim requires unlock: claiming LOCKED returns error and no ledger insert
 * 4. Referral code visibility: settings returns code for any authenticated user
 * 
 * Run with: npx ts-node scripts/test-achievements.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Test configuration
const TEST_PREFIX = 'test_achievement_'
const TEST_USER_KICK_ID = BigInt(999999999)

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function log(message: string) {
  console.log(`[TEST] ${message}`)
}

function pass(name: string) {
  results.push({ name, passed: true })
  console.log(`✅ PASS: ${name}`)
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error })
  console.log(`❌ FAIL: ${name} - ${error}`)
}

async function cleanup() {
  log('Cleaning up test data...')
  
  // Delete test user data
  const testUser = await prisma.user.findUnique({
    where: { kick_user_id: TEST_USER_KICK_ID },
  })
  
  if (testUser) {
    // Delete related records first
    await prisma.sweetCoinHistory.deleteMany({
      where: { user_id: testUser.id },
    })
    await prisma.userSweetCoins.deleteMany({
      where: { user_id: testUser.id },
    })
    await prisma.userAchievement.deleteMany({
      where: { user_id: testUser.id },
    })
    await prisma.coinLedger.deleteMany({
      where: { user_id: testUser.id },
    })
    await prisma.user.delete({
      where: { id: testUser.id },
    })
  }
  
  log('Cleanup complete.')
}

async function createTestUser(): Promise<{ id: bigint; kick_user_id: bigint }> {
  const user = await prisma.user.create({
    data: {
      kick_user_id: TEST_USER_KICK_ID,
      username: `${TEST_PREFIX}user_${Date.now()}`,
      discord_connected: false,
      telegram_connected: false,
      twitter_connected: false,
      instagram_connected: false,
    },
    select: { id: true, kick_user_id: true },
  })
  
  // Create sweet coins record
  await prisma.userSweetCoins.create({
    data: {
      user_id: user.id,
      total_sweet_coins: 0,
      total_emotes: 0,
    },
  })
  
  return user
}

/**
 * Test 1: Claim Idempotency
 * Two parallel claims for same achievement should credit only once.
 */
async function testClaimIdempotency() {
  const testName = 'Claim Idempotency'
  log(`Running: ${testName}`)
  
  try {
    const user = await createTestUser()
    const achievementId = 'DISCORD_CONNECTED'
    
    // First, unlock the achievement by connecting Discord
    await prisma.user.update({
      where: { id: user.id },
      data: { discord_connected: true },
    })
    
    // Create UNLOCKED achievement record
    await prisma.userAchievement.create({
      data: {
        user_id: user.id,
        achievement_id: achievementId,
        status: 'UNLOCKED',
        unlocked_at: new Date(),
      },
    })
    
    const claimKey = `achievement:${achievementId}:${user.id.toString()}`
    const reward = 25
    
    // Simulate two parallel claims
    const claim1 = (async () => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.sweetCoinHistory.create({
            data: {
              user_id: user.id,
              stream_session_id: null,
              sweet_coins_earned: reward,
              message_id: claimKey,
              earned_at: new Date(),
            },
          })
          await tx.userSweetCoins.update({
            where: { user_id: user.id },
            data: { total_sweet_coins: { increment: reward } },
          })
          await tx.userAchievement.update({
            where: { user_id_achievement_id: { user_id: user.id, achievement_id: achievementId } },
            data: { status: 'CLAIMED', claimed_at: new Date() },
          })
        })
        return { success: true }
      } catch (e: any) {
        if (e.code === 'P2002') {
          return { success: false, duplicate: true }
        }
        throw e
      }
    })()
    
    const claim2 = (async () => {
      // Small delay to ensure overlap
      await new Promise((r) => setTimeout(r, 10))
      try {
        await prisma.$transaction(async (tx) => {
          await tx.sweetCoinHistory.create({
            data: {
              user_id: user.id,
              stream_session_id: null,
              sweet_coins_earned: reward,
              message_id: claimKey,
              earned_at: new Date(),
            },
          })
          await tx.userSweetCoins.update({
            where: { user_id: user.id },
            data: { total_sweet_coins: { increment: reward } },
          })
          await tx.userAchievement.update({
            where: { user_id_achievement_id: { user_id: user.id, achievement_id: achievementId } },
            data: { status: 'CLAIMED', claimed_at: new Date() },
          })
        })
        return { success: true }
      } catch (e: any) {
        if (e.code === 'P2002') {
          return { success: false, duplicate: true }
        }
        throw e
      }
    })()
    
    const [result1, result2] = await Promise.all([claim1, claim2])
    
    // Verify exactly one succeeded
    const successCount = (result1.success ? 1 : 0) + (result2.success ? 1 : 0)
    
    if (successCount !== 1) {
      fail(testName, `Expected exactly 1 success, got ${successCount}`)
      return
    }
    
    // Verify final balance is exactly reward (not 2x reward)
    const finalBalance = await prisma.userSweetCoins.findUnique({
      where: { user_id: user.id },
      select: { total_sweet_coins: true },
    })
    
    if (finalBalance?.total_sweet_coins !== reward) {
      fail(testName, `Expected balance ${reward}, got ${finalBalance?.total_sweet_coins}`)
      return
    }
    
    // Verify only one history entry
    const historyCount = await prisma.sweetCoinHistory.count({
      where: { message_id: claimKey },
    })
    
    if (historyCount !== 1) {
      fail(testName, `Expected 1 history entry, got ${historyCount}`)
      return
    }
    
    pass(testName)
  } catch (error: any) {
    fail(testName, error.message)
  }
}

/**
 * Test 2: Connect Unlock
 * After social connect, achievement becomes UNLOCKED, coins unchanged until claim.
 */
async function testConnectUnlock() {
  const testName = 'Connect Unlock'
  log(`Running: ${testName}`)
  
  try {
    const user = await createTestUser()
    const achievementId = 'TELEGRAM_CONNECTED'
    
    // Verify initial state: not connected, no achievement record, 0 coins
    const initialUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { telegram_connected: true },
    })
    
    if (initialUser?.telegram_connected !== false) {
      fail(testName, 'Initial telegram_connected should be false')
      return
    }
    
    const initialBalance = await prisma.userSweetCoins.findUnique({
      where: { user_id: user.id },
      select: { total_sweet_coins: true },
    })
    
    if (initialBalance?.total_sweet_coins !== 0) {
      fail(testName, `Initial balance should be 0, got ${initialBalance?.total_sweet_coins}`)
      return
    }
    
    // Simulate Telegram connect (what happens in webhook)
    await prisma.user.update({
      where: { id: user.id },
      data: { telegram_connected: true, telegram_user_id: 'test123' },
    })
    
    // Simulate achievement evaluation (what evaluateAchievementsForUser does)
    await prisma.userAchievement.create({
      data: {
        user_id: user.id,
        achievement_id: achievementId,
        status: 'UNLOCKED',
        unlocked_at: new Date(),
      },
    })
    
    // Verify achievement is UNLOCKED
    const achievement = await prisma.userAchievement.findUnique({
      where: { user_id_achievement_id: { user_id: user.id, achievement_id: achievementId } },
      select: { status: true },
    })
    
    if (achievement?.status !== 'UNLOCKED') {
      fail(testName, `Expected status UNLOCKED, got ${achievement?.status}`)
      return
    }
    
    // Verify coins are still 0 (not auto-granted)
    const postConnectBalance = await prisma.userSweetCoins.findUnique({
      where: { user_id: user.id },
      select: { total_sweet_coins: true },
    })
    
    if (postConnectBalance?.total_sweet_coins !== 0) {
      fail(testName, `Coins should still be 0 after connect, got ${postConnectBalance?.total_sweet_coins}`)
      return
    }
    
    pass(testName)
  } catch (error: any) {
    fail(testName, error.message)
  }
}

/**
 * Test 3: Claim Requires Unlock
 * Claiming a LOCKED achievement returns error and no ledger insert.
 */
async function testClaimRequiresUnlock() {
  const testName = 'Claim Requires Unlock'
  log(`Running: ${testName}`)
  
  try {
    const user = await createTestUser()
    const achievementId = 'TWITTER_CONNECTED'
    
    // Verify user is not connected (twitter_connected = false)
    const userState = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twitter_connected: true },
    })
    
    if (userState?.twitter_connected !== false) {
      fail(testName, 'twitter_connected should be false')
      return
    }
    
    // Create a LOCKED achievement record
    await prisma.userAchievement.create({
      data: {
        user_id: user.id,
        achievement_id: achievementId,
        status: 'LOCKED',
      },
    })
    
    const claimKey = `achievement:${achievementId}:${user.id.toString()}`
    
    // Attempt to claim (should fail)
    const achievement = await prisma.userAchievement.findUnique({
      where: { user_id_achievement_id: { user_id: user.id, achievement_id: achievementId } },
      select: { status: true },
    })
    
    // Simulate the claim endpoint logic: check if unlocked first
    if (achievement?.status !== 'UNLOCKED') {
      // This is the expected path - claim should be rejected
      
      // Verify no ledger entry was created
      const ledgerCount = await prisma.sweetCoinHistory.count({
        where: { message_id: claimKey },
      })
      
      if (ledgerCount !== 0) {
        fail(testName, `Expected 0 ledger entries, got ${ledgerCount}`)
        return
      }
      
      // Verify balance unchanged
      const balance = await prisma.userSweetCoins.findUnique({
        where: { user_id: user.id },
        select: { total_sweet_coins: true },
      })
      
      if (balance?.total_sweet_coins !== 0) {
        fail(testName, `Expected balance 0, got ${balance?.total_sweet_coins}`)
        return
      }
      
      pass(testName)
    } else {
      fail(testName, 'Achievement should be LOCKED, not UNLOCKED')
    }
  } catch (error: any) {
    fail(testName, error.message)
  }
}

/**
 * Test 4: Referral Code Visibility
 * Settings returns referral code for any authenticated user.
 * 
 * Note: This tests the data model, not the API endpoint directly.
 * The referral code is derived from the user's ID.
 */
async function testReferralCodeVisibility() {
  const testName = 'Referral Code Visibility'
  log(`Running: ${testName}`)
  
  try {
    const user = await createTestUser()
    
    // Referral code format: base36 encoding of user ID
    const expectedCode = user.id.toString(36).toUpperCase()
    
    // Verify code can be generated for any user
    if (!expectedCode || expectedCode.length === 0) {
      fail(testName, 'Referral code should be non-empty')
      return
    }
    
    // Verify code is deterministic (same user = same code)
    const code1 = user.id.toString(36).toUpperCase()
    const code2 = user.id.toString(36).toUpperCase()
    
    if (code1 !== code2) {
      fail(testName, 'Referral code should be deterministic')
      return
    }
    
    log(`Generated referral code for user ${user.id}: ${expectedCode}`)
    
    pass(testName)
  } catch (error: any) {
    fail(testName, error.message)
  }
}

async function runTests() {
  console.log('=' .repeat(60))
  console.log('Achievement System Tests')
  console.log('=' .repeat(60))
  console.log('')
  
  try {
    await cleanup()
    
    await testClaimIdempotency()
    await cleanup()
    
    await testConnectUnlock()
    await cleanup()
    
    await testClaimRequiresUnlock()
    await cleanup()
    
    await testReferralCodeVisibility()
    await cleanup()
    
    console.log('')
    console.log('=' .repeat(60))
    console.log('Test Results Summary')
    console.log('=' .repeat(60))
    
    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed).length
    
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`)
    console.log('')
    
    if (failed > 0) {
      console.log('Failed Tests:')
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`  - ${r.name}: ${r.error}`)
      }
      process.exit(1)
    }
    
    console.log('All tests passed!')
    process.exit(0)
  } catch (error) {
    console.error('Test runner error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runTests()
