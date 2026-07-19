import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DisclosureReceipt } from './disclosure-receipt.js';

export type ExecutionRunStatus = 'success' | 'ask' | 'reject';

export interface ExecutionRunReceipt {
  readonly id: string;
  readonly requestId: string;
  readonly capabilityId: string;
  readonly domain: string;
  readonly taskType: string;
  readonly status: ExecutionRunStatus;
  readonly destination: string | null;
  readonly reason: string;
  readonly timestamp: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly disclosureReceipt: DisclosureReceipt | null;
}

interface ExecutionReceiptDocument {
  readonly schemaVersion: 1;
  readonly receipts: ExecutionRunReceipt[];
}

const MAX_RECEIPTS = 100;

export function createExecutionReceiptStore(filePath: string) {
  function loadDocument(): ExecutionReceiptDocument {
    if (!existsSync(filePath)) {
      return { schemaVersion: 1, receipts: [] };
    }

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<ExecutionReceiptDocument>;
      const receipts = Array.isArray(parsed.receipts)
        ? parsed.receipts.filter(isExecutionRunReceipt)
        : [];
      return { schemaVersion: 1, receipts };
    } catch {
      return { schemaVersion: 1, receipts: [] };
    }
  }

  function persist(document: ExecutionReceiptDocument): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }

  return {
    listRecent(limit = 20): ExecutionRunReceipt[] {
      const document = loadDocument();
      return document.receipts.slice(0, Math.max(1, Math.min(limit, MAX_RECEIPTS)));
    },

    append(receipt: ExecutionRunReceipt): ExecutionRunReceipt {
      const document = loadDocument();
      const next = [receipt, ...document.receipts.filter((entry) => entry.id !== receipt.id)]
        .slice(0, MAX_RECEIPTS);
      persist({ schemaVersion: 1, receipts: next });
      return receipt;
    },
  };
}

function isExecutionRunReceipt(value: unknown): value is ExecutionRunReceipt {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ExecutionRunReceipt>;
  return typeof record.id === 'string'
    && typeof record.requestId === 'string'
    && typeof record.capabilityId === 'string'
    && typeof record.domain === 'string'
    && typeof record.taskType === 'string'
    && (record.status === 'success' || record.status === 'ask' || record.status === 'reject')
    && typeof record.reason === 'string'
    && typeof record.timestamp === 'string';
}
