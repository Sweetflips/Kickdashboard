#!/usr/bin/env node
/**
 * MODERATION REPLAY TEST HARNESS
 *
 * Tests the moderation detection logic against:
 * 1. Historical chat logs (labeled as normal hype or raids)
 * 2. Synthetic raid simulations
 *
 * Usage:
 *   npx tsx scripts/moderation-replay.ts                    # Run all tests
 *   npx tsx scripts/moderation-replay.ts --synthetic-only   # Only synthetic tests
 *   npx tsx scripts/moderation-replay.ts --file logs.json   # Replay a specific log file
 */

console.log('')
console.log('========================================')
console.log('MODERATION REPLAY TEST HARNESS')
console.log('========================================')
console.log('')

// ============================================================================
// TYPES (copied from moderation-worker to avoid import issues in test env)
// ============================================================================

type MessageClass = 'normal_hype' | 'repetitive_spam' | 'coordinated_raid_spam' | 'ambiguous'
type RaidStateLabel = 'none' | 'suspected_raid' | 'confirmed_raid'
type RiskMode = 'low' | 'medium' | 'high'

interface SpamDetectionResult {
    classification: MessageClass
    similarityScore: number
    groupSimilarityScore: number
    userBurstScore: number
    raidPatternScore: number
    features: string[]
}

interface RaidAssessment {
    state: RaidStateLabel
    confidence: number
    evidence: string[]
}

interface RiskScoreState {
    score: number
    mode: RiskMode
    components: Record<string, number>
}

interface TestMessage {
    userId: string
    username: string
    timestamp: number
    messageText: string
    isNewUser?: boolean
    label?: 'normal_hype' | 'raid_spam' | 'repetitive_spam'
}

interface MessageWindow {
    timestamp: number
    sender_user_id: bigint
    content_hash: string
    normalized_content: string
    is_new_user: boolean
}

interface TestState {
    messageWindow: MessageWindow[]
    newUserMessageCount: number
}

// ============================================================================
// DETECTION LOGIC (same as moderation-worker.ts)
// ============================================================================

function normalizeContentForComparison(content: string): string {
    return content
        .toLowerCase()
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
        .replace(/(.)\1{2,}/g, '$1$1')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function getTokens(text: string): string[] {
    return text.split(/\s+/).filter(t => t.length > 0)
}

function computeJaccardSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1
    if (a.length === 0 || b.length === 0) return 0
    const setA = new Set(a)
    const setB = new Set(b)
    let intersection = 0
    for (const item of setA) {
        if (setB.has(item)) intersection++
    }
    const union = setA.size + setB.size - intersection
    return union === 0 ? 0 : intersection / union
}

function hashMessageContent(content: string): string {
    const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ')
    let hash = 0
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return hash.toString(36)
}

function computeGroupDiversity(messages: string[]): number {
    if (messages.length < 2) return 1
    const uniqueHashes = new Set(messages.map(m => hashMessageContent(m)))
    return uniqueHashes.size / messages.length
}

function detectSpam(
    content: string,
    senderUserId: bigint,
    state: TestState,
    now: number,
    isNewUser: boolean
): SpamDetectionResult {
    const normalized = normalizeContentForComparison(content)
    const tokens = getTokens(normalized)
    const features: string[] = []

    const recentWindow = state.messageWindow.filter(m => m.timestamp > now - 10000)
    const userRecent = recentWindow.filter(m => m.sender_user_id === senderUserId)

    let maxUserSimilarity = 0
    for (const msg of userRecent) {
        const sim = computeJaccardSimilarity(tokens, getTokens(msg.normalized_content))
        if (sim > maxUserSimilarity) maxUserSimilarity = sim
    }
    if (maxUserSimilarity > 0.8) features.push(`high_self_similarity:${maxUserSimilarity.toFixed(2)}`)

    const otherRecent = recentWindow.filter(m => m.sender_user_id !== senderUserId)
    let maxGroupSimilarity = 0
    let similarCount = 0
    for (const msg of otherRecent) {
        const sim = computeJaccardSimilarity(tokens, getTokens(msg.normalized_content))
        if (sim > maxGroupSimilarity) maxGroupSimilarity = sim
        if (sim > 0.7) similarCount++
    }
    const groupSimilarityScore = otherRecent.length > 0 ? similarCount / otherRecent.length : 0
    if (groupSimilarityScore > 0.3) features.push(`group_template:${(groupSimilarityScore * 100).toFixed(0)}%`)

    const userBurstScore = Math.min(1, userRecent.length / 6)
    if (userRecent.length >= 4) features.push(`user_burst:${userRecent.length}`)

    const newUserMsgs = recentWindow.filter(m => m.is_new_user)
    const newUserRatio = recentWindow.length > 0 ? newUserMsgs.length / recentWindow.length : 0
    const diversity = computeGroupDiversity(recentWindow.map(m => m.normalized_content))
    const raidPatternScore = (1 - diversity) * 0.5 + newUserRatio * 0.5
    if (newUserRatio > 0.5) features.push(`new_user_flood:${(newUserRatio * 100).toFixed(0)}%`)
    if (diversity < 0.3) features.push(`low_diversity:${(diversity * 100).toFixed(0)}%`)

    let classification: MessageClass = 'normal_hype'
    if (raidPatternScore > 0.6 && groupSimilarityScore > 0.3) {
        classification = 'coordinated_raid_spam'
    } else if (maxUserSimilarity > 0.85 || userBurstScore > 0.8) {
        classification = 'repetitive_spam'
    } else if (raidPatternScore > 0.4 || groupSimilarityScore > 0.5) {
        classification = 'ambiguous'
    }

    return {
        classification,
        similarityScore: maxUserSimilarity,
        groupSimilarityScore,
        userBurstScore,
        raidPatternScore,
        features,
    }
}

function assessRaidState(state: TestState, now: number): RaidAssessment {
    const recentWindow = state.messageWindow.filter(m => m.timestamp > now - 5000)
    const evidence: string[] = []

    if (recentWindow.length < 10) {
        return { state: 'none', confidence: 0, evidence: ['low_volume'] }
    }

    const uniqueSenders = new Set(recentWindow.map(m => m.sender_user_id.toString()))
    const senderRatio = uniqueSenders.size / recentWindow.length

    const newUserMsgs = recentWindow.filter(m => m.is_new_user)
    const newUserRatio = newUserMsgs.length / recentWindow.length

    const diversity = computeGroupDiversity(recentWindow.map(m => m.normalized_content))

    if (newUserRatio > 0.5) evidence.push(`new_user_ratio:${(newUserRatio * 100).toFixed(0)}%`)
    if (diversity < 0.3) evidence.push(`low_content_diversity:${(diversity * 100).toFixed(0)}%`)
    if (senderRatio > 0.8) evidence.push(`many_unique_senders:${uniqueSenders.size}`)
    if (recentWindow.length > 50) evidence.push(`high_volume:${recentWindow.length}/5s`)

    const raidScore = (newUserRatio * 0.4) + ((1 - diversity) * 0.3) + (senderRatio * 0.3)

    let raidState: RaidStateLabel = 'none'
    if (raidScore > 0.7) {
        raidState = 'confirmed_raid'
    } else if (raidScore > 0.4) {
        raidState = 'suspected_raid'
    }

    return { state: raidState, confidence: raidScore, evidence }
}

function computeRiskScore(
    spamResult: SpamDetectionResult,
    raidAssessment: RaidAssessment
): RiskScoreState {
    const components: Record<string, number> = {
        spam_classification: spamResult.classification === 'coordinated_raid_spam' ? 0.8 :
                             spamResult.classification === 'repetitive_spam' ? 0.5 :
                             spamResult.classification === 'ambiguous' ? 0.3 : 0,
        raid_confidence: raidAssessment.confidence,
        group_similarity: spamResult.groupSimilarityScore,
        raid_pattern: spamResult.raidPatternScore,
    }

    const score = (
        components.spam_classification * 0.3 +
        components.raid_confidence * 0.3 +
        components.group_similarity * 0.2 +
        components.raid_pattern * 0.2
    )

    let mode: RiskMode = 'low'
    if (score > 0.7) mode = 'high'
    else if (score > 0.3) mode = 'medium'

    return { score, mode, components }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function generateNormalHypeMessages(count: number, baseTime: number): TestMessage[] {
    const messages: TestMessage[] = []
    const phrases = [
        'LETS GOOO', 'POG', 'POGGERS', 'W', 'HUGE W', 'OMG', 'NO WAY',
        'INSANE', 'CLUTCH', 'GG', 'EZ', 'lol', 'lmao', 'haha nice',
        'this stream is fire', 'love this', 'hyped rn', 'vibing',
        'chat going crazy', 'W stream', 'based', 'goated'
    ]
    const emojis = ['', ' LUL', ' Pog', ' KEKW', ' catJAM', ' PogChamp', ' HYPERS']

    for (let i = 0; i < count; i++) {
        const phrase = phrases[Math.floor(Math.random() * phrases.length)]
        const emoji = emojis[Math.floor(Math.random() * emojis.length)]
        messages.push({
            userId: `user_${100 + Math.floor(Math.random() * 500)}`,
            username: `chatter${100 + Math.floor(Math.random() * 500)}`,
            timestamp: baseTime + i * (200 + Math.floor(Math.random() * 300)),
            messageText: phrase + emoji,
            isNewUser: Math.random() < 0.1,
            label: 'normal_hype',
        })
    }
    return messages
}

function generateRaidMessages(count: number, baseTime: number): TestMessage[] {
    const messages: TestMessage[] = []
    const templates = [
        'Check out my channel for free giveaways!',
        'Follow me for daily streams!',
        'RAID RAID RAID',
        'Join the raid army!',
    ]
    const template = templates[Math.floor(Math.random() * templates.length)]

    for (let i = 0; i < count; i++) {
        const variation = template.replace(/!/g, Math.random() < 0.3 ? '!!' : '!')
        messages.push({
            userId: `raider_${1000 + i}`,
            username: `raider${1000 + i}`,
            timestamp: baseTime + i * 50,
            messageText: variation,
            isNewUser: true,
            label: 'raid_spam',
        })
    }
    return messages
}

function generateRepetitiveSpam(userId: string, count: number, baseTime: number): TestMessage[] {
    const messages: TestMessage[] = []
    const spamMessage = 'Buy my NFTs at example.com/nft'

    for (let i = 0; i < count; i++) {
        messages.push({
            userId,
            username: `spammer_${userId}`,
            timestamp: baseTime + i * 1500,
            messageText: spamMessage,
            isNewUser: false,
            label: 'repetitive_spam',
        })
    }
    return messages
}

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestResults {
    total: number
    truePositives: number
    trueNegatives: number
    falsePositives: number
    falseNegatives: number
    riskModeTransitions: { from: RiskMode; to: RiskMode; atMessage: number }[]
}

function runTest(messages: TestMessage[], testName: string): TestResults {
    console.log(`\n--- Running: ${testName} ---`)
    console.log(`Total messages: ${messages.length}`)

    const state: TestState = {
        messageWindow: [],
        newUserMessageCount: 0,
    }

    const results: TestResults = {
        total: messages.length,
        truePositives: 0,
        trueNegatives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        riskModeTransitions: [],
    }

    let lastRiskMode: RiskMode = 'low'

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const senderUserId = BigInt(msg.userId.replace(/\D/g, '') || '0')
        const normalized = normalizeContentForComparison(msg.messageText)
        const contentHash = hashMessageContent(msg.messageText)

        // Add to window
        state.messageWindow.push({
            timestamp: msg.timestamp,
            sender_user_id: senderUserId,
            content_hash: contentHash,
            normalized_content: normalized,
            is_new_user: msg.isNewUser || false,
        })

        // Clean old messages
        state.messageWindow = state.messageWindow.filter(m => m.timestamp > msg.timestamp - 10000)

        // Detect
        const spamResult = detectSpam(msg.messageText, senderUserId, state, msg.timestamp, msg.isNewUser || false)
        const raidAssessment = assessRaidState(state, msg.timestamp)
        const riskState = computeRiskScore(spamResult, raidAssessment)

        // Track risk mode transitions
        if (riskState.mode !== lastRiskMode) {
            results.riskModeTransitions.push({
                from: lastRiskMode,
                to: riskState.mode,
                atMessage: i,
            })
            lastRiskMode = riskState.mode
        }

        // Evaluate accuracy
        const isSpamDetected = spamResult.classification !== 'normal_hype'
        const isActualSpam = msg.label === 'raid_spam' || msg.label === 'repetitive_spam'

        if (isSpamDetected && isActualSpam) {
            results.truePositives++
        } else if (!isSpamDetected && !isActualSpam) {
            results.trueNegatives++
        } else if (isSpamDetected && !isActualSpam) {
            results.falsePositives++
        } else {
            results.falseNegatives++
        }
    }

    // Report
    const precision = results.truePositives / (results.truePositives + results.falsePositives) || 0
    const recall = results.truePositives / (results.truePositives + results.falseNegatives) || 0
    const f1 = 2 * (precision * recall) / (precision + recall) || 0

    console.log(`Results:`)
    console.log(`  True Positives:  ${results.truePositives}`)
    console.log(`  True Negatives:  ${results.trueNegatives}`)
    console.log(`  False Positives: ${results.falsePositives}`)
    console.log(`  False Negatives: ${results.falseNegatives}`)
    console.log(`  Precision: ${(precision * 100).toFixed(1)}%`)
    console.log(`  Recall:    ${(recall * 100).toFixed(1)}%`)
    console.log(`  F1 Score:  ${(f1 * 100).toFixed(1)}%`)

    if (results.riskModeTransitions.length > 0) {
        console.log(`  Risk Mode Transitions:`)
        for (const t of results.riskModeTransitions) {
            console.log(`    Message ${t.atMessage}: ${t.from} -> ${t.to}`)
        }
    }

    return results
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    const args = process.argv.slice(2)
    const syntheticOnly = args.includes('--synthetic-only')
    const fileIndex = args.indexOf('--file')
    const logFile = fileIndex >= 0 ? args[fileIndex + 1] : null

    console.log('Running synthetic tests...\n')

    // Test 1: Normal hype (should NOT trigger spam detection)
    const hypeMessages = generateNormalHypeMessages(100, Date.now())
    runTest(hypeMessages, 'Normal Hype (100 messages)')

    // Test 2: Raid burst (SHOULD trigger raid detection)
    const raidMessages = generateRaidMessages(50, Date.now())
    runTest(raidMessages, 'Raid Burst (50 identical messages from new users)')

    // Test 3: Repetitive spam from single user
    const spamMessages = generateRepetitiveSpam('spammer123', 10, Date.now())
    runTest(spamMessages, 'Repetitive Spam (10 messages from 1 user)')

    // Test 4: Mixed scenario - hype with raid injection
    const baseTime = Date.now()
    const mixedMessages: TestMessage[] = [
        ...generateNormalHypeMessages(30, baseTime),
        ...generateRaidMessages(20, baseTime + 7000),
        ...generateNormalHypeMessages(30, baseTime + 10000),
    ]
    mixedMessages.sort((a, b) => a.timestamp - b.timestamp)
    runTest(mixedMessages, 'Mixed: Hype -> Raid -> Hype')

    // Test 5: Gradual hype ramp-up (organic, should NOT trigger)
    const rampMessages: TestMessage[] = []
    for (let wave = 0; wave < 5; wave++) {
        const waveSize = 10 + wave * 10
        rampMessages.push(...generateNormalHypeMessages(waveSize, baseTime + wave * 5000))
    }
    rampMessages.sort((a, b) => a.timestamp - b.timestamp)
    runTest(rampMessages, 'Gradual Hype Ramp-up (organic growth)')

    // Load and test historical log file if provided
    if (logFile && !syntheticOnly) {
        try {
            const fs = await import('fs')
            const content = fs.readFileSync(logFile, 'utf-8')
            const logs: TestMessage[] = JSON.parse(content)
            runTest(logs, `Historical Log: ${logFile}`)
        } catch (err) {
            console.error(`Failed to load log file: ${err}`)
        }
    }

    console.log('\n========================================')
    console.log('TEST HARNESS COMPLETE')
    console.log('========================================\n')
}

main().catch(console.error)
