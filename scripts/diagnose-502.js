#!/usr/bin/env node

/**
 * Diagnose 502 Bad Gateway errors
 * Tests Railway origin directly and checks Cloudflare configuration
 */

const https = require('https');
const http = require('http');

const RAILWAY_DOMAIN = process.env.RAILWAY_DOMAIN || 'kickdashboard-production.up.railway.app';
const CLOUDFLARE_DOMAIN = 'www.kickdashboard.com';

console.log('🔍 Diagnosing 502 Bad Gateway Error\n');
console.log(`Railway Domain: ${RAILWAY_DOMAIN}`);
console.log(`Cloudflare Domain: ${CLOUDFLARE_DOMAIN}\n`);

function testUrl(url, label) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const startTime = Date.now();

    const req = client.get(url, { timeout: 10000 }, (res) => {
      const duration = Date.now() - startTime;
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          success: true,
          status: res.statusCode,
          headers: res.headers,
          duration,
          data: data.substring(0, 200) // First 200 chars
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        duration: Date.now() - startTime
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
        duration: Date.now() - startTime
      });
    });
  });
}

async function diagnose() {
  console.log('1️⃣ Testing Railway Origin Directly...\n');

  // Test Railway health endpoint
  const railwayHealth = await testUrl(`https://${RAILWAY_DOMAIN}/api/health`, 'Railway Health');
  console.log(`   Health Endpoint: ${railwayHealth.success ? '✅' : '❌'}`);
  if (railwayHealth.success) {
    console.log(`   Status: ${railwayHealth.status}`);
    console.log(`   Response Time: ${railwayHealth.duration}ms`);
    console.log(`   Headers:`, JSON.stringify(railwayHealth.headers, null, 2).substring(0, 300));
  } else {
    console.log(`   Error: ${railwayHealth.error}`);
  }
  console.log('');

  // Test Railway root
  const railwayRoot = await testUrl(`https://${RAILWAY_DOMAIN}/`, 'Railway Root');
  console.log(`   Root Endpoint: ${railwayRoot.success ? '✅' : '❌'}`);
  if (railwayRoot.success) {
    console.log(`   Status: ${railwayRoot.status}`);
  } else {
    console.log(`   Error: ${railwayRoot.error}`);
  }
  console.log('');

  console.log('2️⃣ Testing Cloudflare Proxy...\n');

  // Test Cloudflare health endpoint
  const cfHealth = await testUrl(`https://${CLOUDFLARE_DOMAIN}/api/health`, 'Cloudflare Health');
  console.log(`   Health Endpoint: ${cfHealth.success ? '✅' : '❌'}`);
  if (cfHealth.success) {
    console.log(`   Status: ${cfHealth.status}`);
    console.log(`   Response Time: ${cfHealth.duration}ms`);
    if (cfHealth.headers['cf-ray']) {
      console.log(`   CF-Ray: ${cfHealth.headers['cf-ray']}`);
    }
  } else {
    console.log(`   Error: ${cfHealth.error}`);
  }
  console.log('');

  // Test Cloudflare root
  const cfRoot = await testUrl(`https://${CLOUDFLARE_DOMAIN}/`, 'Cloudflare Root');
  console.log(`   Root Endpoint: ${cfRoot.success ? '✅' : '❌'}`);
  if (cfRoot.success) {
    console.log(`   Status: ${cfRoot.status}`);
  } else {
    console.log(`   Error: ${cfRoot.error}`);
  }
  console.log('');

  console.log('3️⃣ Diagnosis Summary...\n');

  if (!railwayHealth.success || railwayHealth.status !== 200) {
    console.log('❌ PROBLEM: Railway origin is not responding correctly');
    console.log('');
    console.log('   Possible causes:');
    console.log('   1. Railway service is not running');
    console.log('   2. Railway service crashed on startup');
    console.log('   3. Railway service is listening on wrong port');
    console.log('   4. Railway domain is incorrect');
    console.log('');
    console.log('   Fix:');
    console.log('   1. Go to Railway Dashboard → Your Service → Deployments');
    console.log('   2. Check latest deployment status and logs');
    console.log('   3. Look for startup errors or port mismatches');
    console.log('   4. Verify PORT environment variable is set to 8080');
    console.log('   5. Check if health check is passing');
  } else if (!cfHealth.success || cfHealth.status === 502) {
    console.log('❌ PROBLEM: Cloudflare cannot reach Railway');
    console.log('');
    console.log('   Possible causes:');
    console.log('   1. Cloudflare DNS pointing to wrong Railway domain');
    console.log('   2. Cloudflare SSL mode mismatch');
    console.log('   3. Railway SSL certificate not provisioned');
    console.log('');
    console.log('   Fix:');
    console.log('   1. Cloudflare Dashboard → DNS → Check CNAME record');
    console.log('      Should point to: ' + RAILWAY_DOMAIN);
    console.log('   2. Cloudflare Dashboard → SSL/TLS → Set to "Full"');
    console.log('   3. Railway Dashboard → Settings → Networking → Check SSL status');
  } else {
    console.log('✅ Both Railway and Cloudflare are working!');
  }
}

diagnose().catch(err => {
  console.error('❌ Diagnostic script error:', err);
  process.exit(1);
});
