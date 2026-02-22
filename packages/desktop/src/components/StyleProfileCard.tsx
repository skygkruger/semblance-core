import { useState } from 'react';

interface StylePattern {
  text: string;
  frequency: number;
}

interface StyleProfileData {
  id: string;
  isActive: boolean;
  emailsAnalyzed: number;
  greetingPatterns: StylePattern[];
  signoffPatterns: StylePattern[];
  formalityScore: number;
  directnessScore: number;
  warmthScore: number;
  usesContractions: boolean;
  contractionRate: number;
  usesEmoji: boolean;
  emojiFrequency: number;
  usesExclamation: boolean;
  exclamationRate: number;
}

interface StyleProfileCardProps {
  profile: StyleProfileData | null;
  /** Callback when "Re-analyze" is clicked */
  onReanalyze?: () => void;
  /** Callback when "Reset profile" is confirmed */
  onReset?: () => void;
}

/**
 * StyleProfileCard — Settings card showing the user's writing style summary.
 * Displays greeting/signoff patterns, formality level, vocabulary habits.
 * Shows learning progress when profile is inactive.
 */
export function StyleProfileCard({ profile, onReanalyze, onReset }: StyleProfileCardProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!profile) {
    return (
      <div
        data-testid="style-profile-card"
        data-state="empty"
        className="rounded-lg border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark p-4"
      >
        <h3 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
          Writing Style
        </h3>
        <p className="mt-2 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          No style profile yet. Connect your email to start learning your writing style.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="style-profile-card"
      data-state={profile.isActive ? 'active' : 'learning'}
      className="rounded-lg border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
          Writing Style
        </h3>
        <span
          data-testid="style-profile-status"
          className={`text-xs px-2 py-0.5 rounded-full ${
            profile.isActive
              ? 'bg-semblance-success-subtle text-semblance-success dark:bg-semblance-success/20'
              : 'bg-semblance-accent-subtle text-semblance-accent dark:bg-semblance-accent/20'
          }`}
        >
          {profile.isActive
            ? 'Style profile active'
            : `Learning your style (${profile.emailsAnalyzed}/20 emails analyzed)`}
        </span>
      </div>

      {/* Greeting Patterns */}
      {profile.greetingPatterns.length > 0 && (
        <div data-testid="style-greeting-patterns">
          <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            Greetings
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.greetingPatterns.slice(0, 3).map((p) => (
              <span
                key={p.text}
                className="text-xs px-2 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-primary dark:text-semblance-text-primary-dark"
              >
                {p.text} ({Math.round(p.frequency * 100)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sign-off Patterns */}
      {profile.signoffPatterns.length > 0 && (
        <div data-testid="style-signoff-patterns">
          <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            Sign-offs
          </span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.signoffPatterns.slice(0, 3).map((p) => (
              <span
                key={p.text}
                className="text-xs px-2 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-primary dark:text-semblance-text-primary-dark"
              >
                {p.text} ({Math.round(p.frequency * 100)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tone Summary */}
      <div data-testid="style-tone-summary" className="space-y-1">
        <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          Tone
        </span>
        <div className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark space-y-0.5">
          <p>{getFormalityLabel(profile.formalityScore)}</p>
          <p>{getDirectnessLabel(profile.directnessScore)}</p>
          <p>{getWarmthLabel(profile.warmthScore)}</p>
        </div>
      </div>

      {/* Vocabulary Habits */}
      <div data-testid="style-vocabulary-summary" className="space-y-1">
        <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          Vocabulary
        </span>
        <div className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark space-y-0.5">
          <p>{getContractionLabel(profile.usesContractions, profile.contractionRate)}</p>
          <p>{getEmojiLabel(profile.usesEmoji, profile.emojiFrequency)}</p>
          <p>{getExclamationLabel(profile.usesExclamation, profile.exclamationRate)}</p>
        </div>
      </div>

      {/* Emails Analyzed */}
      <div className="text-xs text-semblance-text-tertiary">
        Based on {profile.emailsAnalyzed} emails analyzed
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onReanalyze && (
          <button
            type="button"
            data-testid="style-reanalyze-button"
            onClick={onReanalyze}
            className="text-xs px-3 py-1 rounded border border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors"
          >
            Re-analyze
          </button>
        )}
        {onReset && (
          <>
            {!showResetConfirm ? (
              <button
                type="button"
                data-testid="style-reset-button"
                onClick={() => setShowResetConfirm(true)}
                className="text-xs px-3 py-1 rounded text-semblance-attention hover:underline transition-colors"
              >
                Reset profile
              </button>
            ) : (
              <div data-testid="style-reset-confirm" className="flex items-center gap-2">
                <span className="text-xs text-semblance-attention">Reset style profile?</span>
                <button
                  type="button"
                  onClick={() => { onReset(); setShowResetConfirm(false); }}
                  className="text-xs px-2 py-0.5 rounded bg-semblance-attention text-white hover:opacity-90 transition-colors"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="text-xs px-2 py-0.5 rounded border border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Human-Readable Labels ───────────────────────────────────────────────────

function getFormalityLabel(score: number): string {
  if (score >= 80) return 'Very formal';
  if (score >= 60) return 'Moderately formal';
  if (score >= 40) return 'Conversational';
  if (score >= 20) return 'Casual';
  return 'Very casual';
}

function getDirectnessLabel(score: number): string {
  if (score >= 80) return 'Very direct';
  if (score >= 60) return 'Direct';
  if (score >= 40) return 'Balanced';
  if (score >= 20) return 'Tentative';
  return 'Very tentative';
}

function getWarmthLabel(score: number): string {
  if (score >= 80) return 'Very warm';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Neutral';
  if (score >= 20) return 'Cool';
  return 'Very transactional';
}

function getContractionLabel(uses: boolean, rate: number): string {
  if (!uses) return 'Rarely uses contractions';
  if (rate >= 0.7) return 'Uses contractions frequently';
  if (rate >= 0.4) return 'Uses contractions moderately';
  return 'Occasionally uses contractions';
}

function getEmojiLabel(uses: boolean, frequency: number): string {
  if (!uses) return 'Rarely uses emoji';
  if (frequency >= 1) return 'Uses emoji frequently';
  if (frequency >= 0.3) return 'Uses emoji occasionally';
  return 'Rarely uses emoji';
}

function getExclamationLabel(uses: boolean, rate: number): string {
  if (!uses) return 'Rarely uses exclamation marks';
  if (rate >= 0.3) return 'Frequently uses exclamation marks';
  if (rate >= 0.1) return 'Occasionally uses exclamation marks';
  return 'Rarely uses exclamation marks';
}
