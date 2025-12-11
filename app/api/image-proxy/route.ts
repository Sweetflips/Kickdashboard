import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Cache for failed image requests to avoid repeated attempts
const failedImageCache = new Map<string, { timestamp: number }>()
const FAILED_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Proxy endpoint for Kick profile pictures and thumbnails
 * This bypasses CORS and Next.js image restrictions
 * GET /api/image-proxy?url=https://stream.kick.com/thumbnails/livestream/123.jpg
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const imageUrl = searchParams.get('url')

        if (!imageUrl) {
            return NextResponse.json(
                { error: 'Image URL is required' },
                { status: 400 }
            )
        }

        // Validate URL is from Kick domain or Kick's CDN
        const url = new URL(imageUrl)
        const allowedDomains = [
            'kick.com',
            'cloudfront.net',
            'amazonaws.com',
            'files.kick.com',
            'stream.kick.com', // For stream thumbnails
            'api.kick.com', // Kick Dev API thumbnails
        ]
        const isAllowed = allowedDomains.some(domain => url.hostname.includes(domain))
        if (!isAllowed) {
            return NextResponse.json(
                { error: 'Only Kick.com images are allowed' },
                { status: 400 }
            )
        }

        // Check if this URL recently failed (avoid repeated failed requests)
        const failedCacheEntry = failedImageCache.get(imageUrl)
        if (failedCacheEntry && Date.now() - failedCacheEntry.timestamp < FAILED_CACHE_TTL) {
            console.log(`⏭️ Skipping recently failed image: ${imageUrl.substring(0, 80)}...`)
            // Return default avatar immediately for recently failed URLs
            const host = request.headers.get('host') || request.headers.get('x-forwarded-host')
            const proto = request.headers.get('x-forwarded-proto') || 'https'
            const baseUrl = host ? `${proto}://${host}` : 'https://kickdashboard.com'
            const defaultImageUrl = `${baseUrl}/icons/kick.jpg`

            try {
                const defaultImageResponse = await fetch(defaultImageUrl)
                if (defaultImageResponse.ok) {
                    const defaultImageBuffer = await defaultImageResponse.arrayBuffer()
                    return new NextResponse(defaultImageBuffer, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
                            'Access-Control-Allow-Origin': '*',
                        },
                    })
                }
            } catch {
                // Fall through to error response
            }
        }

        // Fetch the image with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        let imageResponse: Response
        const isEmote = imageUrl.includes('files.kick.com/emotes')
        const isStreamThumbnail = imageUrl.includes('stream.kick.com')

        // For stream thumbnails, use minimal headers initially to avoid 403s
        const getInitialHeaders = (): Record<string, string> => {
            if (isStreamThumbnail) {
                return {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*,*/*;q=0.8'
                }
            }
            return {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://kick.com/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            }
        }

        try {
            // First try with appropriate headers based on image type
            imageResponse = await fetch(imageUrl, {
                headers: getInitialHeaders(),
                signal: controller.signal,
            })

            // Handle 403 errors with fallback strategies
            if (imageResponse.status === 403) {
                // For emotes, try alternate URL formats
                if (isEmote) {
                    const emoteIdMatch = imageUrl.match(/emotes\/(\d+)/)
                    if (emoteIdMatch) {
                        const emoteId = emoteIdMatch[1]
                        const fullsizeUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`

                        // Only try fullsize if different from original URL
                        if (fullsizeUrl !== imageUrl) {
                            console.log(`⚠️ Emote 403 - Trying fullsize format: ${fullsizeUrl}`)
                            try {
                                const fallbackResponse = await fetch(fullsizeUrl, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                        'Accept': 'image/*,*/*;q=0.8'
                                    },
                                    signal: controller.signal,
                                })

                                if (fallbackResponse.ok) {
                                    imageResponse = fallbackResponse
                                    clearTimeout(timeoutId)
                                    // Continue to success path
                                } else {
                                    // Try 1x format as last resort
                                    const onexUrl = `https://files.kick.com/emotes/${emoteId}/1x`
                                    console.log(`⚠️ Fullsize failed - Trying 1x format: ${onexUrl}`)
                                    const onexResponse = await fetch(onexUrl, {
                                        headers: {
                                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                            'Accept': 'image/*,*/*;q=0.8'
                                        },
                                        signal: controller.signal,
                                    })

                                    if (onexResponse.ok) {
                                        imageResponse = onexResponse
                                        clearTimeout(timeoutId)
                                    }
                                }
                            } catch (fallbackError) {
                                // Fall through to error handling
                            }
                        }
                    }
                }

                // For stream thumbnails, try additional header strategies
                if (isStreamThumbnail && imageResponse.status === 403) {
                    console.log('⚠️ Stream thumbnail 403 - Trying alternate header strategies')

                    // Strategy 1: No headers at all
                    try {
                        imageResponse = await fetch(imageUrl, {
                            signal: controller.signal,
                        })
                        if (imageResponse.ok) {
                            clearTimeout(timeoutId)
                            // Continue to success path
                        }
                    } catch {
                        // Try next strategy
                    }

                    // Strategy 2: Minimal headers with different User-Agent
                    if (!imageResponse.ok) {
                        try {
                            imageResponse = await fetch(imageUrl, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0',
                                    'Accept': '*/*'
                                },
                                signal: controller.signal,
                            })
                            if (imageResponse.ok) {
                                clearTimeout(timeoutId)
                            }
                        } catch {
                            // Fall through to error handling
                        }
                    }
                }
            }

            clearTimeout(timeoutId)
        } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                console.error(`⏱️ Image fetch timeout: ${imageUrl.substring(0, 80)}...`)
            } else {
                console.error(`❌ Image fetch error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`)
            }
            // Fall through to default avatar
            imageResponse = new Response(null, { status: 408 }) // Timeout status
        }

        if (!imageResponse.ok) {
            // Cache failed requests (especially 403/404) to avoid repeated attempts
            if (imageResponse.status === 403 || imageResponse.status === 404 || imageResponse.status === 408) {
                failedImageCache.set(imageUrl, { timestamp: Date.now() })
            }

            // For emotes, return transparent 1x1 PNG instead of default avatar
            if (isEmote) {
                // Transparent 1x1 PNG (base64 encoded)
                const transparentPng = Buffer.from(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    'base64'
                )
                return new NextResponse(transparentPng, {
                    headers: {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
                        'Access-Control-Allow-Origin': '*',
                    },
                })
            }

            // For stream thumbnails and other images, try default avatar
            try {
                // Get base URL from headers (works in production with proxies)
                const host = request.headers.get('host') || request.headers.get('x-forwarded-host')
                const proto = request.headers.get('x-forwarded-proto') || 'https'
                const baseUrl = host ? `${proto}://${host}` : 'https://kickdashboard.com'
                const defaultImageUrl = `${baseUrl}/icons/kick.jpg`

                const defaultImageResponse = await fetch(defaultImageUrl, {
                    signal: AbortSignal.timeout(5000), // 5 second timeout for default image
                })

                if (defaultImageResponse.ok) {
                    const defaultImageBuffer = await defaultImageResponse.arrayBuffer()
                    return new NextResponse(defaultImageBuffer, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'public, max-age=300', // Cache for 5 minutes (shorter for fallbacks)
                            'Access-Control-Allow-Origin': '*',
                        },
                    })
                }
            } catch (defaultError) {
                // Return failed status if default image also fails
                return new NextResponse(null, { status: imageResponse.status })
            }
        }

        // Get the image data
        const imageBuffer = await imageResponse.arrayBuffer()
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

        // Return the image with proper headers
        return new NextResponse(imageBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                'Access-Control-Allow-Origin': '*',
            },
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Image proxy error:`, error)
        return NextResponse.json(
            {
                error: 'Failed to proxy image',
                details: errorMessage,
            },
            { status: 500 }
        )
    }
}
