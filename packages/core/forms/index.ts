// Form & Bureaucracy Automation Extension — Entry point and barrel exports.
// Wires all form classes together into a SemblanceExtension.
// Registered via the extension interface — NOT hardcoded in orchestrator or proactive engine.
// CRITICAL: This file is in packages/core/. No network imports.

import type { SemblanceExtension } from '../extensions/types.js';
import type { DatabaseHandle } from '../platform/types.js';
import type { LLMProvider } from '../llm/types.js';
import type { AutonomyManager } from '../agent/autonomy.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { SemanticSearch } from '../knowledge/search.js';

import { PDFFieldDetector } from './pdf-field-detector.js';
import { UserDataResolver } from './user-data-resolver.js';
import { PDFFormFiller } from './pdf-form-filler.js';
import { FormTemplateEngine } from './form-templates.js';
import { BureaucracyTracker } from './bureaucracy-tracker.js';
import { FormManager } from './form-manager.js';
import { createFormTools } from './extension-tools.js';
import { FormInsightTracker } from './insight-tracker.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { PDFFieldDetector } from './pdf-field-detector.js';
export { UserDataResolver } from './user-data-resolver.js';
export { PDFFormFiller } from './pdf-form-filler.js';
export { FormTemplateEngine } from './form-templates.js';
export { BureaucracyTracker } from './bureaucracy-tracker.js';
export { FormManager } from './form-manager.js';
export { createFormTools } from './extension-tools.js';
export { FormInsightTracker } from './insight-tracker.js';
export type {
  PDFFormField,
  PDFFormAnalysis,
  PDFFieldType,
  ResolvedField,
  FieldConfidence,
  FormTemplate,
  FormFieldMapping,
  FormCategory,
  FormFillRequest,
  FormFillResult,
  FormFillPreview,
  FormSubmission,
  FormSubmissionStatus,
} from './types.js';

// ─── Extension Factory ───────────────────────────────────────────────────────

export interface FormExtensionDeps {
  db: DatabaseHandle;
  llm: LLMProvider;
  model: string;
  autonomyManager: AutonomyManager;
  premiumGate: PremiumGate;
  semanticSearch: SemanticSearch;
}

export function createFormExtension(deps: FormExtensionDeps): SemblanceExtension {
  // Build core classes
  const detector = new PDFFieldDetector();

  const resolver = new UserDataResolver({
    semanticSearch: deps.semanticSearch,
    llm: deps.llm,
    model: deps.model,
  });

  const filler = new PDFFormFiller();
  const templates = new FormTemplateEngine();
  const tracker = new BureaucracyTracker(deps.db);

  const formManager = new FormManager({
    detector,
    resolver,
    filler,
    tracker,
    templates,
    autonomyManager: deps.autonomyManager,
    premiumGate: deps.premiumGate,
  });

  // Build extension tools
  const tools = createFormTools({
    formManager,
    tracker,
    templates,
    premiumGate: deps.premiumGate,
  });

  // Build insight tracker
  const insightTracker = new FormInsightTracker({
    tracker,
    premiumGate: deps.premiumGate,
  });

  return {
    id: '@semblance/forms',
    name: 'Form & Bureaucracy Automation',
    version: '1.0.0',
    tools,
    insightTrackers: [insightTracker],
    insightTypes: [
      'form-reminder-due',
      'form-needs-attention',
    ],
  };
}
