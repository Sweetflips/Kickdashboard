#!/usr/bin/env node

/**
 * Cloudflare 502 Diagnostic Script
 *
 * This script helps diagnose 502 Bad Gateway errors between Cloudflare and Railway.
 * Run this to test connectivity and identify configuration issues.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testEndpoint(name, url, options = {}) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Testing: ${name}`, 'blue');
  log(`URL: ${url}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');

  try {
    const startTime = Date.now();
    const response = await makeRequest(url, options);
    const duration = Date.now() - startTime;

    const statusColor = response.statusCode < 400 ? 'green' : response.statusCode < 500 ? 'yellow' : 'red';
    log(`✓ Status: ${response.statusCode}`, statusColor);
    log(`✓ Duration: ${duration}ms`, 'cyan');

    if (response.statusCode === 502) {
      log(`✗ 502 Bad Gateway detected!`, 'red');
      log(`  This means Cloudflare cannot reach the origin server.`, 'yellow');
      log(`  Possible causes:`, 'yellow');
      log(`  1. Railway custom domain not configured`, 'yellow');
      log(`  2. SSL certificate not provisioned`, 'yellow');
      log(`  3. Railway service is down or unreachable`, 'yellow');
      log(`  4. Cloudflare SSL mode mismatch`, 'yellow');
    }

    // Show important headers
    if (response.headers.server) {
      log(`  Server: ${response.headers.server}`, 'cyan');
    }
    if (response.headers['cf-ray']) {
      log(`  CF-Ray: ${response.headers['cf-ray']}`, 'cyan');
    }
    if (response.headers['x-railway-version']) {
      log(`  Railway Version: ${response.headers['x-railway-version']}`, 'cyan');
    }

    return { success: true, statusCode: response.statusCode, duration };
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function main() {
  log('\n🔍 Cloudflare 502 Diagnostic Tool', 'blue');
  log('This script tests connectivity to identify 502 Bad Gateway issues.\n', 'cyan');

  const results = [];

  // Test 1: Health endpoint via Cloudflare
  results.push(await testEndpoint(
    'Health Check (via Cloudflare)',
    'https://www.kickdashboard.com/api/health'
  ));

  // Test 2: Sweet coins endpoint (the failing one)
  results.push(await testEndpoint(
    'Sweet Coins API (via Cloudflare)',
    'https://www.kickdashboard.com/api/chat/sweet-coins',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageIds: ['test'] }),
    }
  ));

  // Test 3: Check if Railway domain is provided via env
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
  if (railwayDomain) {
    log(`\n📋 Found Railway domain from environment: ${railwayDomain}`, 'cyan');
    results.push(await testEndpoint(
      'Health Check (direct Railway)',
      `https://${railwayDomain}/api/health`
    ));
  } else {
    log(`\n⚠️  Railway domain not found in environment variables.`, 'yellow');
    log(`   Set RAILWAY_PUBLIC_DOMAIN or RAILWAY_STATIC_URL to test direct Railway access.`, 'yellow');
    log(`   You can find this in Railway Dashboard > Service > Settings > Domains`, 'yellow');
  }

  // Summary
  log(`\n${'='.repeat(60)}`, 'cyan');
  log('📊 Summary', 'blue');
  log(`${'='.repeat(60)}`, 'cyan');

  const successCount = results.filter(r => r.success && r.statusCode < 500).length;
  const failCount = results.filter(r => !r.success || r.statusCode >= 500).length;

  log(`✓ Successful requests: ${successCount}`, successCount > 0 ? 'green' : 'red');
  log(`✗ Failed requests: ${failCount}`, failCount > 0 ? 'red' : 'green');

  if (failCount > 0) {
    log(`\n🔧 Next Steps:`, 'yellow');
    log(`1. Check Railway Dashboard > Service > Settings > Domains`, 'yellow');
    log(`   - Ensure 'www.kickdashboard.com' is listed`, 'yellow');
    log(`   - Verify SSL certificate status is 'Valid'`, 'yellow');
    log(`2. Check Cloudflare Dashboard > DNS`, 'yellow');
    log(`   - Verify CNAME record points to Railway domain`, 'yellow');
    log(`   - Ensure proxy is enabled (orange cloud)`, 'yellow');
    log(`3. Check Cloudflare Dashboard > SSL/TLS`, 'yellow');
    log(`   - Set encryption mode to 'Full' (not 'Full Strict')`, 'yellow');
    log(`4. Check Railway logs for any startup errors`, 'yellow');
    log(`   - Railway Dashboard > Service > Deployments > Latest > Logs`, 'yellow');
  } else {
    log(`\n✅ All tests passed! No 502 errors detected.`, 'green');
  }

  log(`\n📖 For detailed troubleshooting, see: docs/CLOUDFLARE_502_FIX.md\n`, 'cyan');
}

main().catch((error) => {
  log(`\n✗ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
