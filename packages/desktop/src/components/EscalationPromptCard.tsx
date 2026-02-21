import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@semblance/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PreviewAction {
  description: string;
  currentBehavior: string;
  newBehavior: string;
  estimatedTimeSaved: string;
}

interface EscalationPrompt {
  id: string;
  type: 'guardian_to_partner' | 'partner_to_alterego';
  domain: string;
  actionType: string;
  consecutiveApprovals: number;
  message: string;
  previewActions: PreviewAction[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
}

interface EscalationPromptCardProps {
  prompt: EscalationPrompt;
  onAccepted: () => void;
  onDismissed: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EscalationPromptCard({ prompt, onAccepted, onDismissed }: EscalationPromptCardProps) {
  const [responding, setResponding] = useState(false);

  const handleAccept = async () => {
    setResponding(true);
    try {
      await invoke('respond_to_escalation', { promptId: prompt.id, accepted: true });
      onAccepted();
    } catch {
      // Sidecar not wired
    } finally {
      setResponding(false);
    }
  };

  const handleDismiss = async () => {
    setResponding(true);
    try {
      await invoke('respond_to_escalation', { promptId: prompt.id, accepted: false });
      onDismissed();
    } catch {
      // Sidecar not wired
    } finally {
      setResponding(false);
    }
  };

  const tierLabel = prompt.type === 'guardian_to_partner'
    ? 'Partner'
    : 'Alter Ego';

  return (
    <Card className="p-4 border-l-[3px] border-l-semblance-accent bg-semblance-accent-subtle dark:bg-semblance-accent-subtle-dark">
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
          Trust Upgrade Available
        </h3>
        <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
          {prompt.message}
        </p>
      </div>

      {/* What changes preview */}
      {prompt.previewActions.length > 0 && (
        <div className="mb-3 space-y-2">
          <p className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            What changes:
          </p>
          {prompt.previewActions.map((action, i) => (
            <div
              key={i}
              className="p-2.5 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark border border-semblance-border/50 dark:border-semblance-border-dark/50"
            >
              <p className="text-xs font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {action.description}
              </p>
              <p className="text-[11px] text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5">
                Currently: {action.currentBehavior}
              </p>
              <p className="text-[11px] text-semblance-text-primary dark:text-semblance-text-primary-dark">
                New: {action.newBehavior}
              </p>
              <p className="text-[11px] text-semblance-success mt-0.5">
                Time saved: {action.estimatedTimeSaved}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark mb-3">
        You can always change this in Settings.
      </p>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAccept}
          disabled={responding}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-semblance-primary text-white hover:opacity-90 transition-opacity duration-fast disabled:opacity-50"
        >
          Yes, upgrade to {tierLabel}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={responding}
          className="px-3 py-1.5 text-sm rounded-md text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast disabled:opacity-50"
        >
          Not yet
        </button>
      </div>
    </Card>
  );
}
