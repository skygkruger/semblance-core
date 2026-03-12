#!/usr/bin/env node
// Test Gmail OAuth flow end-to-end in a single sidecar session.
// 1. Initialize sidecar
// 2. Trigger connector.auth for Gmail (opens browser)
// 3. Wait for user to complete auth
// 4. Test email fetch
// 5. Report results

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const SIDECAR = path.join(__dirname, '..', 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');

const sidecar = spawn('node', [SIDECAR], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let requestId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg = JSON.stringify({ id, method, params }) + '\n';
    sidecar.stdin.write(msg);
    // Timeout after 180s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Request ${id} timed out`));
      }
    }, 180000);
  });
}

// Parse NDJSON responses from stdout
const rl = readline.createInterface({ input: sidecar.stdout });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  } catch {}
});

// Forward stderr for diagnostics
sidecar.stderr.on('data', (data) => {
  const text = data.toString();
  // Only show relevant lines
  if (text.includes('[EmailAdapter]') || text.includes('[sidecar] OAuth') ||
      text.includes('[sidecar] Token') || text.includes('[sidecar] callback') ||
      text.includes('[sidecar] Storing') || text.includes('[sidecar] connector') ||
      text.includes('connector.debug') || text.includes('XOAUTH2') ||
      text.includes('Gmail') || text.includes('error') || text.includes('Error') ||
      text.includes('[sidecar] Core initialized') || text.includes('IPC')) {
    process.stderr.write(text);
  }
});

async function main() {
  console.log('=== Gmail OAuth End-to-End Test ===\n');

  // Step 1: Initialize
  console.log('[1/5] Initializing sidecar...');
  const initResult = await send('initialize');
  console.log('  Init result: ollamaStatus=' + (initResult.result?.ollamaStatus ?? 'unknown'));
  console.log('  ✓ Sidecar initialized\n');

  // Step 2: Check current token state
  console.log('[2/5] Checking current token state...');
  const debugBefore = await send('connector.debug', { connectorId: 'gmail' });
  const state = debugBefore.result;
  console.log('  clientIdSet:', state.clientIdSet);
  console.log('  hasTokens:', state.hasTokens);
  console.log('  hasAccessToken:', state.hasAccessToken);
  console.log('  hasRefreshToken:', state.hasRefreshToken);
  console.log('  userEmail:', state.userEmail);
  console.log();

  if (state.hasTokens && !state.isExpired) {
    console.log('  Tokens already present and valid! Skipping OAuth flow.\n');
  } else {
    // Step 3: Trigger OAuth
    console.log('[3/5] Starting Gmail OAuth flow (opening browser)...');
    console.log('  >>> COMPLETE THE GOOGLE SIGN-IN IN YOUR BROWSER <<<\n');
    const authResult = await send('connector.auth', { connectorId: 'gmail' });
    console.log('  Auth result:', JSON.stringify(authResult.result ?? authResult.error, null, 2));
    if (authResult.result?.success) {
      console.log('  ✓ OAuth successful!\n');
    } else {
      console.log('  ✗ OAuth FAILED. Cannot proceed.\n');
      process.exit(1);
    }
  }

  // Step 4: Verify tokens
  console.log('[4/5] Verifying tokens after auth...');
  const debugAfter = await send('connector.debug', { connectorId: 'gmail' });
  const stateAfter = debugAfter.result;
  console.log('  hasTokens:', stateAfter.hasTokens);
  console.log('  isExpired:', stateAfter.isExpired);
  console.log('  hasAccessToken:', stateAfter.hasAccessToken);
  console.log('  hasRefreshToken:', stateAfter.hasRefreshToken);
  console.log('  userEmail:', stateAfter.userEmail);
  console.log();

  // Step 5: Test email fetch
  console.log('[5/5] Testing email fetch (IMAP XOAUTH2)...');
  const emailResult = await send('email:startIndex', { account_id: 'gmail' });
  console.log('  Email index result:', JSON.stringify(emailResult.result ?? emailResult.error));

  // Wait a bit for the async fetch to complete
  await new Promise(r => setTimeout(r, 15000));

  console.log('\n=== Test Complete ===');
  sidecar.stdin.end();
  setTimeout(() => process.exit(0), 2000);
}

main().catch(err => {
  console.error('Test failed:', err.message);
  sidecar.stdin.end();
  setTimeout(() => process.exit(1), 1000);
});
