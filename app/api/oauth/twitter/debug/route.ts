import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// Debug endpoint to check Twitter OAuth configuration
export async function GET() {
    const clientId = process.env.TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const redirectUri = process.env.TWITTER_REDIRECT_URI || `${baseUrl}/api/oauth/twitter/callback`

    // Generate sample PKCE values
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

    const state = Buffer.from(JSON.stringify({ kick_user_id: 'TEST_USER' })).toString('base64url')

    const params = new URLSearchParams({
        client_id: clientId || 'MISSING',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'users.read tweet.read',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    })

    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

    return NextResponse.json({
        config: {
            TWITTER_CLIENT_ID: clientId ? `${clientId.slice(0, 8)}...` : 'NOT SET ❌',
            TWITTER_CLIENT_SECRET: clientSecret ? 'SET ✅' : 'NOT SET (OK for public clients)',
            TWITTER_REDIRECT_URI: process.env.TWITTER_REDIRECT_URI || 'NOT SET (using fallback)',
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
            computed_redirect_uri: redirectUri,
        },
        auth_url_preview: authUrl,
        checklist: {
            '1_client_id_set': !!clientId,
            '2_redirect_uri': redirectUri,
            '3_scopes': 'users.read tweet.read',
        },
        twitter_portal_checklist: [
            '1. Go to: https://developer.twitter.com/en/portal/dashboard',
            '2. Select your app → User authentication settings → Edit',
            '3. Verify OAuth 2.0 is ENABLED',
            '4. Type of App: "Web App, Automated App or Bot"',
            '5. App permissions: At least "Read"',
            `6. Callback URL MUST be EXACTLY: ${redirectUri}`,
            '7. Website URL must be set',
            '8. If app is in Development mode, your Twitter account must be added as a test user',
        ],
        common_errors: {
            'Something went wrong': [
                'Redirect URI mismatch - must be EXACTLY as registered',
                'OAuth 2.0 not enabled in app settings',
                'App is suspended or pending approval',
                'Scopes not enabled (need Read permission for users.read)',
                'App in Development mode but user not added as test user',
            ],
        },
    }, { status: 200 })
}
