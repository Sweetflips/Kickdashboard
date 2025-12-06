import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const KICK_API_BASE = 'https://api.kick.com/public/v1'

// Decode JWT token without verification (just to get user info)
function decodeToken(token: string): any {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) {
            console.warn('⚠️ Token does not have 3 parts (not a JWT)')
            return null
        }

        // Handle base64url encoding (JWT standard)
        const payload = parts[1]
        // Replace base64url characters with base64 characters
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        // Add padding if needed
        const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        const parsed = JSON.parse(decoded)

        return parsed
    } catch (error) {
        console.error('❌ Token decoding error:', error instanceof Error ? error.message : 'Unknown error')
        // Try regular base64 as fallback
        try {
            const parts = token.split('.')
            if (parts.length !== 3) return null
            const payload = parts[1]
            const decoded = Buffer.from(payload, 'base64').toString('utf-8')
            return JSON.parse(decoded)
        } catch {
            return null
        }
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const accessToken = searchParams.get('access_token')

        if (!accessToken) {
            console.error('❌ [ERROR] Access token not provided')
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 401 }
            )
        }


        // Note: Kick uses opaque tokens (not JWTs), so we don't validate format here
        // Just ensure it's not empty
        if (!accessToken || accessToken.trim().length === 0) {
            console.error('❌ [TOKEN VALIDATION] Empty token provided')
            return NextResponse.json(
                {
                    error: 'Invalid token',
                    details: 'Access token is required and cannot be empty.',
                },
                { status: 401 }
            )
        }

        // Optional: Verify token is valid and has required scopes via introspection
        // Only log if KICK_INTROSPECTION_LOGS env var is set to '1'
        if (process.env.KICK_INTROSPECTION_LOGS === '1') {
            try {
                const introspectResponse = await fetch(`${KICK_API_BASE}/token/introspect`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                })

                if (introspectResponse.ok) {
                    const introspectData = await introspectResponse.json()

                    if (introspectData.active === false) {
                        return NextResponse.json(
                            {
                                error: 'Token is not active',
                                details: 'The access token is invalid or expired.',
                                suggestion: 'Please log out and log in again.',
                            },
                            { status: 401 }
                        )
                    }

                    // Check if token has required scopes
                    const scopes = introspectData.scope ? introspectData.scope.split(' ').filter((s: string) => s.length > 0) : []
                    const requiredScopes = ['user:read']
                    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope))

                    if (missingScopes.length > 0) {
                        console.warn(`⚠️ Token missing required scopes: ${missingScopes.join(', ')}`)
                        console.warn(`📋 Token has scopes: ${scopes.join(', ')}`)
                    } else {
                        console.log(`✅ Token has required scopes: ${scopes.join(', ')}`)
                    }
                } else {
                    console.warn(`⚠️ Token introspection failed, proceeding anyway: ${introspectResponse.status}`)
                }
            } catch (introspectError) {
                console.warn(`⚠️ Token introspection error, proceeding anyway:`, introspectError)
            }
        }

        // According to Kick API docs: GET /public/v1/users (no params) returns currently authorized user
        // Response format: { "data": [{ "email": "...", "name": "...", "profile_picture": "...", "user_id": 1 }], "message": "..." }
        const endpoint = `${KICK_API_BASE}/users`


        let response: Response | null = null
        let lastError: string | null = null

        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                },
            })


            if (response.ok) {
                const apiResponse = await response.json()

                // Kick API wraps data in { "data": [...], "message": "..." }
                const userDataArray = apiResponse.data || []

                if (!Array.isArray(userDataArray) || userDataArray.length === 0) {
                    lastError = 'API returned empty data array'
                    console.warn(`⚠️ Empty or invalid data array`)
                } else {
                    // Get first user (should be the currently authorized user)
                    const userData = userDataArray[0]

                    // Extract user info according to Kick API format:
                    // { email, name, profile_picture, user_id }
                    // Note: profile_picture can be null or a URL string
                    let profilePictureUrl = userData.profile_picture

                    // Ensure profile_picture is a valid URL or null
                    if (profilePictureUrl && typeof profilePictureUrl === 'string' && profilePictureUrl.trim() !== '') {
                        // Keep the URL as-is (Kick returns full URLs like https://kick.com/img/default-profile-pictures/default2.jpeg)
                        profilePictureUrl = profilePictureUrl.trim()
                    } else {
                        profilePictureUrl = null
                    }

                    // SECURITY: Do NOT expose is_admin to client responses
                    // Admin status is verified server-side via isAdmin() in lib/auth.ts
                    const kickUserId = BigInt(userData.user_id)

                    const extractedData = {
                        id: userData.user_id,
                        username: userData.name, // Kick uses "name" not "username"
                        email: userData.email,
                        profile_picture: profilePictureUrl,
                        // NOTE: is_admin intentionally NOT included - prevents client-side spoofing
                        ...userData // Include all other fields from Kick API
                    }

                    // If we got valid data, save to database and return it
                    if (extractedData.id || extractedData.username) {
                        // Save profile picture to database if user exists
                        if (extractedData.id) {
                            try {
                                const kickUserId = BigInt(extractedData.id)

                                // Check if user exists first
                                const existingUserForUpdate = await db.user.findUnique({
                                    where: { kick_user_id: kickUserId },
                                    select: {
                                        id: true,
                                        username: true,
                                        profile_picture_url: true,
                                        custom_profile_picture_url: true,
                                    },
                                })

                                if (existingUserForUpdate) {
                                    await db.user.update({
                                        where: { kick_user_id: kickUserId },
                                        data: {
                                            profile_picture_url: profilePictureUrl,
                                            username: extractedData.username,
                                            email: extractedData.email,
                                        },
                                    })
                                } else {
                                    await db.user.create({
                                        data: {
                                            kick_user_id: kickUserId,
                                            username: extractedData.username,
                                            email: extractedData.email,
                                            profile_picture_url: profilePictureUrl,
                                        },
                                    })
                                }
                            } catch (dbError) {
                                console.error('❌ [DATABASE ERROR] Failed to save user profile picture:', dbError instanceof Error ? dbError.message : 'Unknown error')
                                // Don't fail the request if DB save fails
                            }
                        }

                        return NextResponse.json(extractedData)
                    }

                    lastError = 'User data has no valid user_id or name'
                }
            } else {
                const errorText = await response.text()
                lastError = `${response.status} - ${errorText}`

                // Only log 401 errors at warning level (expected when tokens expire)
                // Full error logging happens in token refresh handler
                if (response.status === 401) {
                    console.warn(`⚠️ Token expired for /api/user endpoint - token refresh will be attempted`)
                } else {
                    console.error(`❌ API error: ${lastError}`)
                }
            }
        } catch (err) {
            lastError = err instanceof Error ? err.message : 'Unknown error'
            console.error(`❌ Error fetching from endpoint:`, err)
        }

        // If API call failed, return error with details
        return NextResponse.json(
            {
                error: 'Failed to fetch user info',
                details: lastError || 'Unknown error',
                message: 'Unable to fetch user data from Kick API. The token may be invalid or expired.',
                suggestion: 'Try logging out and logging in again.',
            },
            { status: response?.status || 404 }
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to fetch user info', details: errorMessage },
            { status: 500 }
        )
    }
}
