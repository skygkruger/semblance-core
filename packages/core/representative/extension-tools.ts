// Extension Tools — 4 LLM tools registered via the extension interface.
// These are registered via registerTools() — NOT hardcoded in the orchestrator.
// All tools are local (isLocal: true) — no Gateway IPC from the tool handlers.
// CRITICAL: This file is in packages/core/. No network imports.

import type { ExtensionTool } from '../extensions/types.js';
import type { CancellationEngine } from './cancellation-engine.js';
import type { TemplateEngine } from './template-engine.js';
import type { RepresentativeActionManager } from './action-manager.js';
import type { FollowUpTracker } from './follow-up-tracker.js';

export interface RepresentativeToolDeps {
  cancellationEngine: CancellationEngine;
  templateEngine: TemplateEngine;
  actionManager: RepresentativeActionManager;
  followUpTracker: FollowUpTracker;
}

export function createRepresentativeTools(deps: RepresentativeToolDeps): ExtensionTool[] {
  return [
    // Tool 1: cancel_subscription
    {
      definition: {
        name: 'cancel_subscription',
        description: 'List cancellable subscriptions or initiate a cancellation. If chargeId is provided, initiates cancellation for that subscription. Otherwise, lists all cancellable subscriptions.',
        parameters: {
          type: 'object',
          properties: {
            chargeId: {
              type: 'string',
              description: 'ID of the recurring charge to cancel. Omit to list all cancellable subscriptions.',
            },
          },
        },
      },
      isLocal: true,
      handler: async (args) => {
        const chargeId = args['chargeId'] as string | undefined;

        if (chargeId) {
          const draft = await deps.cancellationEngine.initiateCancellation(chargeId);
          if (!draft) {
            return { error: `Could not initiate cancellation for charge ${chargeId}. Charge not found or no support contact available.` };
          }
          return { result: { status: 'draft-ready', draft } };
        }

        const subscriptions = await deps.cancellationEngine.listCancellable();
        return { result: { subscriptions } };
      },
    },

    // Tool 2: draft_service_email
    {
      definition: {
        name: 'draft_service_email',
        description: 'Draft a customer service email using a template. Available templates: refund, billing, cancellation, inquiry, escalation, warranty.',
        parameters: {
          type: 'object',
          properties: {
            template: {
              type: 'string',
              description: 'Template name: refund, billing, cancellation, inquiry, escalation, or warranty.',
            },
            to: {
              type: 'string',
              description: 'Recipient email address.',
            },
            fields: {
              type: 'object',
              description: 'Template fields as key-value pairs.',
            },
          },
          required: ['template', 'to', 'fields'],
        },
      },
      isLocal: true,
      handler: async (args) => {
        const templateName = args['template'] as string;
        const to = args['to'] as string;
        const fields = args['fields'] as Record<string, string>;

        const validation = deps.templateEngine.validateFields(templateName, fields);
        if (!validation.valid) {
          return { error: `Missing required fields: ${validation.missing.join(', ')}` };
        }

        const draft = await deps.templateEngine.fillTemplate(templateName, fields, to);
        if (!draft) {
          return { error: `Template '${templateName}' not found or validation failed.` };
        }

        // Submit through action manager for autonomy-aware approval
        const action = await deps.actionManager.submitAction(draft, `User requested ${templateName} email`);
        return { result: { action: { id: action.id, status: action.status, classification: action.classification } } };
      },
    },

    // Tool 3: check_representative_status
    {
      definition: {
        name: 'check_representative_status',
        description: 'Check the Digital Representative\'s recent actions and active follow-ups.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of recent actions to return. Default: 10.',
            },
          },
        },
      },
      isLocal: true,
      handler: async (args) => {
        const limit = (args['limit'] as number | undefined) ?? 10;
        const actions = deps.actionManager.getActionHistory(limit);
        const followUps = deps.followUpTracker.getPendingFollowUps();
        const stats = deps.followUpTracker.getStats();

        return {
          result: {
            recentActions: actions.map(a => ({
              id: a.id,
              subject: a.draft.subject,
              status: a.status,
              classification: a.classification,
              createdAt: a.createdAt,
            })),
            activeFollowUps: followUps.map(f => ({
              id: f.id,
              merchantName: f.merchantName,
              stage: f.stage,
              nextFollowUpAt: f.nextFollowUpAt,
            })),
            followUpStats: stats,
          },
        };
      },
    },

    // Tool 4: list_pending_actions
    {
      definition: {
        name: 'list_pending_actions',
        description: 'List all pending Digital Representative actions awaiting user approval.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      isLocal: true,
      handler: async () => {
        const pending = deps.actionManager.getPendingActions();
        return {
          result: {
            pendingActions: pending.map(a => ({
              id: a.id,
              to: a.draft.to,
              subject: a.draft.subject,
              classification: a.classification,
              reasoning: a.reasoning,
              createdAt: a.createdAt,
            })),
            count: pending.length,
          },
        };
      },
    },
  ];
}
