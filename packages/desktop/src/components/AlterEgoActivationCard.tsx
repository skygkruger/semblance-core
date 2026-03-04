// AlterEgoActivationCard — Full-width Day 7 card with activate/decline/customize.

import { useState } from 'react';
import { Card, Button } from '@semblance/ui';
import './AlterEgoActivationCard.css';

export interface AlterEgoDifference {
  domain: string;
  currentTier: string;
  description: string;
  examples: string[];
}

export interface ActivationPromptData {
  totalActions: number;
  successRate: number;
  domainsCovered: string[];
  estimatedTimeSavedSeconds: number;
  differences: AlterEgoDifference[];
  safeguards: string[];
}

interface AlterEgoActivationCardProps {
  prompt: ActivationPromptData;
  onActivate: (domains?: string[]) => void;
  onDecline: () => void;
}

export function AlterEgoActivationCard({
  prompt,
  onActivate,
  onDecline,
}: AlterEgoActivationCardProps) {
  const [view, setView] = useState<'overview' | 'customize' | 'safeguards'>('overview');
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    new Set(prompt.differences.map(d => d.domain))
  );

  const timeSavedMinutes = Math.round(prompt.estimatedTimeSavedSeconds / 60);

  const toggleDomain = (domain: string) => {
    setSelectedDomains(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <Card className="alter-ego-activate">
      <div className="alter-ego-activate__header">
        <h2 className="alter-ego-activate__title">THE OFFER</h2>
        <p className="alter-ego-activate__subtitle">Day 7 of Alter Ego Week — Your week in review</p>
      </div>

      <div className="alter-ego-activate__stats">
        <div className="alter-ego-activate__stat">
          <div className="alter-ego-activate__stat-value">{prompt.totalActions}</div>
          <div className="alter-ego-activate__stat-label">Actions Taken</div>
        </div>
        <div className="alter-ego-activate__stat">
          <div className="alter-ego-activate__stat-value">{prompt.successRate}%</div>
          <div className="alter-ego-activate__stat-label">Success Rate</div>
        </div>
        <div className="alter-ego-activate__stat">
          <div className="alter-ego-activate__stat-value">{timeSavedMinutes}m</div>
          <div className="alter-ego-activate__stat-label">Time Saved</div>
        </div>
      </div>

      <div className="alter-ego-activate__tabs">
        {(['overview', 'customize', 'safeguards'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`alter-ego-activate__tab${view === tab ? ' alter-ego-activate__tab--active' : ''}`}
          >
            [{tab.toUpperCase()}]
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <div>
          {prompt.differences.map(diff => (
            <div key={diff.domain} className="alter-ego-activate__domain">
              <h4 className="alter-ego-activate__domain-name">
                {diff.domain} <span className="alter-ego-activate__domain-tier">[{diff.currentTier}]</span>
              </h4>
              <p className="alter-ego-activate__domain-desc">{diff.description}</p>
            </div>
          ))}
        </div>
      )}

      {view === 'customize' && (
        <div>
          <p className="alter-ego-activate__customize-hint">
            Select which domains to upgrade to Alter Ego:
          </p>
          {prompt.differences.map(diff => (
            <label key={diff.domain} className="alter-ego-activate__checkbox-row">
              <input
                type="checkbox"
                checked={selectedDomains.has(diff.domain)}
                onChange={() => toggleDomain(diff.domain)}
              />
              <span className="alter-ego-activate__checkbox-label">{diff.domain}</span>
              <span className="alter-ego-activate__checkbox-tier">{diff.currentTier}</span>
            </label>
          ))}
        </div>
      )}

      {view === 'safeguards' && (
        <div>
          {prompt.safeguards.map((safeguard, i) => (
            <p key={i} className="alter-ego-activate__safeguard"><span className="alter-ego-activate__safeguard-icon">[/]</span> {safeguard}</p>
          ))}
        </div>
      )}

      <div className="alter-ego-activate__actions">
        <Button
          variant="approve"
          size="md"
          onClick={() => {
            if (view === 'customize' && selectedDomains.size > 0) {
              onActivate(Array.from(selectedDomains));
            } else {
              onActivate();
            }
          }}
        >
          Activate Alter Ego
        </Button>
        <Button variant="dismiss" size="md" onClick={onDecline}>
          Not Yet
        </Button>
      </div>
    </Card>
  );
}
