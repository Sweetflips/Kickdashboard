#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

// Worker-relevant globs or path prefixes
const WORKER_PATHS = [
    'scripts/point-worker',
    'scripts/chat-worker',
    'scripts/session-tracker',
    'scripts/start-worker',
    'lib/sweet-coin-queue',
    'lib/chat-queue',
    'lib/sweet-coins',
    'prisma',
    'package.json',
    'tsconfig.json'
];

function run(cmd) {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

function getChangedFiles() {
    // Try to detect changed files relative to origin/main
    try {
        // Ensure we fetch origin/main (best effort)
        try {
            execSync('git fetch --depth=50 origin main', { stdio: 'ignore' });
        } catch (e) {
            // Ignore fetch errors - build environments sometimes block network
        }

        let nameList = '';
        try {
            nameList = run('git diff --name-only origin/main...HEAD');
            if (!nameList) {
                nameList = run('git diff --name-only HEAD~1..HEAD');
            }
            if (!nameList) {
                // Try a wider window
                nameList = run('git diff --name-only HEAD~5..HEAD');
            }
            if (!nameList) {
                // Last resort: get the files in the last commit
                nameList = run('git show --name-only --pretty="" HEAD');
            }
        } catch (e) {
            console.warn('⚠️  Could not run git diff; assuming full build needed.');
            return null; // fallback to build
        }

        const files = nameList
            .split(/\r?\n/)
            .map(x => x.trim())
            .filter(Boolean)
            .map(x => x.replace(/\\\\/g, '/'));

        return files;
    } catch (err) {
        console.warn('⚠️  Unexpected git inspection error; assuming full build needed.', err.message);
        return null;
    }
}

function shouldBuildWorker(changedFiles) {
    if (!Array.isArray(changedFiles)) return true; // no info -> build
    for (const file of changedFiles) {
        for (const pattern of WORKER_PATHS) {
            if (file === pattern) return true;
            if (file.startsWith(pattern)) return true;
        }
    }
    return false;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
    const changedFiles = getChangedFiles();
    if (!changedFiles) {
        console.log('🔄 Could not determine changed files. Proceeding with worker build.');
        if (dryRun) {
            console.log('⏸ Dry-run: would build.');
            process.exit(0);
        }
        process.exit(require('child_process').spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status);
    }

    const needBuild = shouldBuildWorker(changedFiles);

    if (!needBuild) {
        console.log('✅ No worker-related changes detected. Skipping worker build.');
        // create a small marker so the build step ends with success and nothing is rebuilt
        try {
            const fs = require('fs');
            const marker = path.join(process.cwd(), 'build', 'skip_worker_build');
            fs.mkdirSync(path.dirname(marker), { recursive: true });
            fs.writeFileSync(marker, `Skipped at ${new Date().toISOString()}\n\nChanges:\n${changedFiles.join('\n')}`);
        } catch (e) {
            // ignore
        }
        process.exit(0);
    }

    console.log('🔁 Worker code changes detected — running build...');
    if (dryRun) {
        console.log('⏸ Dry-run: would run `npm run build`.');
        process.exit(0);
    }
    // Run the real build
    const status = execSync('npm run build', { stdio: 'inherit' });
    process.exit(status);
}

main();
