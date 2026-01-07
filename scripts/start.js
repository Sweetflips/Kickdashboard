#!/usr/bin/env node

// Force immediate output
process.stdout.write('🔧 start.js: Script starting...\n');

// Startup validation: fail fast on missing required config
function validateConfig() {
  const required = ['DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    process.stdout.write('❌ FATAL: Missing required environment variables: ' + missing.join(', ') + '\n');
    process.exit(1);
  }
}

try {
  validateConfig();

  const { spawn, exec } = require('child_process');
  const path = require('path');

  process.stdout.write('🔧 start.js: Modules loaded\n');
  process.stdout.write('📍 CWD: ' + process.cwd() + '\n');
  process.stdout.write('📍 PORT: ' + process.env.PORT + '\n');
  process.stdout.write('📍 RUN_AS_WORKER: ' + process.env.RUN_AS_WORKER + '\n');

  // Check if this should run as worker instead of web server
  if (process.env.RUN_AS_WORKER === 'true') {
    process.stdout.write('🔧 RUN_AS_WORKER=true, starting worker mode...\n');
    require('./start-worker.js');
  } else {
    startWebServer();
  }
} catch (err) {
  process.stdout.write('❌ FATAL ERROR: ' + err.message + '\n');
  process.stdout.write('❌ Stack: ' + err.stack + '\n');
  process.exit(1);
}

function startWebServer() {
  try {
    const { spawn, exec } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const crypto = require('crypto');

    const port = process.env.PORT || '3000';
    const hostname = process.env.HOSTNAME || '0.0.0.0';

    // Add node_modules/.bin to PATH so 'next' command is found
    const binPath = path.join(process.cwd(), 'node_modules', '.bin');
    const envWithPath = {
      ...process.env,
      PATH: `${binPath}:${process.env.PATH || ''}`
    };

    // Declare process variables early
    let nextProcess = null;
    let razedWorkerProcess = null;
    let shuttingDown = false;
    let shutdownSignal = null;
    let nextProcessExited = false;
    let razedWorkerExited = false;

    const checkAllExited = () => {
      if (nextProcessExited && razedWorkerExited) {
        const exitCode = nextProcessExited === 0 ? 0 : 1;
        process.exit(exitCode);
      }
    };

    process.stdout.write('🚀 Starting Next.js on port ' + port + '...\n');
    process.stdout.write('📂 PATH includes: ' + binPath + '\n');

    // Start Razed worker alongside web server (always runs with frontend)
    // Start it early so it runs even if Next.js fails to start
    process.stdout.write('🎮 Starting Razed worker alongside web server...\n');
    razedWorkerProcess = spawn('npx', ['tsx', 'scripts/razed-worker.ts'], {
      stdio: 'inherit',
      env: envWithPath,
      cwd: process.cwd(),
    });

    razedWorkerProcess.on('exit', (code) => {
      razedWorkerExited = code !== null ? code : 0;
      if (code !== 0 && code !== null) {
        process.stdout.write(`⚠️  Razed worker exited with code: ${code}\n`);
      } else {
        process.stdout.write('✅ Razed worker exited\n');
      }
      checkAllExited();
    });

    razedWorkerProcess.on('error', (err) => {
      process.stdout.write('⚠️  Failed to start Razed worker: ' + err.message + '\n');
      razedWorkerExited = true;
      checkAllExited();
    });

    const ensureStandaloneAssets = (standaloneDir) => {
      try {
        const rootDir = process.cwd();

        const ensureServerActionsManifest = (baseDir) => {
          try {
            const serverDir = path.join(baseDir, '.next', 'server');
            const actionsManifestJson = path.join(serverDir, 'server-actions-manifest.json');
            const actionsManifestJs = path.join(serverDir, 'server-actions-manifest.js');
            if (fs.existsSync(actionsManifestJson) || fs.existsSync(actionsManifestJs)) return;

            fs.mkdirSync(serverDir, { recursive: true });

            // Next.js (App Router) can crash on some requests if it expects a server-actions manifest
            // but the deployment artifact layout omitted it. This can surface as:
            // "Failed to find Server Action" + "Cannot read properties of undefined (reading 'workers')"
            //
            // If this app doesn't use Server Actions, a minimal manifest is safe and prevents crashes.
            // If it does use Server Actions, the real manifest should exist and we won't overwrite it.
            const refManifestPath = path.join(serverDir, 'server-reference-manifest.json');
            let encryptionKey = '';
            try {
              if (fs.existsSync(refManifestPath)) {
                const ref = JSON.parse(fs.readFileSync(refManifestPath, 'utf8'));
                if (ref && typeof ref.encryptionKey === 'string') encryptionKey = ref.encryptionKey;
              }
            } catch {
              // ignore
            }
            if (!encryptionKey) {
              // 32 bytes -> base64, similar shape to Next's keys (not used if no actions)
              encryptionKey = crypto.randomBytes(32).toString('base64');
            }

            const minimal = {
              node: {},
              edge: {},
              workers: {},
              encryptionKey,
            };
            fs.writeFileSync(actionsManifestJson, JSON.stringify(minimal));
          } catch (e) {
            // Non-fatal: only affects hardening for missing manifests
          }
        };

        const linkOrCopyDir = (src, dest) => {
          if (!fs.existsSync(src) || fs.existsSync(dest)) return;
          fs.mkdirSync(path.dirname(dest), { recursive: true });

          // Prefer symlink/junction; fall back to copy.
          try {
            const isWindows = process.platform === 'win32';
            fs.symlinkSync(src, dest, isWindows ? 'junction' : 'dir');
          } catch (e) {
            fs.cpSync(src, dest, { recursive: true });
          }
        };

        // Standalone server.js does `process.chdir(__dirname)`,
        // so it expects `public/` and `.next/static` relative to the standalone dir.
        linkOrCopyDir(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'));

        const staticSrc = path.join(rootDir, '.next', 'static');
        const staticDest = path.join(standaloneDir, '.next', 'static');
        linkOrCopyDir(staticSrc, staticDest);

        // Standalone also expects `.next/server` relative to the standalone dir.
        // If it's missing, Next can fail with "Failed to find Server Action" / missing manifest errors.
        const serverSrc = path.join(rootDir, '.next', 'server');
        const serverDest = path.join(standaloneDir, '.next', 'server');
        linkOrCopyDir(serverSrc, serverDest);

        // Ensure a server-actions manifest exists in BOTH locations (root + standalone runtime),
        // to avoid edge cases where the server resolves manifests relative to CWD.
        ensureServerActionsManifest(rootDir);
        ensureServerActionsManifest(standaloneDir);
      } catch (e) {
        process.stdout.write('⚠️ Failed to prepare standalone assets: ' + (e && e.message ? e.message : String(e)) + '\n');
      }
    };

    // Prefer `next start` when the full `.next` directory is present.
    // Use standalone only as a fallback for environments that deploy ONLY standalone artifacts.
    const rootStandaloneServer = path.join(process.cwd(), 'server.js');
    const nextStandaloneServer = path.join(process.cwd(), '.next', 'standalone', 'server.js');
    const hasFullNextServer =
      fs.existsSync(path.join(process.cwd(), '.next', 'server', 'server-reference-manifest.json')) ||
      fs.existsSync(path.join(process.cwd(), '.next', 'server', 'server-reference-manifest.js'));

    // Hardening: ensure server-actions manifest exists if the build/layout omitted it.
    // This prevents runtime crashes on some POST requests that trigger the server-action pipeline.
    try {
      const serverDir = path.join(process.cwd(), '.next', 'server');
      const actionsManifestJson = path.join(serverDir, 'server-actions-manifest.json');
      const actionsManifestJs = path.join(serverDir, 'server-actions-manifest.js');
      if (!fs.existsSync(actionsManifestJson) && !fs.existsSync(actionsManifestJs)) {
        fs.mkdirSync(serverDir, { recursive: true });
        const refPath = path.join(serverDir, 'server-reference-manifest.json');
        let encryptionKey = '';
        try {
          if (fs.existsSync(refPath)) {
            const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
            if (ref && typeof ref.encryptionKey === 'string') encryptionKey = ref.encryptionKey;
          }
        } catch {
          // ignore
        }
        if (!encryptionKey) encryptionKey = crypto.randomBytes(32).toString('base64');
        fs.writeFileSync(
          actionsManifestJson,
          JSON.stringify({ node: {}, edge: {}, workers: {}, encryptionKey })
        );
      }
    } catch {
      // ignore
    }

    const spawnNode = (args, extraEnv = {}) =>
      spawn(process.execPath, args, {
        stdio: 'inherit',
        env: { ...envWithPath, ...extraEnv },
        cwd: process.cwd(),
      });

    if (hasFullNextServer) {
      // Normal Next.js runtime
      process.stdout.write('🚀 Using next start (full .next build detected)\n');
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next.cmd');
        nextProcess = spawn(nextBin, ['start', '-H', hostname, '-p', port], {
          stdio: 'inherit',
          env: { ...envWithPath, HOSTNAME: hostname },
          cwd: process.cwd(),
        });
      } else {
        nextProcess = spawn('sh', ['-c', `next start -H ${hostname} -p ${port}`], {
          stdio: 'inherit',
          env: { ...envWithPath, HOSTNAME: hostname },
          cwd: process.cwd(),
        });
      }
    } else if (fs.existsSync(rootStandaloneServer)) {
      process.stdout.write('🚀 Using standalone server (server.js)\n');
      nextProcess = spawnNode(['server.js'], { PORT: port, HOSTNAME: hostname });
    } else if (fs.existsSync(nextStandaloneServer)) {
      process.stdout.write('🚀 Using standalone server (.next/standalone/server.js)\n');
      ensureStandaloneAssets(path.join(process.cwd(), '.next', 'standalone'));
      nextProcess = spawnNode([path.join('.next', 'standalone', 'server.js')], { PORT: port, HOSTNAME: hostname });
    } else {
      throw new Error('No Next.js start target found (.next build missing)');
    }

    if (!nextProcess) {
      throw new Error('Failed to start Next.js (no start command selected)');
    }

    nextProcess.on('exit', (code, signal) => {
      nextProcessExited = code !== null ? code : (signal ? 1 : 0);

      // IMPORTANT:
      // - When a child is terminated by a signal, Node reports `code === null` and provides `signal`.
      // - Treat SIGTERM/SIGINT as a graceful shutdown so the platform doesn't restart-loop the service.
      if (signal) {
        process.stdout.write(`ℹ️  Next.js stopped by signal: ${signal}\n`);
        if (shuttingDown && (signal === 'SIGTERM' || signal === 'SIGINT')) {
          // Wait for Razed worker to exit before exiting
          checkAllExited();
          return;
        }

        // Unexpected signal: exit non-zero so restartPolicyType=ON_FAILURE can recover.
        const sigNum = (os.constants && os.constants.signals && os.constants.signals[signal]) || 0;
        // Still wait for Razed worker
        checkAllExited();
        return;
      }

      if (code === 0) {
        process.stdout.write('✅ Next.js exited successfully (code: 0)\n');
      } else {
        process.stdout.write('⚠️  Next.js exited with code: ' + code + '\n');
      }

      // Wait for Razed worker to exit before exiting
      checkAllExited();
    });

    nextProcess.on('error', (err) => {
      process.stdout.write('❌ Spawn error: ' + err.message + '\n');
      // Don't exit immediately - let Razed worker continue running
      nextProcessExited = 1;
      checkAllExited();
    });

    // Handle graceful shutdown
    const shutdown = (signal) => {
      process.stdout.write('\n' + signal + ' received, shutting down...\n');
      shuttingDown = true;
      shutdownSignal = signal;
      if (nextProcess) nextProcess.kill(signal);
      if (razedWorkerProcess) razedWorkerProcess.kill(signal);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Run migrations in background after 5 seconds
    setTimeout(async () => {
      // Get the direct PostgreSQL URL for migrations (can't use Accelerate URLs)
      const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
      const isAccelerateUrl = directUrl.startsWith('prisma://') || directUrl.startsWith('prisma+postgres://');

      if (isAccelerateUrl) {
        process.stdout.write('⚠️ Cannot run migrations: DATABASE_URL is Accelerate URL and DIRECT_URL not set\n');
        return;
      }

      if (!directUrl) {
        process.stdout.write('⚠️ Cannot run migrations: No database URL configured\n');
        return;
      }

      process.stdout.write('🔄 Resolving stuck migrations...\n');
      process.stdout.write('🔄 Using direct URL: ' + (directUrl ? 'YES (starts with ' + directUrl.substring(0, 15) + '...)' : 'NO') + '\n');

      // Override DATABASE_URL with the direct URL for migrations only
      const migrateEnv = { ...envWithPath, DATABASE_URL: directUrl };

      // First resolve any stuck migrations (using same env as migrate deploy)
      exec('node scripts/resolve-stuck-migrations.js', { env: migrateEnv, timeout: 60000 }, (resolveError, resolveStdout, resolveStderr) => {
        if (resolveStdout) process.stdout.write(resolveStdout);
        if (resolveStderr) process.stderr.write(resolveStderr);
        if (resolveError) {
          process.stdout.write('⚠️ Migration resolution warning: ' + resolveError.message + '\n');
        }

        // Then run migrate deploy
        process.stdout.write('🔄 Running database migrations...\n');
        // Use --config to explicitly point to the config file
        exec('npx prisma migrate deploy --config=./prisma.config.js', { env: migrateEnv, timeout: 60000 }, (error, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (stderr) process.stderr.write(stderr);
          if (error) {
            process.stdout.write('⚠️ Migration failed: ' + error.message + '\n');
          } else {
            process.stdout.write('✅ Migrations completed\n');
          }
        });
      });
    }, 5000);

  } catch (err) {
    process.stdout.write('❌ startWebServer error: ' + err.message + '\n');
    process.exit(1);
  }
}
