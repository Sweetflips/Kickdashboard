#!/usr/bin/env node

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

// Run migrations before starting the worker
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

    // Also check point_award_jobs for backward compatibility
    const pointJobsCheck = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'point_award_jobs'
    `;

    if (Array.isArray(pointJobsCheck) && pointJobsCheck.length > 0) {
      console.log('✅ point_award_jobs table exists');
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

  // Start chat worker (handles all writes: users, messages, points)
  console.log('');
  console.log('========================================');
  console.log('🚀 STARTING WORKERS');
  console.log('========================================');
  console.log('');
  console.log('📝 Chat Worker: Starting (handles users, messages, points)...');
  const chatWorkerProcess = spawn('npx', ['tsx', 'scripts/chat-worker.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  // Start point worker (processes point_award_jobs queue)
  // NOTE: Currently idle - nothing enqueues to point_award_jobs anymore.
  // Chat-worker handles points inline. Keeping this worker for potential future use.
  console.log('📝 Point Worker: Starting (currently idle - no jobs enqueued)...');
  const pointWorkerProcess = spawn('npx', ['tsx', 'scripts/point-worker.ts'], {
    stdio: 'inherit',
    env: process.env
  });

  console.log('');
  console.log('✅ Workers spawned successfully');
  console.log('   Waiting for database connections...');
  console.log('');

  let chatWorkerExited = false;
  let pointWorkerExited = false;

  const checkExit = () => {
    if (chatWorkerExited && pointWorkerExited) {
      healthServer.close(() => {
        console.log('✅ Health check server closed');
        process.exit(0);
      });
    }
  };

  chatWorkerProcess.on('exit', (code) => {
    chatWorkerExited = true;
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Chat worker exited with code ${code}`);
      // Don't exit immediately - let point worker continue
    }
    checkExit();
  });

  pointWorkerProcess.on('exit', (code) => {
    pointWorkerExited = true;
    if (code !== 0 && code !== null) {
      console.error(`⚠️ Point worker exited with code ${code}`);
      // Don't exit immediately - let chat worker continue
    }
    checkExit();
  });

  chatWorkerProcess.on('error', (err) => {
    console.error('❌ Failed to start chat worker:', err.message);
    pointWorkerProcess.kill('SIGTERM');
    healthServer.close();
    process.exit(1);
  });

  pointWorkerProcess.on('error', (err) => {
    console.error('❌ Failed to start point worker:', err.message);
    chatWorkerProcess.kill('SIGTERM');
    healthServer.close();
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down workers...`);
    healthServer.close(() => {
      console.log('✅ Health check server closed');
    });
    chatWorkerProcess.kill(signal);
    pointWorkerProcess.kill(signal);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch(err => {
  console.error('⚠️ Error starting workers:', err.message);
  process.exit(1);
});
