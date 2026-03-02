/**
 * Screen Wiring Integration Tests
 *
 * Static analysis validating:
 * - Desktop screens import from @semblance/ui or ../ipc
 * - KnowledgeGraphScreen imports from semblance-ui
 * - MorningBriefScreen imports from semblance-ui
 * - PrivacyScreen imports PrivacyDashboard from semblance-ui
 * - ChatScreen imports AgentInput from semblance-ui
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SCREENS_DIR = join(ROOT, 'packages', 'desktop', 'src', 'screens');

function readScreen(name: string): string {
  return readFileSync(join(SCREENS_DIR, name), 'utf-8');
}

describe('Screen Wiring — UI Library Integration', () => {
  it('desktop screens import from @semblance/ui or ../ipc', () => {
    const screensToCheck = [
      'ConnectionsScreen.tsx',
      'PrivacyScreen.tsx',
      'KnowledgeGraphScreen.tsx',
      'MorningBriefScreen.tsx',
    ];

    for (const screenFile of screensToCheck) {
      const content = readScreen(screenFile);
      const importsFromUI = content.includes("from '@semblance/ui'");
      const importsFromIPC = content.includes("from '../ipc/commands'");
      expect(
        importsFromUI || importsFromIPC,
      ).toBe(true);
    }
  });

  it('KnowledgeGraphScreen imports from @semblance/ui', () => {
    const content = readScreen('KnowledgeGraphScreen.tsx');
    // Should import WireframeSpinner or KnowledgeGraph from the UI library
    expect(content).toContain("from '@semblance/ui'");
  });

  it('MorningBriefScreen imports from @semblance/ui', () => {
    const content = readScreen('MorningBriefScreen.tsx');
    // Should import WireframeSpinner or BriefingCard from the UI library
    expect(content).toContain("from '@semblance/ui'");
  });

  it('PrivacyScreen imports PrivacyDashboard from @semblance/ui', () => {
    const content = readScreen('PrivacyScreen.tsx');
    expect(content).toContain('PrivacyDashboard');
    expect(content).toContain("from '@semblance/ui'");
  });

  it('ChatScreen imports AgentInput from @semblance/ui', () => {
    const content = readScreen('ChatScreen.tsx');
    expect(content).toContain('AgentInput');
    expect(content).toContain("from '@semblance/ui'");
  });
});
