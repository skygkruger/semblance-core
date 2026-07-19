import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type CloudBudgetDestination = 'confidential';

export interface CloudBudgetDocument {
  readonly schemaVersion: 1;
  readonly perTaskEstimateCents: number;
  readonly dailyHardLimitCents: number;
  readonly monthlyHardLimitCents: number;
  readonly allowedDestinations: readonly CloudBudgetDestination[];
  readonly allowedModelClasses: readonly string[];
  readonly cloudDisabled: boolean;
  readonly alertThresholdPercent: number;
  readonly dailySpentCents: number;
  readonly monthlySpentCents: number;
  readonly spendDayKey: string;
  readonly spendMonthKey: string;
  readonly updatedAt: string;
}

export interface CloudBudgetCheckInput {
  readonly estimatedCostCents: number;
  readonly destination: string;
  readonly modelClass: string;
  readonly voucherAvailable: boolean;
}

export interface CloudBudgetCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly alerts: readonly string[];
}

export interface CloudBudgetSpendSummary {
  readonly dailySpentCents: number;
  readonly monthlySpentCents: number;
  readonly dailyHardLimitCents: number;
  readonly monthlyHardLimitCents: number;
  readonly perTaskEstimateCents: number;
  readonly cloudDisabled: boolean;
  readonly alertThresholdPercent: number;
  readonly alerts: readonly string[];
}

const DEFAULT_ALLOWED_DESTINATIONS: readonly CloudBudgetDestination[] = ['confidential'];
const DEFAULT_ALLOWED_MODEL_CLASSES = [
  'inference-small',
  'inference-standard',
  'inference-large',
] as const;

export function createDefaultCloudBudgetDocument(now = new Date()): CloudBudgetDocument {
  return {
    schemaVersion: 1,
    perTaskEstimateCents: 15,
    dailyHardLimitCents: 500,
    monthlyHardLimitCents: 5_000,
    allowedDestinations: [...DEFAULT_ALLOWED_DESTINATIONS],
    allowedModelClasses: [...DEFAULT_ALLOWED_MODEL_CLASSES],
    cloudDisabled: false,
    alertThresholdPercent: 80,
    dailySpentCents: 0,
    monthlySpentCents: 0,
    spendDayKey: dayKey(now),
    spendMonthKey: monthKey(now),
    updatedAt: now.toISOString(),
  };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeCloudBudgetDocument(input: unknown, now = new Date()): CloudBudgetDocument {
  const defaults = createDefaultCloudBudgetDocument(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }

  const record = input as Partial<CloudBudgetDocument>;
  const allowedDestinations = Array.isArray(record.allowedDestinations)
    ? record.allowedDestinations.filter((entry): entry is CloudBudgetDestination => entry === 'confidential')
    : defaults.allowedDestinations;

  const allowedModelClasses = Array.isArray(record.allowedModelClasses)
    ? record.allowedModelClasses.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : defaults.allowedModelClasses;

  return {
    schemaVersion: 1,
    perTaskEstimateCents: clampNumber(record.perTaskEstimateCents, 0, 1_000_000, defaults.perTaskEstimateCents),
    dailyHardLimitCents: clampNumber(record.dailyHardLimitCents, 0, 10_000_000, defaults.dailyHardLimitCents),
    monthlyHardLimitCents: clampNumber(record.monthlyHardLimitCents, 0, 100_000_000, defaults.monthlyHardLimitCents),
    allowedDestinations: allowedDestinations.length > 0 ? allowedDestinations : defaults.allowedDestinations,
    allowedModelClasses: allowedModelClasses.length > 0 ? allowedModelClasses : defaults.allowedModelClasses,
    cloudDisabled: record.cloudDisabled === true,
    alertThresholdPercent: clampNumber(record.alertThresholdPercent, 1, 100, defaults.alertThresholdPercent),
    dailySpentCents: clampNumber(record.dailySpentCents, 0, 100_000_000, 0),
    monthlySpentCents: clampNumber(record.monthlySpentCents, 0, 1_000_000_000, 0),
    spendDayKey: typeof record.spendDayKey === 'string' ? record.spendDayKey : defaults.spendDayKey,
    spendMonthKey: typeof record.spendMonthKey === 'string' ? record.spendMonthKey : defaults.spendMonthKey,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : defaults.updatedAt,
  };
}

export function loadCloudBudgetDocument(filePath: string): CloudBudgetDocument {
  if (!existsSync(filePath)) {
    return createDefaultCloudBudgetDocument();
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeCloudBudgetDocument(parsed);
  } catch {
    return createDefaultCloudBudgetDocument();
  }
}

export function saveCloudBudgetDocument(
  filePath: string,
  document: CloudBudgetDocument,
): CloudBudgetDocument {
  const normalized = normalizeCloudBudgetDocument(document);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function rolloverSpend(document: CloudBudgetDocument, now: Date): CloudBudgetDocument {
  const currentDay = dayKey(now);
  const currentMonth = monthKey(now);
  let dailySpentCents = document.dailySpentCents;
  let monthlySpentCents = document.monthlySpentCents;

  if (document.spendDayKey !== currentDay) {
    dailySpentCents = 0;
  }
  if (document.spendMonthKey !== currentMonth) {
    monthlySpentCents = 0;
  }

  return {
    ...document,
    dailySpentCents,
    monthlySpentCents,
    spendDayKey: currentDay,
    spendMonthKey: currentMonth,
    updatedAt: now.toISOString(),
  };
}

function computeAlerts(document: CloudBudgetDocument): string[] {
  const alerts: string[] = [];
  if (document.cloudDisabled) {
    alerts.push('Local cloud-disable is active — confidential transport blocked.');
  }
  if (document.dailyHardLimitCents > 0) {
    const dailyPercent = (document.dailySpentCents / document.dailyHardLimitCents) * 100;
    if (dailyPercent >= document.alertThresholdPercent) {
      alerts.push(`Daily confidential spend at ${Math.round(dailyPercent)}% of limit.`);
    }
  }
  if (document.monthlyHardLimitCents > 0) {
    const monthlyPercent = (document.monthlySpentCents / document.monthlyHardLimitCents) * 100;
    if (monthlyPercent >= document.alertThresholdPercent) {
      alerts.push(`Monthly confidential spend at ${Math.round(monthlyPercent)}% of limit.`);
    }
  }
  return alerts;
}

export class CloudBudgetStore {
  private document: CloudBudgetDocument;

  constructor(initial: CloudBudgetDocument) {
    this.document = rolloverSpend(normalizeCloudBudgetDocument(initial), new Date());
  }

  static fromFile(filePath: string): CloudBudgetStore {
    return new CloudBudgetStore(loadCloudBudgetDocument(filePath));
  }

  getDocument(): CloudBudgetDocument {
    return this.document;
  }

  setDocument(next: CloudBudgetDocument): CloudBudgetDocument {
    this.document = rolloverSpend(normalizeCloudBudgetDocument(next), new Date());
    return this.document;
  }

  setCloudDisabled(disabled: boolean): CloudBudgetDocument {
    this.document = {
      ...this.document,
      cloudDisabled: disabled,
      updatedAt: new Date().toISOString(),
    };
    return this.document;
  }

  getSpendSummary(now = new Date()): CloudBudgetSpendSummary {
    this.document = rolloverSpend(this.document, now);
    return {
      dailySpentCents: this.document.dailySpentCents,
      monthlySpentCents: this.document.monthlySpentCents,
      dailyHardLimitCents: this.document.dailyHardLimitCents,
      monthlyHardLimitCents: this.document.monthlyHardLimitCents,
      perTaskEstimateCents: this.document.perTaskEstimateCents,
      cloudDisabled: this.document.cloudDisabled,
      alertThresholdPercent: this.document.alertThresholdPercent,
      alerts: computeAlerts(this.document),
    };
  }

  checkBeforeDisclosure(input: CloudBudgetCheckInput, now = new Date()): CloudBudgetCheckResult {
    this.document = rolloverSpend(this.document, now);
    const alerts = computeAlerts(this.document);

    if (this.document.cloudDisabled) {
      return { allowed: false, reason: 'cloud_disabled_locally', alerts };
    }

    if (!input.voucherAvailable) {
      return { allowed: false, reason: 'insufficient_voucher', alerts };
    }

    if (!this.document.allowedDestinations.includes(input.destination as CloudBudgetDestination)) {
      return { allowed: false, reason: 'destination_not_allowed', alerts };
    }

    if (!this.document.allowedModelClasses.includes(input.modelClass)) {
      return { allowed: false, reason: 'model_class_not_allowed', alerts };
    }

    if (input.estimatedCostCents > this.document.perTaskEstimateCents) {
      return { allowed: false, reason: 'per_task_estimate_exceeded', alerts };
    }

    if (
      this.document.dailyHardLimitCents > 0
      && this.document.dailySpentCents + input.estimatedCostCents > this.document.dailyHardLimitCents
    ) {
      return { allowed: false, reason: 'daily_budget_exceeded', alerts };
    }

    if (
      this.document.monthlyHardLimitCents > 0
      && this.document.monthlySpentCents + input.estimatedCostCents > this.document.monthlyHardLimitCents
    ) {
      return { allowed: false, reason: 'monthly_budget_exceeded', alerts };
    }

    return { allowed: true, reason: 'allowed', alerts };
  }

  recordSpend(costCents: number, now = new Date()): CloudBudgetDocument {
    this.document = rolloverSpend(this.document, now);
    this.document = {
      ...this.document,
      dailySpentCents: this.document.dailySpentCents + costCents,
      monthlySpentCents: this.document.monthlySpentCents + costCents,
      updatedAt: now.toISOString(),
    };
    return this.document;
  }
}

export function createCloudBudgetStore(initial?: CloudBudgetDocument): CloudBudgetStore {
  return new CloudBudgetStore(initial ?? createDefaultCloudBudgetDocument());
}
