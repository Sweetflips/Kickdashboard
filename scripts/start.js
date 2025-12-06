#!/usr/bin/env node
const { spawn, exec } = require('child_process');

// Check if this should run as worker instead of web server
if (process.env.RUN_AS_WORKER === 'true') {
  console.log('🔧 RUN_AS_WORKER=true, starting worker mode...');
  require('./start-worker.js');
  // Worker script handles its own lifecycle, don't continue
} else {
  // Web server mode
  startWebServer();
}

function startWebServer() {
  const port = process.env.PORT || '3000';

  // Start Next.js server FIRST - migrations run in background
  console.log('🚀 Starting Next.js server on port ' + port + '...');
  
  // Use sh -c which works reliably in the container (same as npm script)
  const nextProcess = spawn('sh', ['-c', `next start -p ${port}`], {
    stdio: 'inherit',
    env: process.env
  });

  // Handle process exits
  nextProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  nextProcess.on('error', (err) => {
    console.error('❌ Failed to start Next.js:', err.message);
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down...`);
    nextProcess.kill(signal);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Run migrations in background (non-blocking) after 5 seconds
  setTimeout(() => {
    console.log('🔄 Running background migrations...');
    
    exec('prisma migrate deploy', { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('⚠️ Background migration failed (non-critical):', error.message);
      } else {
        console.log('✅ Background migrations completed');
      }
    });
  }, 5000);
}
