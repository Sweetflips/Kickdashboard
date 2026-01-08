import 'dotenv/config'
import { db } from '../lib/db'

async function testEndpoints() {
    console.log('=== KICK DASHBOARD DIAGNOSTIC ===\n');
    
    // Test 1: Check active stream session in database
    console.log('1. Checking database for active stream session...');
    try {
        const activeSession = await (db as any).streamSession.findFirst({
            where: {
                channel_slug: 'sweetflips',
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        });
        
        if (activeSession) {
            console.log('   ✅ Active session found!');
            console.log('   Session ID:', activeSession.id.toString());
            console.log('   Started at:', activeSession.started_at.toISOString());
            console.log('   Total messages:', activeSession.total_messages);
            console.log('   Peak viewers:', activeSession.peak_viewer_count);
            console.log('   Last live check:', activeSession.last_live_check_at?.toISOString() || 'never');
        } else {
            console.log('   ❌ No active session found!');
            
            // Check most recent session
            const recentSession = await (db as any).streamSession.findFirst({
                where: { channel_slug: 'sweetflips' },
                orderBy: { started_at: 'desc' },
            });
            if (recentSession) {
                console.log('   Most recent session:', recentSession.id.toString());
                console.log('   Ended at:', recentSession.ended_at?.toISOString() || 'still active?');
            }
        }
    } catch (e: any) {
        console.log('   ERROR:', e.message);
    }
    
    // Test 2: v2 API (unofficial)
    console.log('\n2. Testing kick.com/api/v2/channels/sweetflips...');
    try {
        const v2Res = await fetch('https://kick.com/api/v2/channels/sweetflips', {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
        });
        console.log('   Status:', v2Res.status);
        if (v2Res.ok) {
            const data = await v2Res.json() as any;
            console.log('   is_live:', data.livestream ? 'true' : 'false');
            console.log('   viewer_count:', data.livestream?.viewer_count || 0);
            console.log('   followers_count:', data.followers_count || 0);
        } else {
            const text = await v2Res.text();
            console.log('   ERROR: API returned', v2Res.status, text.substring(0, 100));
        }
    } catch (e: any) {
        console.log('   ERROR:', e.message);
    }
    
    // Test 2: Check env vars
    console.log('\n2. Checking environment variables...');
    const envVars = [
        'KICK_CLIENT_ID',
        'KICK_CLIENT_SECRET', 
        'KICK_USER_CLIENT_ID',
        'KICK_USER_CLIENT_SECRET',
        'KICK_BOT_CLIENT_ID',
        'KICK_BOT_CLIENT_SECRET',
        'KICK_CHANNEL_SLUG',
        'KICK_WEBHOOK_PUBLIC_KEY',
        'REDIS_URL',
        'DATABASE_URL'
    ];
    
    for (const v of envVars) {
        const val = process.env[v];
        if (val) {
            console.log('   ' + v + ': SET (' + val.substring(0, 20) + '...)');
        } else {
            console.log('   ' + v + ': NOT SET');
        }
    }
    
    // Test 3: Official API without auth
    console.log('\n3. Testing official api.kick.com/public/v1/livestreams (no auth)...');
    try {
        const officialRes = await fetch('https://api.kick.com/public/v1/livestreams?limit=10', {
            headers: {
                'Accept': 'application/json',
            }
        });
        console.log('   Status:', officialRes.status);
        if (officialRes.status === 401) {
            console.log('   (401 = Needs authentication)');
        } else if (officialRes.ok) {
            const data = await officialRes.json() as any;
            console.log('   Got', data.data?.length || 0, 'livestreams');
        }
    } catch (e: any) {
        console.log('   ERROR:', e.message);
    }

    // Test 4: Official API with auth (if credentials available)
    const clientId = process.env.KICK_CLIENT_ID || process.env.KICK_USER_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET || process.env.KICK_USER_CLIENT_SECRET;
    
    if (clientId && clientSecret) {
        console.log('\n4. Testing OAuth token request...');
        try {
            const tokenRes = await fetch('https://id.kick.com/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                }),
            });
            console.log('   Token request status:', tokenRes.status);
            if (tokenRes.ok) {
                const tokenData = await tokenRes.json() as any;
                console.log('   Got access token:', tokenData.access_token?.substring(0, 20) + '...');
                
                // Test authenticated API call
                console.log('\n5. Testing authenticated /livestreams call...');
                const authRes = await fetch('https://api.kick.com/public/v1/livestreams?limit=100', {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        'Accept': 'application/json',
                    }
                });
                console.log('   Status:', authRes.status);
                if (authRes.ok) {
                    const lsData = await authRes.json() as any;
                    console.log('   Got', lsData.data?.length || 0, 'livestreams');
                    
                    // Check if sweetflips is in the list
                    const sweetflips = lsData.data?.find((ls: any) => 
                        ls.slug?.toLowerCase() === 'sweetflips' ||
                        ls.channel_slug?.toLowerCase() === 'sweetflips' ||
                        ls.channel?.slug?.toLowerCase() === 'sweetflips'
                    );
                    if (sweetflips) {
                        console.log('   ✅ Found sweetflips in livestreams!');
                        console.log('   broadcaster_user_id:', sweetflips.broadcaster_user_id);
                    } else {
                        console.log('   sweetflips not found in livestreams (offline or not in top 100)');
                    }
                } else {
                    const text = await authRes.text();
                    console.log('   ERROR:', text.substring(0, 200));
                }
            } else {
                const text = await tokenRes.text();
                console.log('   ERROR:', text.substring(0, 200));
            }
        } catch (e: any) {
            console.log('   ERROR:', e.message);
        }
    } else {
        console.log('\n4. Skipping OAuth test - KICK_CLIENT_ID/SECRET not set');
    }
    
    // Test 5: Redis connection and leaderboard data
    console.log('\n6. Testing Redis connection...');
    if (process.env.REDIS_URL) {
        try {
            const Redis = (await import('ioredis')).default;
            const redis = new Redis(process.env.REDIS_URL);
            await redis.ping();
            console.log('   ✅ Redis connected successfully');
            
            // Check leaderboard keys
            const keys = await redis.keys('leaderboard:*');
            console.log('   Leaderboard keys:', keys.length);
            if (keys.length > 0) {
                for (const key of keys.slice(0, 5)) {
                    const count = await redis.zcard(key);
                    const top5 = await redis.zrevrange(key, 0, 4, 'WITHSCORES');
                    console.log('   -', key, ':', count, 'entries');
                    if (top5.length > 0) {
                        console.log('     Top entries:', top5.slice(0, 10));
                    }
                }
            }
            
            // Check rate limit keys
            const rateKeys = await redis.keys('rate:*');
            console.log('   Rate limit keys:', rateKeys.length);
            
            // Check coin balance keys
            const coinKeys = await redis.keys('coins:*');
            console.log('   Coin balance keys:', coinKeys.length);
            
            // Check session keys
            const sessionKeys = await redis.keys('session:*');
            console.log('   Session keys:', sessionKeys.length);
            
            // Check chat buffer
            const bufferSize = await redis.llen('chat:buffer');
            console.log('   Chat buffer size:', bufferSize);
            
            await redis.quit();
        } catch (e: any) {
            console.log('   ERROR:', e.message);
        }
    } else {
        console.log('   REDIS_URL not set');
    }
    
    // Test 6: Check SweetCoinHistory for this session
    console.log('\n7. Checking SweetCoinHistory in database...');
    try {
        const activeSession = await (db as any).streamSession.findFirst({
            where: {
                channel_slug: 'sweetflips',
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        });
        
        if (activeSession) {
            const coinHistory = await (db as any).sweetCoinHistory.count({
                where: { stream_session_id: activeSession.id },
            });
            console.log('   Coins awarded this session:', coinHistory);
            
            const recentCoins = await (db as any).sweetCoinHistory.findMany({
                where: { stream_session_id: activeSession.id },
                orderBy: { earned_at: 'desc' },
                take: 5,
            });
            
            if (recentCoins.length > 0) {
                console.log('   Recent coin awards:');
                for (const coin of recentCoins) {
                    console.log('     - user_id:', coin.user_id.toString(), ':', coin.sweet_coins_earned, 'coins at', coin.earned_at.toISOString());
                }
            }
        }
    } catch (e: any) {
        console.log('   ERROR:', e.message);
    }
    
    // Test 7: Check chat messages for this session
    console.log('\n8. Checking ChatMessages in database...');
    try {
        const activeSession = await (db as any).streamSession.findFirst({
            where: {
                channel_slug: 'sweetflips',
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        });
        
        if (activeSession) {
            const messageCount = await (db as any).chatMessage.count({
                where: { stream_session_id: activeSession.id },
            });
            console.log('   Messages this session:', messageCount);
            
            const recentMessages = await (db as any).chatMessage.findMany({
                where: { stream_session_id: activeSession.id },
                orderBy: { timestamp: 'desc' },
                take: 5,
                select: {
                    sender_username: true,
                    sweet_coins_earned: true,
                    content: true,
                },
            });
            
            if (recentMessages.length > 0) {
                console.log('   Recent messages:');
                for (const msg of recentMessages) {
                    console.log('     -', msg.sender_username, '(', msg.sweet_coins_earned, 'coins):', msg.content.substring(0, 30));
                }
            }
        }
    } catch (e: any) {
        console.log('   ERROR:', e.message);
    }
    
    await (db as any).$disconnect();
}

testEndpoints().catch(console.error);

