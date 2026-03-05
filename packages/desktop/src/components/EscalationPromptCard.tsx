import { useState } from 'react';
import { Card, Button } from '@semblance/ui';
import { respondToEscalation } from '../ipc/commands';
import './EscalationPromptCard.css';

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
      await respondToEscalation(prompt.id, true);
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
      await respondToEscalation(prompt.id, false);
      onDismissed();
    } catch {
      // Sidecar not wired
    } finally {
      setResponding(false);
    }
  };

  const tierLabel = prompt.type === 'guardian_to_partner' ? 'Partner' : 'Alter Ego';

  return (
    <Card className="escalation-card">
      <div className="escalation-card__header">
        <h3 className="escalation-card__title">Trust Upgrade Available</h3>
        <p className="escalation-card__message">{prompt.message}</p>
      </div>

      {prompt.previewActions.length > 0 && (
        <div className="escalation-card__previews">
          <p className="escalation-card__previews-label">What changes:</p>
          {prompt.previewActions.map((action, i) => (
            <div key={i} className="escalation-card__preview-item">
              <p className="escalation-card__preview-desc">{action.description}</p>
              <p className="escalation-card__preview-current">Currently: {action.currentBehavior}</p>
              <p className="escalation-card__preview-new">New: {action.newBehavior}</p>
              <p className="escalation-card__preview-time">Time saved: {action.estimatedTimeSaved}</p>
            </div>
          ))}
        </div>
      )}

      <p className="escalation-card__note">You can always change this in Settings.</p>

      <div className="escalation-card__actions">
        <Button variant="opal" size="sm" onClick={handleAccept} disabled={responding}>
          <span className="btn__text">Yes, upgrade to {tierLabel}</span>
        </Button>
        <Button variant="dismiss" size="sm" onClick={handleDismiss} disabled={responding}>
          Not yet
        </Button>
      </div>
    </Card>
  );
}
