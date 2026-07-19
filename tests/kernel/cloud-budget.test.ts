import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CloudBudgetStore,
  createDefaultCloudBudgetDocument,
  loadCloudBudgetDocument,
  saveCloudBudgetDocument,
} from '../../packages/kernel/src/budget/cloud-budget-store.js';

describe('CloudBudgetStore', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when cloud is locally disabled', () => {
    const store = new CloudBudgetStore(createDefaultCloudBudgetDocument());
    store.setCloudDisabled(true);

    const result = store.checkBeforeDisclosure({
      estimatedCostCents: 15,
      destination: 'confidential',
      modelClass: 'inference-standard',
      voucherAvailable: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cloud_disabled_locally');
  });

  it('fails closed when voucher is unavailable', () => {
    const store = new CloudBudgetStore(createDefaultCloudBudgetDocument());

    const result = store.checkBeforeDisclosure({
      estimatedCostCents: 15,
      destination: 'confidential',
      modelClass: 'inference-standard',
      voucherAvailable: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('insufficient_voucher');
  });

  it('fails closed when daily budget would be exceeded', () => {
    const store = new CloudBudgetStore({
      ...createDefaultCloudBudgetDocument(),
      dailyHardLimitCents: 20,
      dailySpentCents: 10,
    });

    const result = store.checkBeforeDisclosure({
      estimatedCostCents: 15,
      destination: 'confidential',
      modelClass: 'inference-standard',
      voucherAvailable: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily_budget_exceeded');
  });

  it('records spend and emits threshold alerts', () => {
    const store = new CloudBudgetStore({
      ...createDefaultCloudBudgetDocument(),
      dailyHardLimitCents: 100,
      alertThresholdPercent: 50,
    });

    store.recordSpend(60);
    const summary = store.getSpendSummary();

    expect(summary.dailySpentCents).toBe(60);
    expect(summary.alerts.some((alert) => alert.includes('Daily confidential spend'))).toBe(true);
  });

  it('persists through JSON file load/save path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cloud-budget-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'cloud-budget.json');

    const saved = saveCloudBudgetDocument(filePath, {
      ...createDefaultCloudBudgetDocument(),
      perTaskEstimateCents: 25,
      monthlyHardLimitCents: 2500,
    });

    const reloaded = loadCloudBudgetDocument(filePath);
    expect(reloaded.perTaskEstimateCents).toBe(saved.perTaskEstimateCents);
    expect(reloaded.monthlyHardLimitCents).toBe(2500);
  });
});
