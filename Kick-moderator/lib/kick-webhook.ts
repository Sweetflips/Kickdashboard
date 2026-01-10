import { createVerify } from 'crypto'

const KICK_API_BASE = process.env.KICK_API_BASE || 'https://api.kick.com/public/v1'

let cachedPublicKey: { key: string; fetchedAt: number } | null = null
const PUBLIC_KEY_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export async function getKickPublicKeyPem(): Promise<string> {
    const now = Date.now()
    if (cachedPublicKey && now - cachedPublicKey.fetchedAt < PUBLIC_KEY_TTL_MS) {
        return cachedPublicKey.key
    }

    const res = await fetch(`${KICK_API_BASE}/public-key`, {
        headers: {
            'Accept': 'application/json, text/plain;q=0.9, */*;q=0.8',
        },
        cache: 'no-store',
    })

    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to fetch Kick public key: ${res.status} ${text.slice(0, 200)}`)
    }

    const contentType = res.headers.get('content-type') || ''
    let key: string | null = null

    if (contentType.includes('application/json')) {
        const data: any = await res.json().catch(() => null)
        key =
            (typeof data?.public_key === 'string' && data.public_key) ||
            (typeof data?.publicKey === 'string' && data.publicKey) ||
            (typeof data?.data?.public_key === 'string' && data.data.public_key) ||
            null
    } else {
        key = await res.text().catch(() => null)
    }

    if (!key || typeof key !== 'string' || !key.trim()) {
        throw new Error('Kick public key response did not contain a valid key')
    }

    key = key.trim()

    cachedPublicKey = { key, fetchedAt: now }
    return key
}

export function verifyKickWebhookSignature(params: {
    messageId: string
    messageTimestamp: string
    rawBody: string
    signatureBase64: string
    publicKeyPem: string
}): boolean {
    const { messageId, messageTimestamp, rawBody, signatureBase64, publicKeyPem } = params

    // Per Kick docs: signature is created from:
    // Kick-Event-Message-Id . Kick-Event-Message-Timestamp . raw body
    const signedPayload = `${messageId}.${messageTimestamp}.${rawBody}`

    const verifier = createVerify('RSA-SHA256')
    verifier.update(signedPayload)
    verifier.end()

    try {
        return verifier.verify(publicKeyPem, signatureBase64, 'base64')
    } catch {
        return false
    }
}
