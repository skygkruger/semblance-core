import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');
const LOAD_SIGNED = readFileSync(
  join(ROOT, 'packages/extension-runner/src/load-signed.ts'),
  'utf-8',
);

describe('Slice 12.2 extension publisher trust bridge handlers', () => {
  const requiredHandlers = [
    'extension:list_publishers',
    'extension:trust_publisher',
    'extension:revoke_publisher',
  ];

  for (const handler of requiredHandlers) {
    it(`registers '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }

  it('initializes extension publisher trust store during handleInitialize', () => {
    expect(BRIDGE).toContain('ensureExtensionPublisherTrustStore');
    expect(BRIDGE).toContain('extensionTrustChecker: extensionPublisherTrustStore?.createTrustChecker()');
  });
});

describe('Slice 12.2 extension runner trust wiring', () => {
  it('load-signed consults trustChecker before loading', () => {
    expect(LOAD_SIGNED).toContain('trustChecker.checkTrust');
    expect(LOAD_SIGNED).toContain('resolveTrustChecker');
  });
});
