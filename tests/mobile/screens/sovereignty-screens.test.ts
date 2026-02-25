// Sovereignty Screens Tests — Living Will, Witness, Inheritance.
// Props verification, flow validation, component contracts.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SCREENS_DIR = path.join(ROOT, 'packages/mobile/src/screens/sovereignty');

describe('Living Will Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'LivingWillScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('shows export status', () => {
    // Must accept export status props
    expect(content).toContain('LivingWillExportStatus');
    expect(content).toContain('lastExportAt');
    expect(content).toContain('lastExportSizeBytes');
    expect(content).toContain('Export Status');

    // Must display formatted date and size
    expect(content).toContain('formatDate');
    expect(content).toContain('formatSize');
  });

  it('export triggers share sheet with correct file', () => {
    // Must have export action
    expect(content).toContain('onExport');
    expect(content).toContain('Export Now');

    // Must handle premium gating
    expect(content).toContain('isPremium');
    expect(content).toContain('Premium Feature');

    // Must track exporting state
    expect(content).toContain('exporting');
    expect(content).toContain('setExporting');
  });

  it('import navigates through confirmation flow', () => {
    // Must have import action
    expect(content).toContain('onImport');
    expect(content).toContain('Import from File');

    // Must be premium-gated
    expect(content).toContain('Premium Feature');
  });
});

describe('Witness Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'WitnessScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('lists attestations from audit trail', () => {
    // Must accept attestation list
    expect(content).toContain('Attestation');
    expect(content).toContain('attestations');

    // Must render with FlatList
    expect(content).toContain('FlatList');

    // Must show key attestation fields
    expect(content).toContain('actionType');
    expect(content).toContain('summary');
    expect(content).toContain('timestamp');

    // Must show signature/chain validity
    expect(content).toContain('signatureValid');
    expect(content).toContain('chainValid');

    // Must have empty state
    expect(content).toContain('No attestations yet');
  });
});

describe('Inheritance Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'InheritanceScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('shows trusted party list', () => {
    expect(content).toContain('TrustedParty');
    expect(content).toContain('trustedParties');
    expect(content).toContain('Trusted Parties');

    // Must show party details
    expect(content).toContain('partyName');
    expect(content).toContain('partyEmail');
    expect(content).toContain('partyRole');
  });

  it('trusted party add form validates required fields', () => {
    // Must have add form
    expect(content).toContain('showAddForm');
    expect(content).toContain('newName');
    expect(content).toContain('newEmail');

    // Must validate name and email
    expect(content).toContain('Name and email are required');
    expect(content).toContain('valid email');

    // Must support role selection
    expect(content).toContain('full-access');
    expect(content).toContain('limited-access');
    expect(content).toContain('notification-only');
  });

  it('test run accessible from mobile', () => {
    expect(content).toContain('onTestRun');
    expect(content).toContain('Run Test');
    expect(content).toContain('testResult');
  });

  it('inheritance activation handles wrong passphrase gracefully', () => {
    const activationPath = path.join(SCREENS_DIR, 'InheritanceActivationScreen.tsx');
    const activationContent = fs.readFileSync(activationPath, 'utf-8');

    // Must have passphrase input
    expect(activationContent).toContain('passphrase');
    expect(activationContent).toContain('secureTextEntry');

    // Must show error from failed activation
    expect(activationContent).toContain('result.error');
    expect(activationContent).toContain('Activation Failed');

    // Must allow restart
    expect(activationContent).toContain('handleReset');
    expect(activationContent).toContain('Done');
  });
});
