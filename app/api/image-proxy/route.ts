import { NextResponse } from 'next/server'

/**
 * Proxy endpoint for Kick profile pictures
 * This bypasses CORS and Next.js image restrictions
 * GET /api/image-proxy?url=https://kick.com/img/default-profile-pictures/default2.jpeg
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
            'files.kick.com'
        ]
        const isAllowed = allowedDomains.some(domain => url.hostname.includes(domain))
        if (!isAllowed) {
            return NextResponse.json(
                { error: 'Only Kick.com images are allowed' },
                { status: 400 }
            )
        }

        console.log(`🖼️ Proxying image: ${imageUrl}`)
        console.log(`🖼️ Decoded URL: ${decodeURIComponent(imageUrl)}`)

        // Fetch the image
        const imageResponse = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://kick.com/',
            },
        })

        console.log(`📡 Image fetch response status: ${imageResponse.status}`)
        console.log(`📡 Image fetch response headers:`, Object.fromEntries(imageResponse.headers.entries()))

        if (!imageResponse.ok) {
            const errorText = await imageResponse.text().catch(() => 'Could not read error')
            console.error(`❌ Failed to fetch image: ${imageResponse.status}`)
            console.error(`❌ Error details: ${errorText.substring(0, 200)}`)

            // Fetch default avatar image from public folder via HTTP
            // This works reliably across all deployment environments
            try {
                // Get base URL from headers (works in production with proxies)
                const host = request.headers.get('host') || request.headers.get('x-forwarded-host')
                const proto = request.headers.get('x-forwarded-proto') || 'https'
                const baseUrl = host ? `${proto}://${host}` : 'https://www.sweetflipsrewards.com'
                const defaultImageUrl = `${baseUrl}/kick.jpg`

                console.log(`🔄 Fetching default avatar: ${defaultImageUrl}`)
                const defaultImageResponse = await fetch(defaultImageUrl)

                if (defaultImageResponse.ok) {
                    const defaultImageBuffer = await defaultImageResponse.arrayBuffer()
                    console.log(`✅ Returning default avatar for failed image: ${imageUrl}`)
                    return new NextResponse(defaultImageBuffer, {
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                            'Access-Control-Allow-Origin': '*',
                        },
                    })
                } else {
                    throw new Error(`Failed to fetch default image: ${defaultImageResponse.status}`)
                }
            } catch (defaultError) {
                // If we can't fetch default image, return JSON error as fallback
                console.error(`❌ Failed to fetch default image:`, defaultError)
                return NextResponse.json(
                    {
                        error: `Failed to fetch image: ${imageResponse.status}`,
                        details: errorText.substring(0, 200),
                        url: imageUrl
                    },
                    { status: imageResponse.status }
                )
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
