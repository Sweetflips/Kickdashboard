#!/usr/bin/env node
/**
 * Full Flow Test for Razed Verification
 * 
 * Tests the complete flow:
 * 1. Create verification via API
 * 2. Monitor worker for message processing
 * 3. Verify account connection
 * 
 * Usage: npx tsx scripts/test-razed-full-flow.ts <kick_user_id> <razed_username>
 */

import { db } from '../lib/db'
import { generateVerificationCode } from '../lib/razed-verification'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

async function testFullFlow() {
    const args = process.argv.slice(2)
    
    if (args.length < 2) {
        console.log('Usage: npx tsx scripts/test-razed-full-flow.ts <kick_user_id> <razed_username>')
        console.log('Example: npx tsx scripts/test-razed-full-flow.ts 123456 testuser')
        process.exit(1)
    }

    const kickUserId = args[0]
    const razedUsername = args[1]

    console.log('')
    console.log('========================================')
    console.log('🧪 RAZED FULL FLOW TEST')
    console.log('========================================')
    console.log(`Kick User ID: ${kickUserId}`)
    console.log(`Razed Username: ${razedUsername}`)
    console.log('')

    // Step 1: Create verification
    console.log('Step 1: Creating verification...')
    let verificationCode: string | null = null
    
    try {
        const response = await fetch(`${BASE_URL}/api/oauth/razed/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                kick_user_id: kickUserId,
                razed_username: razedUsername
            })
        })

        if (!response.ok) {
            const error = await response.json()
            console.error(`❌ Failed to create verification: ${error.error}`)
            process.exit(1)
        }

        const data = await response.json()
        verificationCode = data.verification_code
        console.log(`✅ Verification created: ${verificationCode}`)
        console.log(`   Expires at: ${data.expires_at}`)
        console.log('')
    } catch (error) {
        console.error('❌ Error creating verification:', error)
        process.exit(1)
    }

    // Step 2: Verify verification exists in database
    console.log('Step 2: Verifying database record...')
    try {
        const verification = await (db as any).razedVerification.findUnique({
            where: { verification_code: verificationCode! }
        })

        if (!verification) {
            console.error('❌ Verification not found in database')
            process.exit(1)
        }

        console.log(`✅ Verification found in database`)
        console.log(`   Status: ${verification.status}`)
        console.log(`   Razed Username: ${verification.razed_username}`)
        console.log('')
    } catch (error) {
        console.error('❌ Error querying database:', error)
        process.exit(1)
    }

    // Step 3: Instructions for user
    console.log('========================================')
    console.log('📝 NEXT STEPS')
    console.log('========================================')
    console.log('')
    console.log('1. Make sure the Razed worker is running:')
    console.log('   npm run start:worker')
    console.log('')
    console.log('2. Send this verification code in Razed chat:')
    console.log(`   ${verificationCode}`)
    console.log('')
    console.log('3. The worker should detect the message and verify your account')
    console.log('')
    console.log('4. Check verification status:')
    console.log(`   npx tsx scripts/test-razed-api.ts ${kickUserId} ${razedUsername}`)
    console.log('')
    console.log('5. Verify account is connected:')
    console.log(`   curl "${BASE_URL}/api/connected-accounts?kick_user_id=${kickUserId}"`)
    console.log('')

    // Step 4: Monitor for verification (optional - can be done manually)
    console.log('⏳ Monitoring verification status...')
    console.log('   (Press Ctrl+C to stop monitoring)')
    console.log('')

    let verified = false
    const startTime = Date.now()
    const maxWaitTime = 300000 // 5 minutes

    while (!verified && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 3000)) // Check every 3 seconds

        try {
            const statusResponse = await fetch(`${BASE_URL}/api/oauth/razed/status?code=${encodeURIComponent(verificationCode!)}`)
            if (statusResponse.ok) {
                const statusData = await statusResponse.json()
                
                if (statusData.status === 'verified') {
                    verified = true
                    console.log('')
                    console.log('========================================')
                    console.log('✅ VERIFICATION SUCCESSFUL!')
                    console.log('========================================')
                    console.log('')
                    
                    // Verify user account is updated
                    const user = await (db as any).user.findUnique({
                        where: { kick_user_id: BigInt(kickUserId) },
                        select: {
                            razed_connected: true,
                            razed_username: true,
                            razed_user_id: true
                        }
                    })

                    if (user?.razed_connected) {
                        console.log('✅ User account updated:')
                        console.log(`   Razed Connected: ${user.razed_connected}`)
                        console.log(`   Razed Username: ${user.razed_username}`)
                        console.log(`   Razed User ID: ${user.razed_user_id}`)
                        console.log('')
                        console.log('🎉 Full flow test PASSED!')
                    } else {
                        console.log('⚠️  Verification marked as verified, but user account not updated')
                    }
                    
                    break
                } else if (statusData.status === 'expired') {
                    console.log('❌ Verification expired')
                    break
                }
            }
        } catch (error) {
            // Continue monitoring
        }
    }

    if (!verified) {
        console.log('')
        console.log('⏱️  Timeout waiting for verification')
        console.log('   Check worker logs to see if message was received')
    }

    process.exit(0)
}

testFullFlow().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})

