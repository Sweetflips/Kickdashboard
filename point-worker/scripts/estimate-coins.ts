import { db } from '../lib/db';

async function estimateCoins() {
  // Get all pending jobs with valid sessions
  const jobs = await (db as any).chatJob.findMany({
    where: { 
      status: 'pending',
      stream_session_id: { not: null }
    },
    select: {
      payload: true,
      stream_session_id: true
    }
  });
  
  console.log(`Total jobs with valid sessions: ${jobs.length}`);
  
  // Group by user and session, then estimate coins based on 5-min rate limit
  const userSessionMessages = new Map<string, number[]>(); // key: `userId:sessionId`, value: timestamps
  
  for (const job of jobs) {
    const payload = job.payload as any;
    const senderKickUserId = payload?.sender?.kick_user_id;
    const sessionId = job.stream_session_id?.toString();
    const timestamp = payload?.timestamp;
    
    if (senderKickUserId && sessionId && timestamp) {
      const key = `${senderKickUserId}:${sessionId}`;
      if (!userSessionMessages.has(key)) {
        userSessionMessages.set(key, []);
      }
      userSessionMessages.get(key)!.push(Number(timestamp));
    }
  }
  
  console.log(`Unique user-session combinations: ${userSessionMessages.size}`);
  
  // Estimate coins: count messages that are 5+ minutes apart per user
  const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
  let estimatedCoins = 0;
  let uniqueUsers = new Set<string>();
  
  for (const [key, timestamps] of userSessionMessages) {
    const userId = key.split(':')[0];
    uniqueUsers.add(userId);
    
    // Sort timestamps
    timestamps.sort((a, b) => a - b);
    
    // Count coins (first message always earns, then 5-min gaps)
    let lastCoinTime = 0;
    for (const ts of timestamps) {
      if (ts - lastCoinTime >= RATE_LIMIT_MS) {
        estimatedCoins++;
        lastCoinTime = ts;
      }
    }
  }
  
  console.log(`\n=== ESTIMATE ===`);
  console.log(`Unique chatters: ${uniqueUsers.size}`);
  console.log(`Total messages: ${jobs.length}`);
  console.log(`Estimated coins to be awarded: ~${estimatedCoins}`);
  console.log(`\nNote: Actual coins may be slightly different due to:`);
  console.log(`  - Users who already earned coins recently (before these jobs)`);
  console.log(`  - Processing order variations`);
  
  await (db as any).$disconnect();
}

estimateCoins().catch(console.error);


