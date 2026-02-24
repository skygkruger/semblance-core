// AlterEgoActivationCard — Full-width Day 7 card with activate/decline/customize.

import { useState } from 'react';

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
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  return (
    <div className="w-full rounded-none border border-[#d4a76a] bg-[#1a1a2e] p-6 font-mono">
      {/* Header */}
      <div className="mb-4 border-b border-[#6e6a86] pb-3">
        <h2 className="text-lg font-bold text-[#d4a76a]">
          THE OFFER
        </h2>
        <p className="mt-1 text-xs text-[#6e6a86]">
          Day 7 of Alter Ego Week — Your week in review
        </p>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="border border-[#6e6a86] p-3 text-center">
          <div className="text-xl font-bold text-[#7ec9a0]">{prompt.totalActions}</div>
          <div className="text-xs text-[#6e6a86]">Actions Taken</div>
        </div>
        <div className="border border-[#6e6a86] p-3 text-center">
          <div className="text-xl font-bold text-[#7ec9a0]">{prompt.successRate}%</div>
          <div className="text-xs text-[#6e6a86]">Success Rate</div>
        </div>
        <div className="border border-[#6e6a86] p-3 text-center">
          <div className="text-xl font-bold text-[#7ec9a0]">{timeSavedMinutes}m</div>
          <div className="text-xs text-[#6e6a86]">Time Saved</div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mb-4 flex gap-4 border-b border-[#6e6a86] pb-2">
        {(['overview', 'customize', 'safeguards'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={`text-xs ${
              view === tab ? 'text-[#d4a76a] underline' : 'text-[#6e6a86]'
            }`}
          >
            [{tab.toUpperCase()}]
          </button>
        ))}
      </div>

      {/* Content */}
      {view === 'overview' && (
        <div className="mb-4 space-y-3">
          {prompt.differences.map(diff => (
            <div key={diff.domain} className="border border-[#6e6a86] p-3">
              <h4 className="mb-1 text-sm font-bold text-[#e8e3e3]">
                {diff.domain} <span className="text-[#6e6a86]">({diff.currentTier})</span>
              </h4>
              <p className="text-xs text-[#7eb8da]">{diff.description}</p>
            </div>
          ))}
        </div>
      )}

      {view === 'customize' && (
        <div className="mb-4 space-y-2">
          <p className="mb-2 text-xs text-[#6e6a86]">
            Select which domains to upgrade to Alter Ego:
          </p>
          {prompt.differences.map(diff => (
            <label
              key={diff.domain}
              className="flex cursor-pointer items-center gap-2 border border-[#6e6a86] p-2"
            >
              <input
                type="checkbox"
                checked={selectedDomains.has(diff.domain)}
                onChange={() => toggleDomain(diff.domain)}
                className="accent-[#7ec9a0]"
              />
              <span className="text-xs text-[#e8e3e3]">{diff.domain}</span>
              <span className="ml-auto text-xs text-[#6e6a86]">{diff.currentTier}</span>
            </label>
          ))}
        </div>
      )}

      {view === 'safeguards' && (
        <div className="mb-4 space-y-1">
          {prompt.safeguards.map((safeguard, i) => (
            <p key={i} className="text-xs text-[#7ec9a0]">
              [/] {safeguard}
            </p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (view === 'customize' && selectedDomains.size > 0) {
              onActivate(Array.from(selectedDomains));
            } else {
              onActivate();
            }
          }}
          className="border border-[#7ec9a0] bg-transparent px-4 py-2 text-sm text-[#7ec9a0] hover:bg-[#7ec9a0] hover:text-[#1a1a2e]"
        >
          [&gt;] ACTIVATE ALTER EGO
        </button>
        <button
          onClick={onDecline}
          className="text-xs text-[#6e6a86] underline hover:text-[#e8e3e3]"
        >
          Not Yet
        </button>
      </div>
    </div>
  );
}
