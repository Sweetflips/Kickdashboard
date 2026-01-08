#!/usr/bin/env node
/**
 * Test script for Razed API Endpoints
 * 
 * Tests:
 * 1. /api/oauth/razed/connect - Create verification
 * 2. /api/oauth/razed/status - Check status
 * 
 * Usage: 
 *   npx tsx scripts/test-razed-api.ts <kick_user_id> <razed_username>
 * 
 * Example:
 *   npx tsx scripts/test-razed-api.ts 123456 testuser
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function testConnect(kickUserId: string, razedUsername: string) {
    console.log('')
    console.log('========================================')
    console.log('🧪 TESTING RAZED API - CONNECT')
    console.log('========================================')
    console.log('')
    console.log(`Kick User ID: ${kickUserId}`)
    console.log(`Razed Username: ${razedUsername}`)
    console.log('')

    try {
        const response = await fetch(`${BASE_URL}/api/oauth/razed/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kick_user_id: kickUserId,
                razed_username: razedUsername
            })
        })

        const data = await response.json()

        if (response.ok) {
            console.log('✅ SUCCESS: Verification created')
            console.log(`   Verification Code: ${data.verification_code}`)
            console.log(`   Expires At: ${data.expires_at}`)
            console.log('')
            return data.verification_code
        } else {
            console.log('❌ FAILED:', data.error || 'Unknown error')
            console.log(`   Status: ${response.status}`)
            console.log('')
            return null
        }
    } catch (error) {
        console.log('❌ ERROR:', error instanceof Error ? error.message : 'Unknown error')
        console.log('')
        return null
    }
}

async function testStatus(verificationCode: string) {
    console.log('========================================')
    console.log('🧪 TESTING RAZED API - STATUS')
    console.log('========================================')
    console.log('')
    console.log(`Verification Code: ${verificationCode}`)
    console.log('')

    try {
        const response = await fetch(`${BASE_URL}/api/oauth/razed/status?code=${encodeURIComponent(verificationCode)}`)
        const data = await response.json()

        if (response.ok) {
            console.log('✅ SUCCESS: Status retrieved')
            console.log(`   Status: ${data.status}`)
            console.log('')
            return data.status
        } else {
            console.log('❌ FAILED:', data.error || 'Unknown error')
            console.log(`   Status: ${response.status}`)
            console.log('')
            return null
        }
    } catch (error) {
        console.log('❌ ERROR:', error instanceof Error ? error.message : 'Unknown error')
        console.log('')
        return null
    }
}

async function testRateLimit(kickUserId: string, razedUsername: string) {
    console.log('========================================')
    console.log('🧪 TESTING RAZED API - RATE LIMIT')
    console.log('========================================')
    console.log('')
    console.log('Attempting to create 2 verifications in quick succession...')
    console.log('')

    const results = []
    for (let i = 0; i < 2; i++) {
        try {
            const response = await fetch(`${BASE_URL}/api/oauth/razed/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kick_user_id: kickUserId,
                    razed_username: `${razedUsername}${i}`
                })
            })

            const data = await response.json()
            results.push({
                attempt: i + 1,
                success: response.ok,
                status: response.status,
                error: data.error
            })
        } catch (error) {
            results.push({
                attempt: i + 1,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        }
    }

    results.forEach(result => {
        if (result.success) {
            console.log(`✅ Attempt ${result.attempt}: Success`)
        } else {
            console.log(`❌ Attempt ${result.attempt}: Failed (Status: ${result.status})`)
            console.log(`   Error: ${result.error}`)
        }
    })
    console.log('')

    const secondFailed = !results[1]?.success && results[1]?.status === 429
    if (secondFailed) {
        console.log('✅ Rate limiting is working correctly!')
    } else {
        console.log('⚠️  Rate limiting may not be working as expected')
    }
    console.log('')
}

async function runTests() {
    const args = process.argv.slice(2)
    
    if (args.length < 2) {
        console.log('Usage: npx tsx scripts/test-razed-api.ts <kick_user_id> <razed_username>')
        console.log('Example: npx tsx scripts/test-razed-api.ts 123456 testuser')
        process.exit(1)
    }

    const kickUserId = args[0]
    const razedUsername = args[1]

    console.log('')
    console.log('========================================')
    console.log('🧪 RAZED API TEST SUITE')
    console.log('========================================')
    console.log(`Base URL: ${BASE_URL}`)
    console.log('')

    // Test 1: Create verification
    const verificationCode = await testConnect(kickUserId, razedUsername)
    
    if (!verificationCode) {
        console.log('❌ Cannot continue tests without verification code')
        process.exit(1)
    }

    // Test 2: Check status
    await testStatus(verificationCode)

    // Test 3: Rate limiting
    await testRateLimit(kickUserId, razedUsername)

    console.log('========================================')
    console.log('📊 TEST SUMMARY')
    console.log('========================================')
    console.log('✅ Connect endpoint: Tested')
    console.log('✅ Status endpoint: Tested')
    console.log('✅ Rate limiting: Tested')
    console.log('')
    console.log('💡 Next steps:')
    console.log(`   1. Send "${verificationCode}" in Razed chat`)
    console.log(`   2. Run: npx tsx scripts/test-razed-api.ts ${kickUserId} ${razedUsername}`)
    console.log(`   3. Check status again to verify account was linked`)
    console.log('')
}

runTests().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

