import { acquireRateLimitSlot } from './kick-api'
import { memoryCache } from './memory-cache'

export interface KickV2ChannelVideo {
  // raw id (video list item id)
  id: string
  // Kick VOD id (used for videos.kick.com thumbnails)
  vodId: string | null
  title: string | null
  startTime: Date | null
  durationMs: number | null
  thumbnailUrl: string | null
}

function parseKickTimestamp(input: unknown): Date | null {
  if (!input) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input

  const raw = String(input).trim()
  if (!raw) return null

  // ISO (with timezone)
  if (raw.includes('T') && (raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw))) {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }

  // Kick often returns "YYYY-MM-DD HH:mm:ss" (no timezone). Treat as UTC.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw.replace(' ', 'T') + 'Z')
    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function getVideoTitle(video: any): string | null {
  if (typeof video?.title === 'string' && video.title.trim()) return video.title.trim()
  if (typeof video?.session_title === 'string' && video.session_title.trim()) return video.session_title.trim()
  if (typeof video?.video?.title === 'string' && video.video.title.trim()) return video.video.title.trim()
  return null
}

function getVideoThumbnailUrl(video: any): string | null {
  const thumb = video?.thumbnail
  if (typeof thumb === 'string' && thumb.trim()) return thumb.trim()
  if (thumb && typeof thumb === 'object') {
    if (typeof thumb.url === 'string' && thumb.url.trim()) return thumb.url.trim()
    if (typeof thumb.src === 'string' && thumb.src.trim()) return thumb.src.trim()
  }
  if (typeof video?.thumb === 'string' && video.thumb.trim()) return video.thumb.trim()
  return null
}

function getVodId(video: any): string | null {
  // Kick has shipped multiple shapes over time:
  // - { video: { id } } (common)
  // - { id } (sometimes the VOD id is top-level)
  // - legacy aliases
  const raw = video?.video?.id ?? video?.id ?? video?.kick_video_id ?? video?.kickVideoId
  if (raw === null || raw === undefined) return null
  const str = String(raw).trim()
  return str ? str : null
}

async function fetchKickV2VideosUncached(slug: string): Promise<KickV2ChannelVideo[]> {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug.toLowerCase())}/videos`
  const release = await acquireRateLimitSlot()
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return []
    }

    const json = await res.json()
    if (!Array.isArray(json)) return []

    return json.map((v: any) => ({
      id: String(v?.id ?? ''),
      vodId: getVodId(v),
      title: getVideoTitle(v),
      startTime: parseKickTimestamp(v?.start_time ?? v?.created_at),
      durationMs: typeof v?.duration === 'number' ? v.duration : null,
      thumbnailUrl: getVideoThumbnailUrl(v),
    }))
  } catch {
    return []
  } finally {
    release()
  }
}

export async function fetchKickV2ChannelVideos(slug: string, ttlMs: number = 2 * 60 * 1000): Promise<KickV2ChannelVideo[]> {
  const key = `kick_v2_videos:${slug.toLowerCase()}`
  return memoryCache.getOrSet(key, () => fetchKickV2VideosUncached(slug), ttlMs)
}
