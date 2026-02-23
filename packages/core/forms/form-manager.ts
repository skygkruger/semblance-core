// Form Manager — Orchestrates the full form fill workflow:
// detect → resolve → fill → track. Respects autonomy tiers and premium gate.
// CRITICAL: This file is in packages/core/. No network imports.

import type { AutonomyManager } from '../agent/autonomy.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { AutonomyTier } from '../agent/types.js';
import { nanoid } from 'nanoid';
import type { PDFFieldDetector } from './pdf-field-detector.js';
import type { UserDataResolver } from './user-data-resolver.js';
import type { PDFFormFiller } from './pdf-form-filler.js';
import type { BureaucracyTracker } from './bureaucracy-tracker.js';
import type { FormTemplateEngine } from './form-templates.js';
import type { FormFillResult, ResolvedField } from './types.js';

// ─── Autonomy Matrix for Form Fill ─────────────────────────────────────────
//
// | Phase                    | Guardian                     | Partner                        | Alter Ego                  |
// |--------------------------|------------------------------|--------------------------------|----------------------------|
// | Field detection          | Auto                         | Auto                           | Auto                       |
// | Auto-fill known fields   | Show preview, wait approval  | Fill, highlight uncertain      | Fill all                   |
// | LLM-mapped fields        | Show preview, wait approval  | Show preview, wait approval    | Fill, flag low-confidence  |
// | Final submission         | User submits manually        | User submits manually          | Auto-save filled PDF       |

export type FormFillMode = 'preview' | 'fill-known' | 'fill-all';

export class FormManager {
  private detector: PDFFieldDetector;
  private resolver: UserDataResolver;
  private filler: PDFFormFiller;
  private tracker: BureaucracyTracker;
  private templates: FormTemplateEngine;
  private autonomyManager: AutonomyManager;
  private premiumGate: PremiumGate;

  constructor(config: {
    detector: PDFFieldDetector;
    resolver: UserDataResolver;
    filler: PDFFormFiller;
    tracker: BureaucracyTracker;
    templates: FormTemplateEngine;
    autonomyManager: AutonomyManager;
    premiumGate: PremiumGate;
  }) {
    this.detector = config.detector;
    this.resolver = config.resolver;
    this.filler = config.filler;
    this.tracker = config.tracker;
    this.templates = config.templates;
    this.autonomyManager = config.autonomyManager;
    this.premiumGate = config.premiumGate;
  }

  /**
   * Analyze a PDF and auto-fill fields based on autonomy tier.
   */
  async analyzeAndFill(
    pdfBuffer: Buffer,
    filePath: string,
    fileName: string,
  ): Promise<FormFillResult> {
    // Check premium gate
    if (!this.premiumGate.isFeatureAvailable('form-automation' as PremiumFeature)) {
      return this.makeResult(filePath, fileName, [], null, undefined);
    }

    // Detect fields
    const analysis = await this.detector.analyzeForm(pdfBuffer, filePath, fileName);

    if (analysis.fieldCount === 0) {
      return this.makeResult(filePath, fileName, [], null, undefined);
    }

    if (analysis.hasXFA) {
      // XFA forms: flag but don't parse
      return this.makeResult(filePath, fileName, [], null, undefined);
    }

    // Resolve fields
    const resolvedFields = await this.resolver.resolveFields(analysis.fields);

    // Auto-detect template
    const fieldNames = analysis.fields.map(f => f.name);
    const matchedTemplate = this.templates.matchTemplate(fieldNames);

    // Determine fill mode based on autonomy tier
    const tier = this.autonomyManager.getDomainTier('files');
    const fillMode = this.getFillMode(tier);

    let filledPdfBuffer: Buffer | null = null;

    if (fillMode === 'fill-all') {
      // Alter Ego: fill everything
      filledPdfBuffer = await this.filler.fillForm(pdfBuffer, resolvedFields);
    } else if (fillMode === 'fill-known') {
      // Partner: fill high-confidence only
      const highConfidence = resolvedFields.filter(
        f => f.confidence === 'high' && f.value && !f.requiresManualEntry
      );
      filledPdfBuffer = await this.filler.fillForm(pdfBuffer, highConfidence);
    }
    // Guardian: preview only, no filling

    return this.makeResult(
      filePath,
      fileName,
      resolvedFields,
      filledPdfBuffer,
      matchedTemplate?.id,
    );
  }

  /**
   * Apply a specific template's field mappings to a form.
   */
  async applyTemplate(
    pdfBuffer: Buffer,
    filePath: string,
    fileName: string,
    templateId: string,
  ): Promise<FormFillResult> {
    const template = this.templates.getTemplate(templateId);
    if (!template) {
      return this.makeResult(filePath, fileName, [], null, templateId);
    }

    // Analyze and fill using the same pipeline
    return this.analyzeAndFill(pdfBuffer, filePath, fileName);
  }

  /**
   * Record a filled form as a submission for bureaucracy tracking.
   */
  submitForm(fillResultId: string, formName: string, templateId?: string): string {
    const template = templateId ? this.templates.getTemplate(templateId) : null;
    const submission = this.tracker.createSubmission({
      formName,
      templateId,
      expectedResponseDays: template?.expectedProcessingDays ?? 14,
    });
    return submission.id;
  }

  /**
   * Get form submission history.
   */
  getFormHistory(limit?: number) {
    const all = this.tracker.getPendingSubmissions();
    return limit ? all.slice(0, limit) : all;
  }

  private getFillMode(tier: AutonomyTier): FormFillMode {
    switch (tier) {
      case 'guardian': return 'preview';
      case 'partner': return 'fill-known';
      case 'alter_ego': return 'fill-all';
      default: return 'preview';
    }
  }

  private makeResult(
    filePath: string,
    fileName: string,
    resolvedFields: ResolvedField[],
    filledPdfBuffer: Buffer | null,
    templateId: string | undefined,
  ): FormFillResult {
    let uncertainCount = 0;
    let manualEntryCount = 0;
    for (const f of resolvedFields) {
      if (f.requiresManualEntry) manualEntryCount++;
      else if (f.confidence === 'low' || f.value === null) uncertainCount++;
    }

    return {
      id: `ff_${nanoid()}`,
      filePath,
      fileName,
      resolvedFields,
      filledPdfBuffer,
      preview: {
        fields: resolvedFields,
        uncertainCount,
        manualEntryCount,
        templateMatch: templateId,
      },
      templateId,
      createdAt: new Date().toISOString(),
    };
  }
}
