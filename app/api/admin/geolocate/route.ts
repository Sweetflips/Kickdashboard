import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Cache geolocation results in memory (server-side)
const geoCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export async function GET(request: Request) {
  try {
    // Check admin access - only admins can lookup IPs
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const ip = searchParams.get('ip')

    if (!ip) {
      return NextResponse.json(
        { error: 'IP address required' },
        { status: 400 }
      )
    }

    // Check cache first
    const cached = geoCache.get(ip)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Lookup using ipapi.co with API key
    const apiKey = process.env.IPAPI_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Geolocation service not configured' },
        { status: 500 }
      )
    }

    const response = await fetch(`https://ipapi.co/${ip}/json/?key=${apiKey}`)

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Geolocation lookup failed' },
        { status: response.status }
      )
    }

    const data = await response.json()

    if (data.error) {
      return NextResponse.json(
        { error: data.reason || 'IP lookup failed' },
        { status: 400 }
      )
    }

    const result = {
      country: data.country_name || 'Unknown',
      countryCode: data.country_code || '',
      city: data.city || '',
      region: data.region || '',
      isp: data.org || '',
    }

    // Cache the result
    geoCache.set(ip, { data: result, timestamp: Date.now() })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Geolocation error:', error)
    return NextResponse.json(
      { error: 'Geolocation lookup failed' },
      { status: 500 }
    )
  }
}












