// Digital Representative Extension — Entry point and barrel exports.
// Wires all representative classes together into a SemblanceExtension.
// Registered via the extension interface — NOT hardcoded in orchestrator or proactive engine.
// CRITICAL: This file is in packages/core/. No network imports.

import type { SemblanceExtension } from '../extensions/types.js';
import type { DatabaseHandle } from '../platform/types.js';
import type { LLMProvider } from '../llm/types.js';
import type { IPCClient } from '../agent/ipc-client.js';
import type { AutonomyManager } from '../agent/autonomy.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { StyleProfileStore } from '../style/style-profile.js';
import type { SemanticSearch } from '../knowledge/search.js';
import type { RecurringDetector } from '../finance/recurring-detector.js';

import { StyleProfileProviderImpl } from './style-profile-provider.js';
import { KnowledgeProviderImpl } from './knowledge-provider.js';
import { RepresentativeEmailDrafter } from './email-drafter.js';
import { SupportEmailExtractor } from './support-email-extractor.js';
import { CancellationEngine } from './cancellation-engine.js';
import { TemplateEngine } from './template-engine.js';
import { FollowUpTracker } from './follow-up-tracker.js';
import { RepresentativeActionManager } from './action-manager.js';
import { createRepresentativeTools } from './extension-tools.js';
import { RepresentativeInsightTracker } from './insight-tracker.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { StyleProfileProviderImpl } from './style-profile-provider.js';
export { KnowledgeProviderImpl } from './knowledge-provider.js';
export { RepresentativeEmailDrafter } from './email-drafter.js';
export { SupportEmailExtractor } from './support-email-extractor.js';
export { CancellationEngine } from './cancellation-engine.js';
export { TemplateEngine } from './template-engine.js';
export { FollowUpTracker } from './follow-up-tracker.js';
export { RepresentativeActionManager } from './action-manager.js';
export { createRepresentativeTools } from './extension-tools.js';
export { RepresentativeInsightTracker } from './insight-tracker.js';
export type {
  DraftType,
  StyleProfileProvider,
  KnowledgeProvider,
  DraftEmailRequest,
  RepresentativeDraft,
  RepresentativeActionClassification,
  RepresentativeAction,
  CancellableSubscription,
  SupportContact,
  FollowUp,
  FollowUpStage,
  EmailTemplate,
  TemplateField,
} from './types.js';

// ─── Extension Factory ───────────────────────────────────────────────────────

export interface RepresentativeExtensionDeps {
  db: DatabaseHandle;
  llm: LLMProvider;
  model: string;
  ipcClient: IPCClient;
  autonomyManager: AutonomyManager;
  premiumGate: PremiumGate;
  styleProfileStore: StyleProfileStore;
  semanticSearch: SemanticSearch;
  recurringDetector: RecurringDetector;
}

export function createRepresentativeExtension(deps: RepresentativeExtensionDeps): SemblanceExtension {
  // Build providers
  const styleProvider = new StyleProfileProviderImpl(deps.styleProfileStore);
  const knowledgeProvider = new KnowledgeProviderImpl(deps.semanticSearch);

  // Build core classes
  const emailDrafter = new RepresentativeEmailDrafter({
    llm: deps.llm,
    model: deps.model,
    styleProvider,
    knowledgeProvider,
  });

  const supportExtractor = new SupportEmailExtractor({
    knowledgeProvider,
    llm: deps.llm,
    model: deps.model,
  });

  const followUpTracker = new FollowUpTracker(deps.db);

  const cancellationEngine = new CancellationEngine({
    db: deps.db,
    recurringDetector: deps.recurringDetector,
    emailDrafter,
    supportExtractor,
  });

  const templateEngine = new TemplateEngine(emailDrafter);

  const actionManager = new RepresentativeActionManager({
    db: deps.db,
    ipcClient: deps.ipcClient,
    autonomyManager: deps.autonomyManager,
    premiumGate: deps.premiumGate,
    followUpTracker,
  });

  // Build extension tools
  const tools = createRepresentativeTools({
    cancellationEngine,
    templateEngine,
    actionManager,
    followUpTracker,
  });

  // Build insight tracker
  const insightTracker = new RepresentativeInsightTracker({
    followUpTracker,
    actionManager,
    premiumGate: deps.premiumGate,
  });

  return {
    id: '@semblance/representative',
    name: 'Digital Representative',
    version: '1.0.0',
    tools,
    insightTrackers: [insightTracker],
    insightTypes: [
      'follow-up-needed',
      'cancellation-recommendation',
      'pending-approval',
      'representative-action-complete',
    ],
  };
}
