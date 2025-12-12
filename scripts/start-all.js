#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function ensureStandaloneAssets(standaloneDir) {
  try {
    const rootDir = process.cwd();

    const linkOrCopyDir = (src, dest) => {
      if (!fs.existsSync(src) || fs.existsSync(dest)) return;
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      try {
        const isWindows = process.platform === 'win32';
        fs.symlinkSync(src, dest, isWindows ? 'junction' : 'dir');
      } catch (e) {
        fs.cpSync(src, dest, { recursive: true });
      }
    };

    linkOrCopyDir(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'));
    linkOrCopyDir(path.join(rootDir, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
  } catch (e) {
    console.warn('⚠️ Failed to prepare standalone assets:', e && e.message ? e.message : String(e));
  }
}

console.log('🚀 Starting all services...');
console.log(`📂 Working directory: ${process.cwd()}`);
console.log(`🔧 Node version: ${process.version}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// Ensure we can find node_modules binaries
const nodeModulesBin = path.join(process.cwd(), 'node_modules', '.bin');
const envWithPath = {
  ...process.env,
  PATH: `${nodeModulesBin}:${process.env.PATH || ''}`
};

let workerProcess = null;
let webProcess = null;

// Start workers first (chat + point workers)
console.log('⚙️ Starting workers...');
try {
  workerProcess = spawn('node', [path.join(__dirname, 'start-worker.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: envWithPath,
    cwd: process.cwd()
  });

  // Pipe worker output with prefix
  workerProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => console.log(`[WORKER] ${line}`));
  });

  workerProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => console.error(`[WORKER-ERR] ${line}`));
  });

  workerProcess.on('error', (err) => {
    console.error(`❌ Failed to start workers: ${err.message}`);
    console.error(`   Error code: ${err.code}`);
    console.error(`   Error path: ${err.path}`);
  });

  workerProcess.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`⚠️ Workers exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
    } else if (signal) {
      console.log(`ℹ️ Workers stopped by signal: ${signal}`);
    }
  });

  // Give workers a moment to start
  setTimeout(() => {
    if (workerProcess && workerProcess.exitCode === null) {
      console.log('✅ Workers started successfully');
    }
  }, 2000);

} catch (err) {
  console.error(`❌ Error spawning workers: ${err.message}`);
}

// Start Next.js web server in foreground (Railway monitors this)
console.log(`🌐 Starting Next.js web server on port ${process.env.PORT || 3000}...`);
try {
  const port = process.env.PORT || '3000';
  const hostname = process.env.HOSTNAME || '0.0.0.0';

  const rootStandaloneServer = path.join(process.cwd(), 'server.js');
  const nextStandaloneServer = path.join(process.cwd(), '.next', 'standalone', 'server.js');

  if (fs.existsSync(rootStandaloneServer)) {
    console.log('🚀 Using standalone server (server.js)');
    webProcess = spawn(process.execPath, ['server.js'], {
      stdio: 'inherit',
      env: { ...envWithPath, PORT: port, HOSTNAME: hostname },
      cwd: process.cwd()
    });
  } else if (fs.existsSync(nextStandaloneServer)) {
    console.log('🚀 Using standalone server (.next/standalone/server.js)');
    ensureStandaloneAssets(path.join(process.cwd(), '.next', 'standalone'));
    webProcess = spawn(process.execPath, [path.join('.next', 'standalone', 'server.js')], {
      stdio: 'inherit',
      env: { ...envWithPath, PORT: port, HOSTNAME: hostname },
      cwd: process.cwd()
    });
  } else {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next.cmd');
      webProcess = spawn(nextBin, ['start', '-H', hostname, '-p', port], {
        stdio: 'inherit',
        env: { ...envWithPath, HOSTNAME: hostname },
        cwd: process.cwd()
      });
    } else {
      webProcess = spawn('sh', ['-c', `next start -H ${hostname} -p ${port}`], {
        stdio: 'inherit',
        env: { ...envWithPath, HOSTNAME: hostname },
        cwd: process.cwd()
      });
    }
  }

  webProcess.on('error', (err) => {
    console.error(`❌ Failed to start web server: ${err.message}`);
    if (workerProcess && !workerProcess.killed) {
      workerProcess.kill('SIGTERM');
    }
    process.exit(1);
  });

  webProcess.on('exit', (code, signal) => {
    console.log(`\n⚠️ Web server exited with code ${code || 0}${signal ? ` (signal: ${signal})` : ''}`);
    if (workerProcess && !workerProcess.killed) {
      console.log('🛑 Stopping workers...');
      workerProcess.kill('SIGTERM');
      // Wait a bit for graceful shutdown
      setTimeout(() => {
        if (workerProcess && !workerProcess.killed) {
          workerProcess.kill('SIGKILL');
        }
        process.exit(code || 0);
      }, 5000);
    } else {
      process.exit(code || 0);
    }
  });

} catch (err) {
  console.error(`❌ Error spawning web server: ${err.message}`);
  if (workerProcess && !workerProcess.killed) {
    workerProcess.kill('SIGTERM');
  }
  process.exit(1);
}

// Handle graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received, shutting down all services...`);
  if (workerProcess && !workerProcess.killed) {
    console.log('🛑 Stopping workers...');
    workerProcess.kill(signal);
  }
  if (webProcess && !webProcess.killed) {
    console.log('🛑 Stopping web server...');
    webProcess.kill(signal);
  }

  // Force exit after timeout
  setTimeout(() => {
    console.log('⚠️ Force exiting...');
    process.exit(0);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep process alive
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
});
