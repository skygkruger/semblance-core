/**
 * Step 27 — ActivationHandler tests (Commit 3, part 1).
 * Tests successful activation, wrong passphrase, time-lock state,
 * cancel during time-lock, cancel after expiry fails, advance past time-lock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { TrustedPartyManager } from '@semblance/core/inheritance/trusted-party-manager';
import { ActivationPackageGenerator } from '@semblance/core/inheritance/activation-package-generator';
import { ActivationHandler } from '@semblance/core/inheritance/activation-handler';
import { isInheritanceModeActive, disableInheritanceMode } from '@semblance/core/inheritance/inheritance-mode-guard';

let db: InstanceType<typeof Database>;
let store: InheritanceConfigStore;
let manager: TrustedPartyManager;
let generator: ActivationPackageGenerator;
let handler: ActivationHandler;

const PASSPHRASE = 'test-activation-passphrase';

beforeEach(() => {
  db = new Database(':memory:');
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
  manager = new TrustedPartyManager({ store });
  generator = new ActivationPackageGenerator({ store });
  handler = new ActivationHandler({ store });
  disableInheritanceMode();
});

afterEach(() => {
  disableInheritanceMode();
  db.close();
  vi.restoreAllMocks();
});

describe('ActivationHandler (Step 27)', () => {
  it('successfully activates with valid package and passphrase', async () => {
    const party = manager.addParty({
      name: 'Alice', email: 'alice@example.com', relationship: 'spouse', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const result = await handler.activate(pkg, PASSPHRASE);
    expect(result.success).toBe(true);
    expect(result.activationId).toBeTruthy();
    expect(result.state).toBe('time_locked');
    expect(result.timeLockExpiresAt).toBeTruthy();

    // Inheritance Mode should be active
    expect(isInheritanceModeActive()).toBe(true);
  });

  it('rejects activation with wrong passphrase', async () => {
    const party = manager.addParty({
      name: 'Bob', email: 'bob@example.com', relationship: 'sibling', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const result = await handler.activate(pkg, 'wrong-passphrase');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid passphrase');
  });

  it('creates activation in time_locked state with correct expiry', async () => {
    store.updateConfig({ timeLockHours: 24 });
    const party = manager.addParty({
      name: 'Carol', email: 'carol@example.com', relationship: 'friend', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const result = await handler.activate(pkg, PASSPHRASE);
    const activation = handler.getActivation(result.activationId!);

    expect(activation!.state).toBe('time_locked');
    expect(activation!.timeLockExpiresAt).toBeTruthy();

    const expiryTime = new Date(activation!.timeLockExpiresAt!).getTime();
    const activatedTime = new Date(activation!.activatedAt).getTime();
    const diff = expiryTime - activatedTime;
    expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -3); // ~24 hours in ms
  });

  it('allows cancel during time-lock state', async () => {
    const party = manager.addParty({
      name: 'Dave', email: 'dave@example.com', relationship: 'attorney', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const activateResult = await handler.activate(pkg, PASSPHRASE);
    expect(isInheritanceModeActive()).toBe(true);

    const cancelResult = handler.cancel(activateResult.activationId!);
    expect(cancelResult.success).toBe(true);

    const activation = handler.getActivation(activateResult.activationId!);
    expect(activation!.state).toBe('cancelled');
    expect(activation!.cancelledAt).toBeTruthy();
    expect(isInheritanceModeActive()).toBe(false);
  });

  it('rejects cancel when not in time_locked state', async () => {
    const party = manager.addParty({
      name: 'Eve', email: 'eve@example.com', relationship: 'spouse', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const activateResult = await handler.activate(pkg, PASSPHRASE);

    // Manually change state to 'executing' to test cancel rejection
    store.updateActivation(activateResult.activationId!, { state: 'executing' });

    const cancelResult = handler.cancel(activateResult.activationId!);
    expect(cancelResult.success).toBe(false);
    expect(cancelResult.error).toContain('only time_locked');
  });

  it('advances past time-lock when expired', async () => {
    store.updateConfig({ timeLockHours: 0 }); // Instant expiry for test
    const party = manager.addParty({
      name: 'Frank', email: 'frank@example.com', relationship: 'sibling', passphrase: PASSPHRASE,
    });
    const pkg = await generator.generate(party.id, PASSPHRASE);

    const activateResult = await handler.activate(pkg, PASSPHRASE);
    expect(handler.isTimeLockExpired(activateResult.activationId!)).toBe(true);

    const advance = handler.advancePastTimeLock(activateResult.activationId!);
    expect(advance.success).toBe(true);

    const activation = handler.getActivation(activateResult.activationId!);
    // Default config has requireStepConfirmation = true, so should be paused_for_confirmation
    expect(activation!.state).toBe('paused_for_confirmation');
  });
});
