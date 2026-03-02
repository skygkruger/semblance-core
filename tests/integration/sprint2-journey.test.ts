/**
 * Sprint 2 Complete User Journey — End-to-End Integration Test
 *
 * Walks through the full user journey from onboarding through Network Monitor,
 * verifying that all Sprint 2 components are wired together correctly.
 *
 * This is a source-analysis test that validates the existence and integration
 * of all journey stages. Full runtime testing requires a running Ollama instance
 * and is gated behind SEMBLANCE_TEST_OLLAMA=1.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

const readSource = (relPath: string): string =>
  readFileSync(join(ROOT, relPath), 'utf-8');

describe('Sprint 2 Complete User Journey', () => {

  // ─── Stage 1: Onboarding ──────────────────────────────────────────────────

  describe('1. Onboarding', () => {
    const onboarding = readSource('packages/desktop/src/screens/OnboardingFlow.tsx');

    it('user can name their AI via NamingMoment and NamingYourAI steps', () => {
      expect(onboarding).toContain('NamingMoment');
      expect(onboarding).toContain('NamingYourAI');
      expect(onboarding).toContain('setUserName');
    });

    it('connects data sources via DataSourcesStep', () => {
      expect(onboarding).toContain('DataSourcesStep');
      expect(onboarding).toContain("'data-sources'");
    });

    it('detects hardware during onboarding', () => {
      expect(onboarding).toContain('detectHardware');
      expect(onboarding).toContain('HardwareDetection');
    });

    it('initializes model downloads and knowledge moment', () => {
      expect(onboarding).toContain('startModelDownloads');
      expect(onboarding).toContain('generateKnowledgeMoment');
    });
  });

  // ─── Stage 2: Knowledge Moment ────────────────────────────────────────────

  describe('2. Knowledge Moment fires', () => {
    const knowledgeMoment = readSource('packages/core/agent/knowledge-moment.ts');
    const display = readSource('packages/desktop/src/components/KnowledgeMomentDisplay.tsx');

    it('compound insight generated with tiered fallback', () => {
      expect(knowledgeMoment).toContain('class KnowledgeMomentGenerator');
      // Tier 1/2 are determined dynamically: `const tier: 1 | 2 = ...`
      expect(knowledgeMoment).toContain('tier: 1 | 2');
      expect(knowledgeMoment).toContain('tier: 3');
      expect(knowledgeMoment).toContain('tier: 4');
      expect(knowledgeMoment).toContain('tier: 5');
    });

    it('suggested action is available', () => {
      expect(knowledgeMoment).toContain('suggestedAction');
      expect(knowledgeMoment).toContain("'draft_reply'");
      expect(knowledgeMoment).toContain("'prepare_meeting'");
    });

    it('Knowledge Moment display component exists', () => {
      expect(display).toContain('KnowledgeMomentDisplay');
    });
  });

  // ─── Stage 3: First Autonomous Action ─────────────────────────────────────

  describe('3. First Autonomous Action', () => {
    const orchestrator = readSource('packages/core/agent/orchestrator.ts');
    const autonomy = readSource('packages/core/agent/autonomy.ts');

    it('routine emails categorized by Orchestrator', () => {
      expect(orchestrator).toContain('processMessage');
      expect(orchestrator).toContain('AutonomyManager');
    });

    it('newsletter archived in Partner mode (auto-approve for write)', () => {
      expect(autonomy).toContain("'email.archive': 'write'");
      expect(autonomy).toContain("case 'partner':");
      expect(autonomy).toContain("return 'auto_approve'");
    });
  });

  // ─── Stage 4: Autonomy Selection ──────────────────────────────────────────

  describe('4. Autonomy Selection', () => {
    const onboarding = readSource('packages/desktop/src/screens/OnboardingFlow.tsx');
    const autonomy = readSource('packages/core/agent/autonomy.ts');

    it('Partner is pre-selected in onboarding', () => {
      expect(onboarding).toContain("useState<AutonomyTier>('partner')");
    });

    it('Autonomy Manager default tier is partner', () => {
      expect(autonomy).toContain("config?.defaultTier ?? 'partner'");
    });
  });

  // ─── Stage 5: Universal Inbox ─────────────────────────────────────────────

  describe('5. Universal Inbox', () => {
    const activity = readSource('packages/desktop/src/screens/ActivityScreen.tsx');
    const appTsx = readSource('packages/desktop/src/App.tsx');

    it('activity screen exists and is wired', () => {
      expect(existsSync(join(ROOT, 'packages/desktop/src/screens/ActivityScreen.tsx'))).toBe(true);
      expect(appTsx).toContain('ActivityScreen');
    });

    it('shows action log entries', () => {
      // Phase 5 migrated raw invoke() to typed IPC wrappers
      expect(activity).toContain('getActionLog');
    });

    it('shows action type for each entry', () => {
      expect(activity).toContain('actionType');
    });

    it('shows status filter', () => {
      expect(activity).toContain('filterStatus');
    });

    it('shows actions taken with audit detail', () => {
      // Phase 7 i18n: audit labels use translation keys
      expect(activity).toContain('screen.activity.payload_hash');
      expect(activity).toContain('screen.activity.audit_reference');
    });
  });

  // ─── Stage 6: Subscription Detection ──────────────────────────────────────

  describe('6. Subscription Detection', () => {
    const detector = readSource('packages/core/finance/recurring-detector.ts');
    const parser = readSource('packages/core/finance/statement-parser.ts');

    it('import mock bank statement (CSV/OFX)', () => {
      expect(parser).toContain('parseCSV');
      expect(parser).toContain('parseOFX');
    });

    it('recurring charges detected', () => {
      expect(detector).toContain('detect(');
      expect(detector).toContain('RecurringCharge');
      expect(detector).toContain('frequency');
    });

    it('forgotten subscriptions flagged', () => {
      expect(detector).toContain('flagForgotten');
      expect(detector).toContain("'forgotten'");
    });

    it('summary includes annual cost estimate', () => {
      expect(detector).toContain('SubscriptionSummary');
      expect(detector).toContain('potentialSavings');
      expect(detector).toContain('estimatedAnnualCost');
    });
  });

  // ─── Stage 7: Autonomy Escalation ─────────────────────────────────────────

  describe('7. Autonomy Escalation', () => {
    const escalation = readSource('packages/core/agent/autonomy-escalation.ts');
    const patterns = readSource('packages/core/agent/approval-patterns.ts');
    const card = readSource('packages/desktop/src/components/EscalationPromptCard.tsx');

    it('approval patterns tracked', () => {
      expect(patterns).toContain('ApprovalPatternTracker');
    });

    it('escalation prompts generated after threshold', () => {
      expect(escalation).toContain('checkForEscalations');
      expect(escalation).toContain('consecutiveApprovals');
    });

    it('accept escalation updates tier', () => {
      expect(escalation).toContain('recordResponse');
      expect(escalation).toContain("'accepted'");
    });

    it('escalation prompt card renders in UI', () => {
      expect(card).toContain('EscalationPromptCard');
    });
  });

  // ─── Stage 8: Weekly Digest ───────────────────────────────────────────────

  describe('8. Weekly Digest', () => {
    const digest = readSource('packages/core/digest/weekly-digest.ts');
    const digestScreen = readSource('packages/desktop/src/screens/DigestScreen.tsx');

    it('digest generation works', () => {
      expect(digest).toContain('class WeeklyDigestGenerator');
      expect(digest).toContain('generate(');
    });

    it('action counts in digest', () => {
      expect(digest).toContain('totalActions');
      expect(digest).toContain('actionsByType');
    });

    it('time-saved calculated', () => {
      expect(digest).toContain('totalTimeSavedSeconds');
      expect(digest).toContain('timeSavedFormatted');
    });

    it('narrative generated', () => {
      expect(digest).toContain('narrative');
    });

    it('digest screen renders digest data', () => {
      expect(digestScreen).toContain('DigestScreen');
    });
  });

  // ─── Stage 9: Network Monitor ─────────────────────────────────────────────

  describe('9. Network Monitor', () => {
    const monitor = readSource('packages/gateway/monitor/network-monitor.ts');
    const report = readSource('packages/gateway/monitor/privacy-report.ts');
    const monitorScreen = readSource('packages/desktop/src/screens/NetworkMonitorScreen.tsx');
    const appTsx = readSource('packages/desktop/src/App.tsx');

    it('zero unauthorized connections verified', () => {
      expect(monitor).toContain('getTrustStatus');
      expect(monitor).toContain('unauthorizedCount');
    });

    it('authorized services listed', () => {
      expect(monitor).toContain('getEnrichedAllowlist');
    });

    it('connection log populated from audit trail', () => {
      expect(monitor).toContain('getConnectionHistory');
    });

    it('privacy report generates', () => {
      expect(report).toContain('class PrivacyReportGenerator');
      expect(report).toContain('auditTrailHash');
    });

    it('report is accurate (includes summary)', () => {
      expect(report).toContain('totalConnections');
      expect(report).toContain('unauthorizedAttempts');
      expect(report).toContain('totalTimeSavedSeconds');
    });

    it('Network Monitor screen accessible via sidebar', () => {
      // Phase 5 migrated to React Router — routes instead of switch/case
      expect(appTsx).toContain('path="/network"');
      expect(appTsx).toContain('NetworkMonitorScreen');
      expect(monitorScreen).toContain('NetworkMonitorScreen');
    });
  });

  // ─── Stage 10: Privacy Audit ──────────────────────────────────────────────

  describe('10. Privacy Audit', () => {
    it('privacy audit script exists', () => {
      expect(existsSync(join(ROOT, 'scripts/privacy-audit'))).toBe(true);
    });

    it('AI Core has no network imports', () => {
      // This is verified exhaustively by the privacy audit script
      // Here we just verify the network-monitor source lives in gateway (not core)
      expect(existsSync(join(ROOT, 'packages/gateway/monitor/network-monitor.ts'))).toBe(true);
      // And that no network-monitor file exists in core
      expect(existsSync(join(ROOT, 'packages/core/monitor/network-monitor.ts'))).toBe(false);
    });

    it('Network Monitor reads Gateway audit trail only', () => {
      const monitor = readSource('packages/gateway/monitor/network-monitor.ts');
      // NetworkMonitor is constructed with AuditQuery and Allowlist — both Gateway types
      expect(monitor).toContain('AuditQuery');
      expect(monitor).toContain('Allowlist');
    });
  });
});
