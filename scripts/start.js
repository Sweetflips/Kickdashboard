#!/usr/bin/env node
const { spawn, execSync } = require('child_process');

// Check if this should run as worker instead of web server
if (process.env.RUN_AS_WORKER === 'true') {
  console.log('🔧 RUN_AS_WORKER=true, starting worker mode...');
  require('./start-worker.js');
  return;
}

const port = process.env.PORT || '3000';

// Start Next.js server FIRST - migrations/checks run in background
console.log('🚀 Starting Next.js server on port ' + port + '...');
const nextProcess = spawn('npx', ['next', 'start', '-p', port], {
  stdio: 'inherit',
  env: process.env
});

// Handle process exits
nextProcess.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  nextProcess.kill(signal);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Run migrations in background (non-blocking) after 5 seconds
setTimeout(async () => {
  console.log('🔄 Running background migrations...');

  try {
    // Run migrations (5 second timeout)
    const { promisify } = require('util');
    const exec = promisify(require('child_process').exec);

    const migrationPromise = exec('npx prisma migrate deploy', { timeout: 30000 });
    await migrationPromise;
    console.log('✅ Background migrations completed');
  } catch (error) {
    console.error('⚠️ Background migration failed (non-critical):', error.message);
  }
}, 5000);
