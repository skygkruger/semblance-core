// Form Extension Tools — 3 tools registered via the extension interface.
// All tools are isLocal: true (no IPC needed — forms are local file operations).
// CRITICAL: This file is in packages/core/. No network imports.

import type { ExtensionTool } from '../extensions/types.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { FormManager } from './form-manager.js';
import type { BureaucracyTracker } from './bureaucracy-tracker.js';
import type { FormTemplateEngine } from './form-templates.js';

export interface FormToolsDeps {
  formManager: FormManager;
  tracker: BureaucracyTracker;
  templates: FormTemplateEngine;
  premiumGate: PremiumGate;
}

export function createFormTools(deps: FormToolsDeps): ExtensionTool[] {
  return [
    // ─── fill_form ───────────────────────────────────────────────────────
    {
      definition: {
        name: 'fill_form',
        description: 'Analyze a PDF form, detect fillable fields, and auto-fill from user data. Returns a preview of filled fields with confidence scores.',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the PDF file' },
            templateId: { type: 'string', description: 'Optional template ID to apply' },
          },
          required: ['filePath'],
        },
      },
      handler: async (args) => {
        if (!deps.premiumGate.isFeatureAvailable('form-automation' as PremiumFeature)) {
          return { error: 'Form automation requires Digital Representative tier.' };
        }

        const filePath = args['filePath'] as string;
        const templateId = args['templateId'] as string | undefined;
        const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

        // Read file via platform adapter — in real usage the orchestrator
        // provides the buffer. For tool-level, we accept the path and the
        // caller is responsible for reading.
        // The tool returns field analysis; actual PDF buffer ops happen
        // at the manager level.
        try {
          if (templateId) {
            const result = await deps.formManager.applyTemplate(
              Buffer.alloc(0), filePath, fileName, templateId,
            );
            return { result };
          }

          const result = await deps.formManager.analyzeAndFill(
            Buffer.alloc(0), filePath, fileName,
          );
          return { result };
        } catch (err) {
          return { error: `Form analysis failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
      isLocal: true,
    },

    // ─── check_form_status ───────────────────────────────────────────────
    {
      definition: {
        name: 'check_form_status',
        description: 'Check the status of submitted forms and bureaucracy tracking. Returns pending submissions, due reminders, and statistics.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => {
        if (!deps.premiumGate.isFeatureAvailable('bureaucracy-tracking' as PremiumFeature)) {
          return { error: 'Bureaucracy tracking requires Digital Representative tier.' };
        }

        const pending = deps.tracker.getPendingSubmissions();
        const dueReminders = deps.tracker.getDueReminders();
        const stats = deps.tracker.getStats();

        return {
          result: {
            pending,
            dueReminders,
            stats,
          },
        };
      },
      isLocal: true,
    },

    // ─── list_form_templates ─────────────────────────────────────────────
    {
      definition: {
        name: 'list_form_templates',
        description: 'List all available form templates with descriptions and expected processing times.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => {
        if (!deps.premiumGate.isFeatureAvailable('form-automation' as PremiumFeature)) {
          return { error: 'Form templates require Digital Representative tier.' };
        }

        const templates = deps.templates.getTemplates();
        return {
          result: {
            templates: templates.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
              expectedProcessingDays: t.expectedProcessingDays,
            })),
          },
        };
      },
      isLocal: true,
    },
  ];
}
