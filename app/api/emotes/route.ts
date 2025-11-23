import { NextResponse } from 'next/server'

const KICK_API_BASE = 'https://kick.com/api'

// In-memory cache for emotes (prevents excessive API calls)
const emoteCache = new Map<string, { data: any; timestamp: number; expiresAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second

// Exponential backoff helper
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries = MAX_RETRIES
): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options)

            // If successful or client error (4xx), return immediately
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response
            }

            // For server errors (5xx), retry with exponential backoff
            if (response.status >= 500 && attempt < retries - 1) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
                console.log(`⚠️ Server error ${response.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`)
                await sleep(delay)
                continue
            }

            return response
        } catch (error) {
            if (attempt === retries - 1) {
                throw error
            }
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt)
            console.log(`⚠️ Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`)
            await sleep(delay)
        }
    }

    throw new Error('Max retries exceeded')
}

// Hardcoded list of Kick's default emoji emotes (fallback)
const DEFAULT_EMOJI_EMOTES = [
    { id: '1730752', name: 'emojiAngel' },
    { id: '1730753', name: 'emojiAngry' },
    { id: '1579033', name: 'emojiAstonished' },
    { id: '1730754', name: 'emojiAwake' },
    { id: '1579036', name: 'emojiBlowKiss' },
    { id: '1730755', name: 'emojiBubbly' },
    { id: '1730756', name: 'emojiCheerful' },
    { id: '1730758', name: 'emojiClown' },
    { id: '1730759', name: 'emojiCool' },
    { id: '1730760', name: 'emojiCrave' },
    { id: '1730761', name: 'emojiCry' },
    { id: '1579040', name: 'emojiCrying' },
    { id: '1730762', name: 'emojiCurious' },
    { id: '1730765', name: 'emojiCute' },
    { id: '1730767', name: 'emojiDead' },
    { id: '1730768', name: 'emojiDevil' },
    { id: '1579041', name: 'emojiDisappoint' },
    { id: '1579042', name: 'emojiDisguise' },
    { id: '1730769', name: 'emojiDJ' },
    { id: '1730770', name: 'emojiDown' },
    { id: '1579044', name: 'emojiEnraged' },
    { id: '1579045', name: 'emojiExcited' },
    { id: '1579054', name: 'emojiEyeRoll' },
    { id: '1730772', name: 'emojiFire' },
    { id: '3419634', name: 'emojiFlag' },
    { id: '1730774', name: 'emojiGamer' },
    { id: '1730775', name: 'emojiGlass' },
    { id: '1730776', name: 'emojiGoofy' },
    { id: '1730782', name: 'emojiGramps' },
    { id: '1579046', name: 'emojiGrimacing' },
    { id: '1730785', name: 'emojiGrin' },
    { id: '1730786', name: 'emojiGrumpy' },
    { id: '1730787', name: 'emojiHappy' },
    { id: '1579047', name: 'emojiHeartEyes' },
    { id: '3419632', name: 'emojiHelmet' },
    { id: '1730788', name: 'emojiHmm' },
    { id: '4200908', name: 'emojiHydrate' },
    { id: '1730789', name: 'emojiKing' },
    { id: '1730790', name: 'emojiKiss' },
    { id: '1730791', name: 'emojiLady' },
    { id: '1579050', name: 'emojiLaughing' },
    { id: '1730792', name: 'emojiLoading' },
    { id: '1730794', name: 'emojiLol' },
    { id: '1730796', name: 'emojiMan' },
    { id: '1579051', name: 'emojiMoneyEyes' },
    { id: '1730798', name: 'emojiNo' },
    { id: '1730799', name: 'emojiOof' },
    { id: '1730800', name: 'emojiOooh' },
    { id: '1730802', name: 'emojiOuch' },
    { id: '1579052', name: 'emojiPleading' },
    { id: '1730803', name: 'emojiRich' },
    { id: '1730807', name: 'emojiShocked' },
    { id: '1730825', name: 'emojiSleep' },
    { id: '1730827', name: 'emojiSmart' },
    { id: '1579055', name: 'emojiSmerking' },
    { id: '1579057', name: 'emojiSmiling' },
    { id: '1730829', name: 'emojiSorry' },
    { id: '1730830', name: 'emojiStare' },
    { id: '1579058', name: 'emojiStarEyes' },
    { id: '1579059', name: 'emojiSwearing' },
    { id: '3419630', name: 'emojiTire' },
    { id: '1579061', name: 'emojiUnamused' },
    { id: '1579062', name: 'emojiVomiting' },
    { id: '1730831', name: 'emojiWink' },
    { id: '1579038', name: 'emojiXEyes' },
    { id: '1730834', name: 'emojiYay' },
    { id: '1730835', name: 'emojiYes' },
    { id: '1730839', name: 'emojiYuh' },
    { id: '1730840', name: 'emojiYum' },
].map(emote => ({
    id: emote.id,
    name: emote.name,
    url: `https://files.kick.com/emotes/${emote.id}/fullsize`,
}))

// Hardcoded list of Kick's default global emotes (fallback)
const DEFAULT_GLOBAL_EMOTES = [
    { id: '3753119', name: 'asmonSmash' },
    { id: '37215', name: 'AYAYA' },
    { id: '4147910', name: 'BBoomer' },
    { id: '39251', name: 'beeBobble' },
    { id: '37217', name: 'Bwop' },
    { id: '39254', name: 'CaptFail' },
    { id: '4148144', name: 'catblobDance' },
    { id: '4147900', name: 'catKISS' },
    { id: '37218', name: 'Clap' },
    { id: '4147909', name: 'coffinPls' },
    { id: '39260', name: 'DanceDance' },
    { id: '37220', name: 'DonoWall' },
    { id: '4147914', name: 'duckPls' },
    { id: '3645850', name: 'EDDIE' },
    { id: '39265', name: 'EDMusiC' },
    { id: '37221', name: 'EZ' },
    { id: '3645852', name: 'FLASHBANG' },
    { id: '39402', name: 'Flowie' },
    { id: '37243', name: 'gachiGASM' },
    { id: '37224', name: 'GIGACHAD' },
    { id: '4055795', name: 'GnomeDisco' },
    { id: '4148076', name: 'HaHaa' },
    { id: '4148074', name: 'HYPERCLAP' },
    { id: '305040', name: 'Kappa' },
    { id: '4147902', name: 'KEKBye' },
    { id: '37225', name: 'KEKLEO' },
    { id: '37226', name: 'KEKW' },
    { id: '39261', name: 'kkHuh' },
    { id: '39272', name: 'LetMeIn' },
    { id: '37227', name: 'LULW' },
    { id: '4148128', name: 'mericCat' },
    { id: '37244', name: 'modCheck' },
    { id: '39273', name: 'MuteD' },
    { id: '37228', name: 'NODDERS' },
    { id: '28631', name: 'NugTime' },
    { id: '4055796', name: 'ODAJAM' },
    { id: '37229', name: 'OOOO' },
    { id: '4147814', name: 'OuttaPocket' },
    { id: '4147892', name: 'PatrickBoo' },
    { id: '37232', name: 'PeepoClap' },
    { id: '37245', name: 'peepoDJ' },
    { id: '37246', name: 'peepoRiot' },
    { id: '39275', name: 'peepoShy' },
    { id: '37233', name: 'PogU' },
    { id: '37230', name: 'POLICE' },
    { id: '39277', name: 'politeCat' },
    { id: '4147888', name: 'ppJedi' },
    { id: '37234', name: 'Prayge' },
    { id: '37248', name: 'ratJAM' },
    { id: '4148081', name: 'Sadge' },
    { id: '4147869', name: 'SaltT' },
    { id: '28633', name: 'SenpaiWhoo' },
    { id: '4055801', name: 'SIT' },
    { id: '4148085', name: 'SUSSY' },
    { id: '37236', name: 'ThisIsFine' },
    { id: '4147896', name: 'TOXIC' },
    { id: '37237', name: 'TriKool' },
    { id: '3645849', name: 'TRUEING' },
    { id: '4147884', name: 'vibePls' },
    { id: '37240', name: 'WeirdChamp' },
    { id: '37239', name: 'WeSmart' },
    { id: '4147873', name: 'YouTried' },
].map(emote => ({
    id: emote.id,
    name: emote.name,
    url: `https://files.kick.com/emotes/${emote.id}/fullsize`,
}))

// Hardcoded list of SweetFlips channel emotes (fallback)
const SWEETFLIPS_CHANNEL_EMOTES = [
    { id: '3124763', name: 'SweetFlipsBlackjack' },
    { id: '3124760', name: 'SweetFlipsBOOM' },
    { id: '3598074', name: 'SweetFlipsBOOMRAZED' },
    { id: '3124762', name: 'SweetFlipsDogHouse' },
    { id: '3423476', name: 'SweetFlipsFrog1' },
    { id: '3423477', name: 'SweetFlipsFrog2' },
    { id: '3423479', name: 'SweetFlipsFrog3' },
    { id: '3423480', name: 'SweetFlipsFrog4' },
    { id: '3423482', name: 'SweetFlipsFrog6' },
    { id: '3423483', name: 'SweetFlipsFrog7' },
    { id: '3423484', name: 'SweetFlipsFrog8' },
    { id: '3423485', name: 'SweetFlipsFrog9' },
    { id: '3423465', name: 'SweetFlipsFroglove' },
    { id: '3124779', name: 'SweetFlipsGates1000' },
    { id: '3124782', name: 'SweetFlipsLenny' },
    { id: '3128033', name: 'SweetFlipsMAXWIN' },
    { id: '3129671', name: 'SweetFlipsPeterDancing' },
    { id: '3124780', name: 'SweetFlipsSweet1000' },
    { id: '3124617', name: 'SweetFlipsSweetbonanza' },
    { id: '3128038', name: 'SweetFlipsSweetflipsAudi' },
    { id: '3127202', name: 'SweetFlipsSweetflipsMccla' },
    { id: '3127201', name: 'SweetFlipsSweetflipsRolls' },
    { id: '3131948', name: 'SweetFlipsThisGameIsShit' },
    { id: '3134429', name: 'SweetFlipsTowerLegend' },
    { id: '3423481', name: 'SweetFlipsFrog5' },
].map(emote => ({
    id: emote.id,
    name: emote.name,
    url: `https://files.kick.com/emotes/${emote.id}/fullsize`,
}))

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const chatroomId = searchParams.get('chatroom_id')
        const slug = searchParams.get('slug') || 'sweetflips'

        // Emote fetching started (no verbose logging)

        if (!chatroomId) {
            // Try to get chatroom_id from channel data first
            try {
                const channelResponse = await fetch(`${KICK_API_BASE}/v2/channels/${slug}`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                })
                if (channelResponse.ok) {
                    const channelData = await channelResponse.json()
                    const extractedChatroomId = channelData.chatroom?.id || channelData.chatroom_id
                    if (extractedChatroomId) {
                        return NextResponse.redirect(
                            new URL(`/api/emotes?chatroom_id=${extractedChatroomId}&slug=${slug}`, request.url)
                        )
                    }
                }
            } catch (e) {
                console.error('Failed to fetch channel data:', e)
            }

            return NextResponse.json(
                { error: 'chatroom_id is required' },
                { status: 400 }
            )
        }

        // Fetch emotes from Kick API
        let emotes: any[] = []
        let emoteData: any = null

        // Step 1: Fetch channel/chatroom data for channel-specific emotes
        // Check cache first
        const channelCacheKey = `channel-${slug}`
        const cachedChannel = emoteCache.get(channelCacheKey)
        let channelResponse: Response | null = null
        let channelData: any = null

        if (cachedChannel && Date.now() < cachedChannel.expiresAt && cachedChannel.data) {
            // Using cached channel data
            channelData = cachedChannel.data
            emoteData = cachedChannel.data

            // Extract emotes from cached channel data
            if (channelData.chatroom?.emotes && Array.isArray(channelData.chatroom.emotes)) {
                emotes = channelData.chatroom.emotes
                // Found emotes from cached channel chatroom
            } else if (channelData.chatroom?.emote_set && Array.isArray(channelData.chatroom.emote_set)) {
                emotes = channelData.chatroom.emote_set
                // Found emotes from cached channel emote_set
            } else if (channelData.emotes && Array.isArray(channelData.emotes)) {
                emotes = channelData.emotes
                // Found emotes from cached channel data
            }
        } else {
            try {
                // Fetching chatroom data
                channelResponse = await fetchWithRetry(`${KICK_API_BASE}/v2/channels/${slug}`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                })

                if (channelResponse && channelResponse.ok) {
                    const fetchedChannelData = await channelResponse.json()
                    channelData = fetchedChannelData
                    emoteData = fetchedChannelData

                    // Cache successful response
                    emoteCache.set(channelCacheKey, {
                        data: channelData,
                        timestamp: Date.now(),
                        expiresAt: Date.now() + CACHE_TTL,
                    })

                    // Extract emotes from chatroom data
                    if (channelData.chatroom?.emotes && Array.isArray(channelData.chatroom.emotes)) {
                        emotes = channelData.chatroom.emotes
                        // Found emotes from channel chatroom
                    } else if (channelData.chatroom?.emote_set && Array.isArray(channelData.chatroom.emote_set)) {
                        emotes = channelData.chatroom.emote_set
                        // Found emotes from channel emote_set
                    } else if (channelData.emotes && Array.isArray(channelData.emotes)) {
                        emotes = channelData.emotes
                        // Found emotes from channel data
                    }
                } else if (channelResponse && channelResponse.status === 401) {
                    // Channel API returned 401, using fallback
                    // Cache 401 responses briefly to avoid hammering the API
                    emoteCache.set(channelCacheKey, {
                        data: null,
                        timestamp: Date.now(),
                        expiresAt: Date.now() + 30000, // 30 second cache for errors
                    })
                } else {
                    // Channel API returned error, using fallback
                }
            } catch (error) {
                // Failed to fetch channel data, using fallback
            }
        }

        // Step 2: Fetch global emotes from Kick public API
        // Check cache first
        const globalCacheKey = 'global-emotes'
        const cachedGlobal = emoteCache.get(globalCacheKey)
        let globalEmotes: any[] = []
        let globalResponse: Response | null = null

        if (cachedGlobal && Date.now() < cachedGlobal.expiresAt && cachedGlobal.data) {
            // Using cached global emotes
            globalEmotes = cachedGlobal.data
        } else {
            try {
                // Fetching global emotes
                globalResponse = await fetchWithRetry(`https://api.kick.com/public/v1/emotes/global`, {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                })

                if (globalResponse && globalResponse.ok) {
                    const contentType = globalResponse.headers.get('content-type')
                    if (contentType && contentType.includes('application/json')) {
                        try {
                            const globalData = await globalResponse.json()
                            if (Array.isArray(globalData)) {
                                globalEmotes = globalData
                            } else if (globalData.emotes && Array.isArray(globalData.emotes)) {
                                globalEmotes = globalData.emotes
                            } else if (globalData.data && Array.isArray(globalData.data)) {
                                globalEmotes = globalData.data
                            }
                            // Found global emotes

                            // Cache successful response
                            emoteCache.set(globalCacheKey, {
                                data: globalEmotes,
                                timestamp: Date.now(),
                                expiresAt: Date.now() + CACHE_TTL,
                            })
                        } catch (parseError) {
                            // Failed to parse global emotes, using fallback
                        }
                    } else {
                        // Global emotes API returned non-JSON, using fallback
                    }
                } else {
                    // Silently handle 401/other errors - fallback will be used
                    if (globalResponse.status === 401) {
                        // Global emotes API returned 401, using fallback
                        // Cache 401 responses briefly to avoid hammering the API
                        emoteCache.set(globalCacheKey, {
                            data: [],
                            timestamp: Date.now(),
                            expiresAt: Date.now() + 30000, // 30 second cache for errors
                        })
                    } else {
                        // Global emotes API returned error, using fallback
                    }
                }
            } catch (error) {
                // Failed to fetch global emotes, using fallback
            }
        }

        // Normalize emotes first (before combining)
        const normalizeEmote = (emote: any) => {
            const emoteId = emote.id || emote.emote_id || emote.emote_set_id
            const name = emote.name || emote.code || emote.text
            const url = emote.url || emote.image_url || emote.src

            let emoteUrl = url
            if (!emoteUrl && emoteId) {
                emoteUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`
            }

            return {
                id: emoteId?.toString(),
                name: name,
                url: emoteUrl,
                original: emote,
            }
        }

        // Normalize channel emotes
        const normalizedChannelEmotes = emotes
            .map(normalizeEmote)
            .filter((e: any) => e.id && e.name)

        // Normalize global emotes
        const normalizedGlobalEmotes = globalEmotes
            .map(normalizeEmote)
            .filter((e: any) => e.id && e.name)

        // Normalized emotes

        // Categorize emotes based on naming patterns
        const categorizeEmotes = (
            channelEmotes: Array<{ id: string; name: string; url?: string; original?: any }>,
            globalEmotes: Array<{ id: string; name: string; url?: string; original?: any }>
        ) => {
            // Capitalize channel slug for matching (e.g., "sweetflips" -> "SweetFlips")
            const capitalizeSlug = (slugStr: string) => {
                if (!slugStr) return ''
                return slugStr
                    .split(/[-_\s]/)
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                    .join('')
            }

            const channelPrefix = capitalizeSlug(slug)
            const emojis: Array<{ id: string; name: string; url?: string; original?: any }> = []
            const channel: Array<{ id: string; name: string; url?: string; original?: any }> = []
            const global: Array<{ id: string; name: string; url?: string; original?: any }> = []

            // Categorize channel emotes
            channelEmotes.forEach((emote) => {
                if (!emote || !emote.name) return

                const emoteNameLower = emote.name.toLowerCase()

                // Check if emote starts with "emoji" (case-insensitive)
                if (emoteNameLower.startsWith('emoji')) {
                    emojis.push(emote)
                }
                // Check if emote starts with channel prefix (case-insensitive)
                else if (channelPrefix && (emote.name.startsWith(channelPrefix) || emoteNameLower.startsWith(channelPrefix.toLowerCase()))) {
                    channel.push(emote)
                }
                // Channel emotes that don't match are still channel emotes
                else {
                    channel.push(emote)
                }
            })

            // All global emotes go to global category
            global.push(...globalEmotes)

            return { emojis, channel, global }
        }

        // Combine channel and global emotes, removing duplicates (channel emotes take precedence)
        const allEmotesMap = new Map<string, any>()

        // Add channel emotes first
        normalizedChannelEmotes.forEach((emote: any) => {
            if (emote.id) {
                allEmotesMap.set(emote.id, emote)
            }
        })

        // Add global emotes (don't overwrite channel emotes)
        normalizedGlobalEmotes.forEach((emote: any) => {
            if (emote.id && !allEmotesMap.has(emote.id)) {
                allEmotesMap.set(emote.id, emote)
            }
        })

        const allEmotes = Array.from(allEmotesMap.values())
        // Total unique emotes calculated

        // If no emotes found in API, try fetching from the chatroom page directly (quiet fallback)
        if (normalizedChannelEmotes.length === 0 && normalizedGlobalEmotes.length === 0) {
            try {
                const pageResponse = await fetch(`https://kick.com/${slug}/chatroom`, {
                    headers: {
                        'Accept': 'text/html',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                })

                if (pageResponse.ok) {
                    const html = await pageResponse.text()

                    // Try multiple patterns to extract emote data
                    const patterns = [
                        /window\.__initialState__\s*=\s*({[\s\S]+?});/,
                        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});/,
                        /"emotes":\s*(\[[^\]]+\])/,
                        /"emote_set":\s*(\[[^\]]+\])/,
                        /"emoteSet":\s*(\[[^\]]+\])/,
                    ]

                    for (const pattern of patterns) {
                        const match = html.match(pattern)
                        if (match) {
                            try {
                                let data: any
                                if (match[1].startsWith('[')) {
                                    // Array match
                                    emotes = JSON.parse(match[1])
                                    break
                                } else {
                                    // Object match
                                    data = JSON.parse(match[1])
                                    // Navigate nested structure
                                    if (data.chatroom?.emotes) {
                                        emotes = Array.isArray(data.chatroom.emotes) ? data.chatroom.emotes : []
                                    } else if (data.chatroom?.emote_set) {
                                        emotes = Array.isArray(data.chatroom.emote_set) ? data.chatroom.emote_set : []
                                    } else if (data.emotes) {
                                        emotes = Array.isArray(data.emotes) ? data.emotes : []
                                    } else if (data.emote_set) {
                                        emotes = Array.isArray(data.emote_set) ? data.emote_set : []
                                    } else if (data.chatroom) {
                                        // Deep search in chatroom object
                                        const chatroomKeys = Object.keys(data.chatroom)
                                        for (const key of chatroomKeys) {
                                            if (key.includes('emote') && Array.isArray(data.chatroom[key])) {
                                                emotes = data.chatroom[key]
                                                break
                                            }
                                        }
                                    }
                                }

                                if (emotes.length > 0) {
                                    // Found emotes from HTML parsing
                                    // Re-normalize and categorize after HTML parsing
                                    const htmlChannelEmotes = emotes.map(normalizeEmote).filter((e: any) => e.id && e.name)
                                    const htmlCategorized = categorizeEmotes(htmlChannelEmotes, normalizedGlobalEmotes)
                                    const htmlAllEmotesMap = new Map<string, any>()
                                    htmlChannelEmotes.forEach((e: any) => htmlAllEmotesMap.set(e.id, e))
                                    normalizedGlobalEmotes.forEach((e: any) => {
                                        if (!htmlAllEmotesMap.has(e.id)) htmlAllEmotesMap.set(e.id, e)
                                    })
                                    return NextResponse.json({
                                        emotes: htmlCategorized,
                                        all: Array.from(htmlAllEmotesMap.values()),
                                        total: htmlAllEmotesMap.size,
                                        chatroom_id: chatroomId,
                                        slug: slug,
                                    })
                                }
                            } catch (e) {
                                console.error('Failed to parse pattern match:', e)
                                continue
                            }
                        }
                    }

                    // Also try to find emote data in script tags
                    if (emotes.length === 0) {
                        const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)
                        for (const scriptMatch of scriptMatches) {
                            const scriptContent = scriptMatch[1]
                            if (scriptContent.includes('emote') || scriptContent.includes('emoteSet')) {
                                try {
                                    const emoteMatches = scriptContent.match(/"emotes":\s*(\[[^\]]+\])/g)
                                    if (emoteMatches) {
                                        for (const emoteMatch of emoteMatches) {
                                            const emoteArrayMatch = emoteMatch.match(/\[.*\]/)
                                            if (emoteArrayMatch) {
                                                const parsed = JSON.parse(emoteArrayMatch[0])
                                                if (Array.isArray(parsed) && parsed.length > 0) {
                                                    emotes = parsed
                                                    // Found emotes from script tag parsing
                                                    break
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {
                                    // Continue trying other scripts
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                // Silently fail - fallback to defaults
            }
        }

        const categorized = categorizeEmotes(normalizedChannelEmotes, normalizedGlobalEmotes)

        // Categorized emotes

        // If no emotes found from API, add default emotes as fallback
        if (allEmotes.length === 0 && normalizedGlobalEmotes.length === 0) {
            // No emotes found from API, using default emotes
            const defaultEmojis = DEFAULT_EMOJI_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))
            const defaultGlobals = DEFAULT_GLOBAL_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))

            categorized.emojis = defaultEmojis
            categorized.global = defaultGlobals
            allEmotes.push(...defaultEmojis, ...defaultGlobals)

            // Added default emotes
        } else if (categorized.global.length === 0 && normalizedGlobalEmotes.length === 0) {
            // If no global emotes found but we have channel emotes, still add default globals
            // No global emotes found, adding defaults
            const defaultGlobals = DEFAULT_GLOBAL_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))

            categorized.global = defaultGlobals
            allEmotes.push(...defaultGlobals)

            // Added default global emotes
        }

        // Always ensure we have default emoji emotes if none found
        if (categorized.emojis.length === 0) {
            // No emoji emotes found, adding defaults
            const defaultEmojis = DEFAULT_EMOJI_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))
            categorized.emojis = defaultEmojis
            allEmotes.push(...defaultEmojis)
            // Added default emoji emotes
        }

        // Always ensure we have default global emotes if none found
        if (categorized.global.length === 0) {
            // No global emotes found, adding defaults
            const defaultGlobals = DEFAULT_GLOBAL_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))
            categorized.global = defaultGlobals
            allEmotes.push(...defaultGlobals)
            // Added default global emotes
        }

        // Add SweetFlips channel emotes as fallback if slug matches and no channel emotes found
        if (slug && slug.toLowerCase() === 'sweetflips' && categorized.channel.length === 0) {
            // No channel emotes found, adding defaults
            const sweetflipsEmotes = SWEETFLIPS_CHANNEL_EMOTES.map(e => ({
                id: e.id,
                name: e.name,
                url: e.url,
            }))
            categorized.channel = sweetflipsEmotes
            allEmotes.push(...sweetflipsEmotes)
            // Added default channel emotes
        }

        // Always return categorized structure, even if empty
        // Simple log: emotes loaded
        console.log(`✅ Emotes loaded: ${allEmotes.length} total`)

        return NextResponse.json({
            emotes: categorized,
            all: allEmotes, // All emotes for backward compatibility
            total: allEmotes.length,
            chatroom_id: chatroomId,
            slug: slug,
            message: allEmotes.length === 0
                ? 'No emotes found in API, but emote IDs from messages will be rendered using standard Kick.com URLs'
                : undefined,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Emotes API error:', errorMessage)
        return NextResponse.json(
            { error: 'Failed to fetch emotes', details: errorMessage },
            { status: 500 }
        )
    }
}
