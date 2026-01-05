#!/usr/bin/env node
/**
 * Test script for Razed Verification Code Generation
 * 
 * Tests:
 * 1. Code generation format
 * 2. Code validation
 * 3. Code extraction from messages
 * 4. Expiration logic
 * 
 * Usage: npx tsx scripts/test-razed-verification.ts
 */

import {
    generateVerificationCode,
    isValidVerificationCode,
    extractVerificationCode,
    getVerificationExpiry,
    isVerificationExpired
} from '../lib/razed-verification'

console.log('')
console.log('========================================')
console.log('🧪 TESTING RAZED VERIFICATION')
console.log('========================================')
console.log('')

let passed = 0
let failed = 0

function test(name: string, fn: () => boolean) {
    try {
        if (fn()) {
            console.log(`✅ ${name}`)
            passed++
        } else {
            console.log(`❌ ${name}`)
            failed++
        }
    } catch (error) {
        console.log(`❌ ${name} - Error: ${error}`)
        failed++
    }
}

// Test 1: Code generation format
test('Code generation produces valid format', () => {
    for (let i = 0; i < 10; i++) {
        const code = generateVerificationCode()
        if (!code.startsWith('verify-')) return false
        if (!isValidVerificationCode(code)) return false
    }
    return true
})

// Test 2: Code format validation
test('Valid codes pass validation', () => {
    const validCodes = [
        'verify-apple-1234',
        'verify-rocket-5678',
        'verify-tiger-9999',
        'verify-ocean-1000'
    ]
    return validCodes.every(code => isValidVerificationCode(code))
})

test('Invalid codes fail validation', () => {
    const invalidCodes = [
        'verify-apple-123',      // 3 digits instead of 4
        'verify-apple-12345',    // 5 digits instead of 4
        'verify-APPLE-1234',     // uppercase word
        'verify-apple-12ab',     // non-numeric
        'verify-apple',          // missing number
        'apple-1234',            // missing verify prefix
        'verify--1234',          // missing word
        'verify-apple-',         // missing number
        'verify-apple-1234-extra' // extra parts
    ]
    return invalidCodes.every(code => !isValidVerificationCode(code))
})

// Test 3: Code extraction from messages
test('Extract code from exact match', () => {
    const code = 'verify-apple-1234'
    const extracted = extractVerificationCode(code)
    return extracted === code
})

test('Extract code from message with text', () => {
    const code = 'verify-rocket-5678'
    const messages = [
        `Hello! ${code} is my code`,
        `${code} here`,
        `My verification code is ${code}`,
        `  ${code}  `,
        `Sending ${code.toUpperCase()}`, // Should still work (case-insensitive)
    ]
    return messages.every(msg => {
        const extracted = extractVerificationCode(msg)
        return extracted === code.toLowerCase()
    })
})

test('Extract code ignores invalid formats', () => {
    const invalidMessages = [
        'verify-apple-123',      // Wrong format
        'verify-APPLE-1234',     // Wrong format (uppercase)
        'verify-apple-12ab',     // Wrong format
        'Hello world',            // No code
        'verify-apple',          // Incomplete
    ]
    return invalidMessages.every(msg => {
        const extracted = extractVerificationCode(msg)
        return extracted === null
    })
})

// Test 4: Expiration logic
test('Expiration time is set correctly', () => {
    const expiry = getVerificationExpiry()
    const now = new Date()
    const diff = expiry.getTime() - now.getTime()
    // Should be approximately 5 minutes (300000ms), allow 10 second tolerance
    return diff >= 290000 && diff <= 310000
})

test('Expired codes are detected', () => {
    const expired = new Date(Date.now() - 60000) // 1 minute ago
    return isVerificationExpired(expired) === true
})

test('Non-expired codes are detected', () => {
    const future = new Date(Date.now() + 600000) // 10 minutes in future
    return isVerificationExpired(future) === false
})

// Test 5: Code uniqueness
test('Generated codes are unique', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode()
        if (codes.has(code)) {
            console.log(`   Duplicate found: ${code}`)
            return false
        }
        codes.add(code)
    }
    return true
})

// Test 6: Code format consistency
test('All generated codes follow same format', () => {
    const pattern = /^verify-[a-z]+-\d{4}$/
    for (let i = 0; i < 50; i++) {
        const code = generateVerificationCode()
        if (!pattern.test(code)) {
            console.log(`   Invalid format: ${code}`)
            return false
        }
    }
    return true
})

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
    process.exit(0)
} else {
    console.log('❌ SOME TESTS FAILED')
    process.exit(1)
}

