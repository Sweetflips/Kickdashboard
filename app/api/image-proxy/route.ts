import { NextResponse } from 'next/server'

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
            const baseUrl = host ? `${proto}://${host}` : 'https://www.sweetflipsrewards.com'
            const defaultImageUrl = `${baseUrl}/kick.jpg`

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

        console.log(`🖼️ Proxying image: ${imageUrl}`)
        console.log(`🖼️ Decoded URL: ${decodeURIComponent(imageUrl)}`)

        // Fetch the image with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        let imageResponse: Response
        try {
            // First try standard fetch
            imageResponse = await fetch(imageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://kick.com/',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                },
                signal: controller.signal,
            })

            // If 403 with stream.kick.com, try without Referer or with modified headers
            if (imageResponse.status === 403 && imageUrl.includes('stream.kick.com')) {
                console.log('⚠️ 403 Forbidden - Retrying without Referer header')

                // Some CDNs block specific Referers, or require none
                imageResponse = await fetch(imageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': '*/*'
                    },
                    signal: controller.signal,
                })
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

        console.log(`📡 Image fetch response status: ${imageResponse.status}`)

        if (!imageResponse.ok) {
            // Cache failed requests (especially 403/404) to avoid repeated attempts
            if (imageResponse.status === 403 || imageResponse.status === 404 || imageResponse.status === 408) {
                failedImageCache.set(imageUrl, { timestamp: Date.now() })
            }

            // Fetch default avatar image from public folder via HTTP
            try {
                // Get base URL from headers (works in production with proxies)
                const host = request.headers.get('host') || request.headers.get('x-forwarded-host')
                const proto = request.headers.get('x-forwarded-proto') || 'https'
                const baseUrl = host ? `${proto}://${host}` : 'https://www.sweetflipsrewards.com'
                const defaultImageUrl = `${baseUrl}/kick.jpg`

                console.log(`🔄 Fetching default avatar: ${defaultImageUrl}`)
                const defaultImageResponse = await fetch(defaultImageUrl, {
                    signal: AbortSignal.timeout(5000), // 5 second timeout for default image
                })

                if (defaultImageResponse.ok) {
                    const defaultImageBuffer = await defaultImageResponse.arrayBuffer()
                    console.log(`✅ Returning default avatar for failed image: ${imageUrl.substring(0, 80)}...`)
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

        console.log(`✅ Successfully proxied image: ${imageUrl} (${contentType})`)

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
