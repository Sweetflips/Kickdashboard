/**
 * Database Merge - Master Migration Script
 * 
 * This script runs all migration phases in sequence.
 * Each phase can be run independently if needed.
 * 
 * Run: node scripts/database-merge/run-migration.js
 * 
 * Or run individual phases:
 *   node scripts/database-merge/phase1-prepare-shuttle.js
 *   node scripts/database-merge/phase2-create-platform-tables.js
 *   node scripts/database-merge/phase3-migrate-data.js
 *   node scripts/database-merge/phase4-create-links.js
 *   node scripts/database-merge/phase5-verify.js
 */

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

const phases = [
  {
    name: 'Phase 1: Prepare Shuttle Database',
    description: 'Renames users → admin_users and updates foreign keys',
    script: 'phase1-prepare-shuttle.js'
  },
  {
    name: 'Phase 2: Create Platform Tables',
    description: 'Creates all platform_* tables in Shuttle database',
    script: 'phase2-create-platform-tables.js'
  },
  {
    name: 'Phase 3: Migrate Data',
    description: 'Migrates all data from Mainline to Shuttle (~2.5M rows)',
    script: 'phase3-migrate-data.js'
  },
  {
    name: 'Phase 4: Create Links',
    description: 'Links platform users to casino players and creates views',
    script: 'phase4-create-links.js'
  },
  {
    name: 'Phase 5: Verify',
    description: 'Verifies data integrity and generates report',
    script: 'phase5-verify.js'
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, resolve);
  });
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('DATABASE MERGE: Shuttle + Mainline → Unified Database');
  console.log('='.repeat(60));
  console.log('');
  console.log('This script will merge the Mainline (Kickdashboard) database');
  console.log('into the Shuttle (Internal) database.');
  console.log('');
  console.log('Source (DB2): mainline.proxy.rlwy.net:46309');
  console.log('Target (DB1): shuttle.proxy.rlwy.net:41247');
  console.log('');
  console.log('Phases to run:');
  phases.forEach((phase, i) => {
    console.log(`  ${i + 1}. ${phase.name}`);
    console.log(`     ${phase.description}`);
  });
  console.log('');
  
  const confirm = await ask('Do you want to proceed? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Migration cancelled.');
    rl.close();
    return;
  }
  
  console.log('');
  console.log('Starting migration...\n');
  
  const startPhase = await ask('Start from phase (1-5, default 1): ');
  const startIndex = parseInt(startPhase) - 1 || 0;
  
  for (let i = startIndex; i < phases.length; i++) {
    const phase = phases[i];
    
    console.log('');
    console.log('='.repeat(60));
    console.log(`RUNNING: ${phase.name}`);
    console.log('='.repeat(60));
    console.log('');
    
    try {
      const scriptPath = path.join(__dirname, phase.script);
      await runScript(scriptPath);
      
      console.log('');
      console.log(`✅ ${phase.name} completed successfully`);
      
      if (i < phases.length - 1) {
        const continueAnswer = await ask('\nContinue to next phase? (yes/no): ');
        if (continueAnswer.toLowerCase() !== 'yes') {
          console.log(`\nMigration paused at ${phase.name}`);
          console.log(`To continue, run: node scripts/database-merge/${phases[i + 1].script}`);
          break;
        }
      }
    } catch (error) {
      console.error('');
      console.error(`❌ Error in ${phase.name}:`, error.message);
      console.error('Migration stopped. Fix the error and re-run from this phase.');
      console.error(`\nTo retry: node scripts/database-merge/${phase.script}`);
      break;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Read scripts/database-merge/DATABASE_MERGE_GUIDE.md');
  console.log('2. Update your Prisma schema');
  console.log('3. Update DATABASE_URL in your environment');
  console.log('4. Update your application code');
  console.log('5. Test thoroughly before deploying');
  
  rl.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  rl.close();
  process.exit(1);
});




