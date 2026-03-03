/**
 * Transitive Dependency Scan Tests
 *
 * Verifies that the privacy audit's transitive dependency scanner
 * correctly identifies forbidden networking packages in the dependency
 * tree of packages/core/.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

// ─── Forbidden package list (must match scripts/privacy-audit/index.js) ───

const FORBIDDEN_TRANSITIVE_PACKAGES = [
  'axios', 'node-fetch', 'got', 'request', 'superagent', 'undici',
  'http2-wrapper', 'follow-redirects', 'needle', 'bent', 'ky', 'phin',
  'cross-fetch', 'isomorphic-fetch', 'native-fetch',
  'make-fetch-happen', 'minipass-fetch', 'agentkeepalive',
  'http-proxy-agent', 'https-proxy-agent', 'socks-proxy-agent',
  'proxy-agent', 'pac-proxy-agent', 'global-agent',
  'ws', 'socket.io', 'socket.io-client', 'sockjs', 'faye-websocket',
  'engine.io', 'primus',
  '@grpc/grpc-js', 'grpc', 'mqtt', 'amqplib', 'kafkajs', 'zeromq', 'nats',
  'ioredis', 'redis', 'tedious', 'pg', 'mysql2',
  '@sentry/node', '@amplitude/node', 'posthog-node', 'mixpanel',
  'analytics-node', '@segment/analytics-node', 'newrelic', 'dd-trace',
];

const TRANSITIVE_EXEMPT_PACKAGES = ['ollama'];

// ─── Utility functions (replicated from script for unit testing) ───

interface DepInfo {
  dependencies?: Record<string, DepInfo>;
  [key: string]: unknown;
}

interface FlatDep {
  name: string;
  chain: string[];
  exempt: boolean;
}

function flattenDeps(
  deps: Record<string, DepInfo>,
  chain: string[] = [],
  exemptRoots: Set<string> = new Set(),
): FlatDep[] {
  const results: FlatDep[] = [];
  if (!deps || typeof deps !== 'object') return results;

  for (const [name, info] of Object.entries(deps)) {
    const currentChain = [...chain, name];
    const isExempt = exemptRoots.has(name) || chain.some(p => exemptRoots.has(p));
    results.push({ name, chain: currentChain, exempt: isExempt });

    if (info && typeof info === 'object' && info.dependencies) {
      const newExempt = TRANSITIVE_EXEMPT_PACKAGES.includes(name)
        ? new Set([...exemptRoots, name])
        : exemptRoots;
      results.push(...flattenDeps(info.dependencies, currentChain, newExempt));
    }
  }
  return results;
}

function isForbiddenPackage(pkgName: string): boolean {
  return FORBIDDEN_TRANSITIVE_PACKAGES.some(forbidden => {
    if (forbidden.startsWith('@')) {
      return pkgName === forbidden || pkgName.startsWith(forbidden + '/');
    }
    return pkgName === forbidden;
  });
}

describe('Transitive Dependency Scanning', () => {
  // ─── Unit tests for flatten + detection logic ───

  it('detects forbidden package at depth 1 (direct dependency)', () => {
    const tree: Record<string, DepInfo> = {
      axios: { version: '1.0.0' },
    };
    const flat = flattenDeps(tree);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.name).toBe('axios');
  });

  it('detects forbidden package at depth 3 (transitive)', () => {
    const tree: Record<string, DepInfo> = {
      'safe-lib': {
        dependencies: {
          'inner-lib': {
            dependencies: {
              'node-fetch': { version: '3.0.0' },
            },
          },
        },
      },
    };
    const flat = flattenDeps(tree);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.name).toBe('node-fetch');
    expect(violations[0]!.chain).toEqual(['safe-lib', 'inner-lib', 'node-fetch']);
  });

  it('passes clean with no forbidden packages', () => {
    const tree: Record<string, DepInfo> = {
      nanoid: { version: '5.0.0' },
      zod: { version: '3.22.0' },
      'hash-wasm': { version: '4.12.0' },
    };
    const flat = flattenDeps(tree);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(0);
  });

  it('does NOT flag substring matches (fetch-blob vs node-fetch)', () => {
    const tree: Record<string, DepInfo> = {
      'fetch-blob': { version: '3.0.0' },
      'node-fetch-native': { version: '1.0.0' }, // Not the same as 'node-fetch'
    };
    const flat = flattenDeps(tree);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(0);
  });

  it('exempts transitive dependencies under ollama', () => {
    const tree: Record<string, DepInfo> = {
      ollama: {
        dependencies: {
          'whatwg-fetch': { version: '3.6.20' },
        },
      },
    };
    const exemptRoots = new Set(TRANSITIVE_EXEMPT_PACKAGES);
    const flat = flattenDeps(tree, [], exemptRoots);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(0);
  });

  it('detects deeply nested forbidden dep (depth 10)', () => {
    // Build a 10-level deep tree with forbidden package at the bottom
    let deepDeps: Record<string, DepInfo> = {
      'socket.io': { version: '4.0.0' },
    };
    for (let i = 9; i >= 1; i--) {
      deepDeps = { [`level-${i}`]: { dependencies: deepDeps } };
    }
    const flat = flattenDeps(deepDeps);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.name).toBe('socket.io');
    expect(violations[0]!.chain).toHaveLength(10);
  });

  it('detects scoped forbidden package (@sentry/node)', () => {
    const tree: Record<string, DepInfo> = {
      '@sentry/node': { version: '7.0.0' },
    };
    const flat = flattenDeps(tree);
    const violations = flat.filter(d => !d.exempt && isForbiddenPackage(d.name));
    expect(violations).toHaveLength(1);
    expect(violations[0]!.name).toBe('@sentry/node');
  });

  // ─── Integration test ───

  it('transitive dependency scan passes clean for current packages/core/', () => {
    const output = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 60000,
    });
    expect(output).toContain('RESULT: CLEAN');
    expect(output).toContain('No forbidden networking packages in dependency tree');
  });
});
