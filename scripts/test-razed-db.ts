#!/usr/bin/env node
/**
 * Test script for Razed Database Operations
 * 
 * Tests:
 * 1. Database schema (RazedVerification table exists)
 * 2. User model has Razed fields
 * 3. Create verification record
 * 4. Query verification record
 * 5. Update verification status
 * 
 * Usage: npx tsx scripts/test-razed-(db as any).ts
 */

import { db } from '../lib/db'
import { generateVerificationCode, getVerificationExpiry } from '../lib/razed-verification'

console.log('')
console.log('========================================')
console.log('🧪 TESTING RAZED DATABASE')
console.log('========================================')
console.log('')

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<boolean>) {
    try {
        const result = await fn()
        if (result) {
            console.log(`✅ ${name}`)
            passed++
        } else {
            console.log(`❌ ${name}`)
            failed++
        }
    } catch (error) {
        console.log(`❌ ${name} - Error: ${error instanceof Error ? error.message : String(error)}`)
        failed++
    }
}

async function runTests() {
// Test 1: Check if RazedVerification table exists
await test('RazedVerification table exists', async () => {
    try {
        const result = await (db as any).$queryRaw<Array<{ table_name: string }>>`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'razed_verifications'
        `
        return Array.isArray(result) && result.length > 0
    } catch {
        return false
    }
})

// Test 2: Check if User model has Razed fields
await test('User model has razed_connected field', async () => {
    try {
        const result = await (db as any).$queryRaw<Array<{ column_name: string }>>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name IN ('razed_connected', 'razed_username', 'razed_user_id')
        `
        const columns = result.map((r: { column_name: string }) => r.column_name)
        return columns.includes('razed_connected') && 
               columns.includes('razed_username') && 
               columns.includes('razed_user_id')
    } catch {
        return false
    }
})

// Test 3: Create verification record
let testVerificationId: bigint | null = null
const testKickUserId = BigInt(999999999) // Test user ID
const testRazedUsername = 'testuser'
const testVerificationCode = generateVerificationCode()

await test('Create verification record', async () => {
    try {
        const verification = await (db as any).razedVerification.create({
            data: {
                kick_user_id: testKickUserId,
                razed_username: testRazedUsername,
                verification_code: testVerificationCode,
                expires_at: getVerificationExpiry(),
                status: 'pending'
            }
        })
        testVerificationId = verification.id
        return verification.verification_code === testVerificationCode
    } catch (error) {
        console.log(`   Error details: ${error}`)
        return false
    }
})

// Test 4: Query verification record
await test('Query verification by code', async () => {
    try {
        const verification = await (db as any).razedVerification.findUnique({
            where: { verification_code: testVerificationCode }
        })
        return verification !== null && 
               verification.razed_username === testRazedUsername &&
               verification.status === 'pending'
    } catch {
        return false
    }
})

// Test 5: Update verification status
await test('Update verification status', async () => {
    try {
        const updated = await (db as any).razedVerification.update({
            where: { verification_code: testVerificationCode },
            data: {
                status: 'verified',
                verified_at: new Date()
            }
        })
        return updated.status === 'verified' && updated.verified_at !== null
    } catch {
        return false
    }
})

// Test 6: Update user Razed connection
await test('Update user Razed connection', async () => {
    try {
        // First, ensure user exists (or create test user)
        await (db as any).user.upsert({
            where: { kick_user_id: testKickUserId },
            update: {
                razed_connected: true,
                razed_username: testRazedUsername,
                razed_user_id: '12345'
            },
            create: {
                kick_user_id: testKickUserId,
                username: 'testuser',
                razed_connected: true,
                razed_username: testRazedUsername,
                razed_user_id: '12345'
            }
        })

        const user = await (db as any).user.findUnique({
            where: { kick_user_id: testKickUserId },
            select: {
                razed_connected: true,
                razed_username: true,
                razed_user_id: true
            }
        })

        return user !== null &&
               user.razed_connected === true &&
               user.razed_username === testRazedUsername &&
               user.razed_user_id === '12345'
    } catch (error) {
        console.log(`   Error details: ${error}`)
        return false
    }
})

// Cleanup: Delete test verification
if (testVerificationId) {
    try {
        await (db as any).razedVerification.delete({
            where: { id: testVerificationId }
        })
        console.log('🧹 Cleaned up test verification record')
    } catch (error) {
        console.log(`⚠️  Failed to cleanup test verification: ${error}`)
    }
}

// Cleanup: Reset test user (optional - comment out if you want to keep it)
try {
    await (db as any).user.updateMany({
        where: { kick_user_id: testKickUserId },
        data: {
            razed_connected: false,
            razed_username: null,
            razed_user_id: null
        }
    })
} catch {
    // Ignore cleanup errors
}

console.log('')
console.log('========================================')
console.log('📊 TEST RESULTS')
console.log('========================================')
console.log(`Passed: ${passed}`)
console.log(`Failed: ${failed}`)
console.log(`Total: ${passed + failed}`)
console.log('')

    if (failed === 0) {
        console.log('✅ ALL TESTS PASSED!')
        console.log('')
        console.log('💡 Database schema is correct and operations work!')
        process.exit(0)
    } else {
        console.log('❌ SOME TESTS FAILED')
        console.log('')
        console.log('💡 Make sure to run database migrations first:')
        console.log('   npx prisma migrate dev')
        process.exit(1)
    }
}

runTests().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

