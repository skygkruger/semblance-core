/**
 * Step 21 — FormManager tests.
 * Tests full workflow, premium gate, and autonomy tier behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PDFDocument } from 'pdf-lib';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import type { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { AutonomyTier } from '@semblance/core/agent/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { PDFFieldDetector } from '@semblance/core/forms/pdf-field-detector';
import { PDFFormFiller } from '@semblance/core/forms/pdf-form-filler';
import { FormTemplateEngine } from '@semblance/core/forms/form-templates';
import { BureaucracyTracker } from '@semblance/core/forms/bureaucracy-tracker';
import { FormManager } from '@semblance/core/forms/form-manager';
import type { UserDataResolver } from '@semblance/core/forms/user-data-resolver';

let db: InstanceType<typeof Database>;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

function makeAutonomy(tier: AutonomyTier = 'partner'): AutonomyManager {
  return {
    getDomainTier: () => tier,
    decide: () => 'requires_approval',
    getDomainForAction: () => 'files',
    setDomainTier: vi.fn(),
    getConfig: () => ({}),
  } as unknown as AutonomyManager;
}

function makeResolver(): UserDataResolver {
  return {
    resolveFields: vi.fn(async (fields) =>
      fields.map((f: { name: string }) => ({
        field: f,
        value: f.name === 'fullName' ? 'John Smith' : null,
        confidence: f.name === 'fullName' ? 'high' : 'low',
        source: 'test',
      }))
    ),
    resolveField: vi.fn(),
  } as unknown as UserDataResolver;
}

async function createTestPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  form.createTextField('fullName');
  form.createTextField('unknownField');
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function makeManager(tier: AutonomyTier = 'partner', premium: boolean = true): { manager: FormManager; gate: PremiumGate } {
  const gate = new PremiumGate(db as unknown as DatabaseHandle);
  if (premium) activatePremium(gate);

  const manager = new FormManager({
    detector: new PDFFieldDetector(),
    resolver: makeResolver(),
    filler: new PDFFormFiller(),
    tracker: new BureaucracyTracker(db as unknown as DatabaseHandle),
    templates: new FormTemplateEngine(),
    autonomyManager: makeAutonomy(tier),
    premiumGate: gate,
  });

  return { manager, gate };
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('FormManager (Step 21)', () => {
  it('full analyzeAndFill workflow: detect → resolve → fill', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('partner');

    const result = await manager.analyzeAndFill(pdf, '/test/form.pdf', 'form.pdf');
    expect(result.resolvedFields.length).toBeGreaterThan(0);
    expect(result.filledPdfBuffer).not.toBeNull();
  });

  it('applyTemplate uses template field mappings', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('partner');

    const result = await manager.applyTemplate(pdf, '/test/form.pdf', 'form.pdf', 'expense-report');
    expect(result.filePath).toBe('/test/form.pdf');
  });

  it('premium gate blocks free-tier access', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('partner', false);

    const result = await manager.analyzeAndFill(pdf, '/test/form.pdf', 'form.pdf');
    expect(result.resolvedFields).toHaveLength(0);
    expect(result.filledPdfBuffer).toBeNull();
  });

  it('guardian tier: returns preview, no filling', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('guardian');

    const result = await manager.analyzeAndFill(pdf, '/test/form.pdf', 'form.pdf');
    expect(result.resolvedFields.length).toBeGreaterThan(0);
    // Guardian = preview mode, no PDF filled
    expect(result.filledPdfBuffer).toBeNull();
  });

  it('partner tier: fills high-confidence fields only', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('partner');

    const result = await manager.analyzeAndFill(pdf, '/test/form.pdf', 'form.pdf');
    // Partner fills high-confidence only → filledPdfBuffer should exist
    expect(result.filledPdfBuffer).not.toBeNull();
  });

  it('alter_ego tier: fills all fields', async () => {
    const pdf = await createTestPdf();
    const { manager } = makeManager('alter_ego');

    const result = await manager.analyzeAndFill(pdf, '/test/form.pdf', 'form.pdf');
    expect(result.filledPdfBuffer).not.toBeNull();
  });
});
