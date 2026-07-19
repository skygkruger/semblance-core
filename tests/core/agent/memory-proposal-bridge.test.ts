import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

describe('memory proposal bridge handlers', () => {
  const requiredHandlers = [
    'memory:list_proposals',
    'memory:confirm',
    'memory:correct',
    'memory:dismiss',
  ];

  for (const handler of requiredHandlers) {
    it(`has handler for '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }

  it('imports MemoryProposalStore and memory proposal APIs', () => {
    expect(BRIDGE).toContain('MemoryProposalStore');
    expect(BRIDGE).toContain('confirmMemoryProposal');
    expect(BRIDGE).toContain('correctMemoryProposal');
    expect(BRIDGE).toContain('dismissMemoryProposal');
    expect(BRIDGE).toContain('promoteConfirmedMemory');
  });

  it('records preference signals into memory proposals during maintenance', () => {
    expect(BRIDGE).toContain('memoryProposalStore.recordPreferenceSignal(signal)');
  });
});
