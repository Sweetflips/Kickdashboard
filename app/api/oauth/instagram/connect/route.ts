import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { kick_user_id } = body

        if (!kick_user_id) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        // Meta App configuration (Instagram uses Facebook OAuth)
        const appId = process.env.INSTAGRAM_APP_ID
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${baseUrl}/api/oauth/instagram/callback`

        // Basic scopes that work without app review
        // public_profile and email are auto-approved
        const scope = 'public_profile,email'

        if (!appId) {
            console.error('Instagram OAuth Error: INSTAGRAM_APP_ID not configured')
            return NextResponse.json(
                { error: 'Instagram OAuth not configured - INSTAGRAM_APP_ID missing' },
                { status: 500 }
            )
        }

        // Generate state parameter for CSRF protection
        const state = Buffer.from(JSON.stringify({ kick_user_id })).toString('base64')

        // Use Meta OAuth dialog (NOT instagram.com/oauth/authorize)
        const authUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth')
        authUrl.searchParams.set('client_id', appId)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('scope', scope)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('state', state)

        return NextResponse.json({ authUrl: authUrl.toString() })
    } catch (error) {
        console.error('Error initiating Instagram OAuth:', error)
        return NextResponse.json(
            { error: 'Failed to initiate Instagram connection', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
