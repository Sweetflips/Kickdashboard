#!/usr/bin/env node

// Startup validation: fail fast on missing required config
function validateConfig() {
  const required = ['DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}
validateConfig();

// Start HTTP health check server IMMEDIATELY (before ANY other code)
// This ensures Railway can verify the service is up within seconds
const http = require('http');
const port = parseInt(process.env.PORT || '8080', 10);

const healthServer = http.createServer((req, res) => {
  // Support both /health and /api/health for Railway compatibility
  if (req.url === '/' || req.url === '/health' || req.url === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'worker'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Listen on 0.0.0.0 to accept connections from Railway
healthServer.listen(port, '0.0.0.0', () => {
  console.log(`✅ Health check server listening on 0.0.0.0:${port}`);
});

healthServer.on('error', (err) => {
  console.error('⚠️ Health check server error:', err.message);
  // Don't exit - workers can still run without health endpoint
});

// Now load other modules and start workers
const { execSync, spawn } = require('child_process');
const { PrismaClient } = require('@prisma/client');

// Resolve stuck migrations and run migrations before starting the worker
try {
  console.log('🔄 Resolving stuck migrations...');
  execSync('node scripts/resolve-stuck-migrations.js', { stdio: 'inherit' });
} catch (error) {
  console.error('⚠️ Migration resolution warning:', error.message);
}

try {
  console.log('🔄 Running database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations completed');
} catch (error) {
  console.error('⚠️ Migration failed (continuing anyway):', error.message);
}

// Wait for database to be reachable with retries
async function waitForDatabase(maxRetries = 10, delayMs = 3000) {
  const prisma = new PrismaClient();
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection established');
      await prisma.$disconnect();
      return true;
    } catch (error) {
      console.log(`⏳ Waiting for database... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  console.error('❌ Could not connect to database after retries');
  await prisma.$disconnect();
  return false;
}

// Safety net: Ensure required tables exist
async function ensureTables() {
  const prisma = new PrismaClient();
  try {
    console.log('🔄 Verifying database tables...');

    // Check for chat_jobs table
    const chatJobsCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'chat_jobs'
    `;

    if (Array.isArray(chatJobsCheck) && chatJobsCheck.length > 0) {
      console.log('✅ chat_jobs table exists');
    } else {
      console.log('⚠️ chat_jobs table missing, creating it...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "chat_jobs" (
          "id" BIGSERIAL NOT NULL,
          "message_id" TEXT NOT NULL,
          "payload" JSONB NOT NULL,
          "sender_user_id" BIGINT NOT NULL,
          "broadcaster_user_id" BIGINT NOT NULL,
          "stream_session_id" BIGINT,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "locked_at" TIMESTAMP(3),
          "processed_at" TIMESTAMP(3),
          "last_error" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "chat_jobs_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "chat_jobs_message_id_key" ON "chat_jobs"("message_id");
        CREATE INDEX IF NOT EXISTS "chat_jobs_status_created_at_idx" ON "chat_jobs"("status", "created_at");
        CREATE INDEX IF NOT EXISTS "chat_jobs_status_locked_at_idx" ON "chat_jobs"("status", "locked_at");
      `);
      console.log('✅ Created chat_jobs table');
    }

    // Also create sweet_coin_award_jobs if missing (for schema compatibility, even though worker is removed)
    const sweetCoinJobsCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sweet_coin_award_jobs'
    `;

    if (Array.isArray(sweetCoinJobsCheck) && sweetCoinJobsCheck.length > 0) {
      console.log('✅ sweet_coin_award_jobs table exists');
    } else {
      console.log('⚠️ sweet_coin_award_jobs table missing, creating it...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "sweet_coin_award_jobs" (
          "id" BIGSERIAL NOT NULL,
          "kick_user_id" BIGINT NOT NULL,
          "stream_session_id" BIGINT,
          "message_id" TEXT NOT NULL,
          "badges" JSONB,
          "emotes" JSONB,
          "status" TEXT NOT NULL DEFAULT 'pending',
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "locked_at" TIMESTAMP(3),
          "processed_at" TIMESTAMP(3),
          "last_error" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "sweet_coin_award_jobs_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "sweet_coin_award_jobs_message_id_key" ON "sweet_coin_award_jobs"("message_id");
        CREATE INDEX IF NOT EXISTS "sweet_coin_award_jobs_status_created_at_idx" ON "sweet_coin_award_jobs"("status", "created_at");
        CREATE INDEX IF NOT EXISTS "sweet_coin_award_jobs_status_locked_at_idx" ON "sweet_coin_award_jobs"("status", "locked_at");
      `);
      console.log('✅ Created sweet_coin_award_jobs table');
    }

  } catch (error) {
    console.error('⚠️ Table check failed (continuing anyway):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the safety net check and wait for it to complete before starting workers
(async () => {
  // Wait for database to be reachable first
  const dbReady = await waitForDatabase();
  if (!dbReady) {
    console.error('❌ Database not reachable, exiting...');
    process.exit(1);
  }

  await ensureTables();

  // Check if this is a moderation-only service
  const moderationOnly = String(process.env.MODERATION_ONLY || '').toLowerCase() === 'true';

  if (moderationOnly) {
    // Moderation-only mode - only run moderation worker
    console.log('');
    console.log('========================================');
    console.log('🛡️ STARTING MODERATION WORKER');
    console.log('========================================');
    console.log('');
    console.log('📝 Moderation Worker: Starting (moderation only, no message/point processing)...');
    const moderationWorkerProcess = spawn('npx', ['tsx', 'scripts/moderation-worker.ts'], {
      stdio: 'inherit',
      env: process.env
    });

    console.log('');
    console.log('✅ Moderation worker spawned successfully');
    console.log('   Waiting for database connections...');
    console.log('');

    moderationWorkerProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Moderation worker exited with code ${code}`);
      }
      healthServer.close(() => {
        console.log('✅ Health check server closed');
        process.exit(code || 0);
      });
    });

    moderationWorkerProcess.on('error', (err) => {
      console.error('❌ Failed to start moderation worker:', err.message);
      healthServer.close();
      process.exit(1);
    });

    // Handle graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n${signal} received, shutting down moderation worker...`);
      healthServer.close(() => {
        console.log('✅ Health check server closed');
      });
      moderationWorkerProcess.kill(signal);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    return;
  }

  // Normal mode - start all workers
  // Chat worker is optional (disabled if CHAT_WORKER_DISABLED=true)
  // This allows running only redis-sync and razed-worker if chat_jobs table doesn't exist
  const chatWorkerDisabled = String(process.env.CHAT_WORKER_DISABLED || '').toLowerCase() === 'true';
  
  console.log('');
  console.log('========================================');
  console.log('🚀 STARTING WORKERS');
  console.log('========================================');
  console.log('');
  
  let chatWorkerProcess = null;
  if (chatWorkerDisabled) {
    console.log('📝 Chat Worker: Disabled (CHAT_WORKER_DISABLED=true)');
  } else {
    console.log('📝 Chat Worker: Starting (handles users, messages, points)...');
    chatWorkerProcess = spawn('npx', ['tsx', 'scripts/chat-worker.ts'], {
      stdio: 'inherit',
      env: process.env
    });
  }

  // Session tracker (polling) is optional. For true event-driven tracking,
  // rely on Kick webhook events (livestream.status.updated).
  const sessionTrackerEnabled = String(process.env.SESSION_TRACKER_ENABLED || '').toLowerCase() === 'true';
  const sessionTrackerProcess = sessionTrackerEnabled
    ? spawn('npx', ['tsx', 'scripts/session-tracker.ts'], { stdio: 'inherit', env: process.env })
    : null;
  if (sessionTrackerEnabled) {
    console.log('📝 Session Tracker: Starting (polling fallback enabled)...');
  } else {
    console.log('📝 Session Tracker: Disabled (webhook-driven mode)');
  }

  // NOTE: Point worker removed - it was unused (nothing enqueues to sweet_coin_award_jobs).
  // Chat-worker handles points inline. The table/model can be removed in a future cleanup.
  console.log('📝 Point Worker: Removed (chat-worker handles points inline)');

  // Start Redis sync worker (syncs Redis buffer to PostgreSQL)
  console.log('📝 Redis Sync Worker: Starting (syncs Redis to PostgreSQL)...');
  const redisSyncProcess = spawn('npx', ['tsx', 'scripts/redis-sync.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  // Start Razed worker (monitors Razed chat for verification codes)
  console.log('🎮 Razed Worker: Starting (monitors Razed chat for verification)...');
  const razedWorkerProcess = spawn('npx', ['tsx', 'scripts/razed-worker.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  console.log('');
  console.log('✅ Workers spawned successfully');
  console.log('   Waiting for database connections...');
  console.log('');

  let chatWorkerExited = chatWorkerDisabled; // Already "exited" if disabled
  let sessionTrackerExited = !sessionTrackerEnabled;
  let redisSyncExited = false;
  let razedWorkerExited = false;

  const checkExit = () => {
    if (chatWorkerExited && sessionTrackerExited && redisSyncExited && razedWorkerExited) {
      healthServer.close(() => {
        console.log('✅ Health check server closed');
        process.exit(0);
      });
    }
  };

  if (chatWorkerProcess) {
    chatWorkerProcess.on('exit', (code) => {
      chatWorkerExited = true;
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Chat worker exited with code ${code}`);
      }
      checkExit();
    });
  }

  if (sessionTrackerProcess) {
    sessionTrackerProcess.on('exit', (code) => {
      sessionTrackerExited = true;
      if (code !== 0 && code !== null) {
        console.error(`⚠️ Session tracker exited with code ${code}`);
      }
      checkExit();
    });
  }

  redisSyncProcess.on('exit', (code) => {
    redisSyncExited = true;
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Redis sync worker exited with code ${code}`);
      // Critical worker - exit if it fails
      if (chatWorkerProcess) chatWorkerProcess.kill('SIGTERM');
      if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
      razedWorkerProcess.kill('SIGTERM');
      healthServer.close();
      process.exit(1);
    }
    checkExit();
  });

  razedWorkerProcess.on('exit', (code) => {
    razedWorkerExited = true;
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Razed worker exited with code ${code}`);
    }
    checkExit();
  });

  if (chatWorkerProcess) {
    chatWorkerProcess.on('error', (err) => {
      console.error('❌ Failed to start chat worker:', err.message);
      if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
      redisSyncProcess.kill('SIGTERM');
      razedWorkerProcess.kill('SIGTERM');
      healthServer.close();
      process.exit(1);
    });
  }

  if (sessionTrackerProcess) {
    sessionTrackerProcess.on('error', (err) => {
      console.error('❌ Failed to start session tracker:', err.message);
      if (chatWorkerProcess) chatWorkerProcess.kill('SIGTERM');
      redisSyncProcess.kill('SIGTERM');
      razedWorkerProcess.kill('SIGTERM');
      healthServer.close();
      process.exit(1);
    });
  }

  redisSyncProcess.on('error', (err) => {
    console.error('❌ Failed to start Redis sync worker:', err.message);
    if (chatWorkerProcess) chatWorkerProcess.kill('SIGTERM');
    if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
    razedWorkerProcess.kill('SIGTERM');
    healthServer.close();
    process.exit(1);
  });

  razedWorkerProcess.on('error', (err) => {
    console.error('❌ Failed to start Razed worker:', err.message);
    if (chatWorkerProcess) chatWorkerProcess.kill('SIGTERM');
    if (sessionTrackerProcess) sessionTrackerProcess.kill('SIGTERM');
    redisSyncProcess.kill('SIGTERM');
    healthServer.close();
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down workers...`);
    healthServer.close(() => {
      console.log('✅ Health check server closed');
    });
    if (chatWorkerProcess) chatWorkerProcess.kill(signal);
    if (sessionTrackerProcess) sessionTrackerProcess.kill(signal);
    redisSyncProcess.kill(signal);
    razedWorkerProcess.kill(signal);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch(err => {
  console.error('⚠️ Error starting workers:', err.message);
  process.exit(1);
});
