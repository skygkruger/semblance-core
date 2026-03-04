import { useState } from 'react';
import { Card } from '@semblance/ui';
import './StyleProfileCard.css';

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
  onReanalyze?: () => void;
  onReset?: () => void;
}

export function StyleProfileCard({ profile, onReanalyze, onReset }: StyleProfileCardProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!profile) {
    return (
      <Card data-testid="style-profile-card" data-state="empty">
        <div className="style-profile">
          <h3 className="style-profile__title">Writing Style</h3>
          <p className="style-profile__empty-text">
            No style profile yet. Connect your email to start learning your writing style.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card data-testid="style-profile-card" data-state={profile.isActive ? 'active' : 'learning'}>
      <div className="style-profile">
        <div className="style-profile__header">
          <h3 className="style-profile__title">Writing Style</h3>
          <span
            data-testid="style-profile-status"
            className={`style-profile__status ${profile.isActive ? 'style-profile__status--active' : 'style-profile__status--learning'}`}
          >
            {profile.isActive
              ? 'Style profile active'
              : `Learning your style (${profile.emailsAnalyzed}/20 emails analyzed)`}
          </span>
        </div>

        {profile.greetingPatterns.length > 0 && (
          <div data-testid="style-greeting-patterns">
            <span className="style-profile__section-label">Greetings</span>
            <div className="style-profile__tags">
              {profile.greetingPatterns.slice(0, 3).map((p) => (
                <span key={p.text} className="style-profile__tag">
                  {p.text} ({Math.round(p.frequency * 100)}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.signoffPatterns.length > 0 && (
          <div data-testid="style-signoff-patterns">
            <span className="style-profile__section-label">Sign-offs</span>
            <div className="style-profile__tags">
              {profile.signoffPatterns.slice(0, 3).map((p) => (
                <span key={p.text} className="style-profile__tag">
                  {p.text} ({Math.round(p.frequency * 100)}%)
                </span>
              ))}
            </div>
          </div>
        )}

        <div data-testid="style-tone-summary">
          <span className="style-profile__section-label">Tone</span>
          <div className="style-profile__traits">
            <p className="style-profile__trait">{getFormalityLabel(profile.formalityScore)}</p>
            <p className="style-profile__trait">{getDirectnessLabel(profile.directnessScore)}</p>
            <p className="style-profile__trait">{getWarmthLabel(profile.warmthScore)}</p>
          </div>
        </div>

        <div data-testid="style-vocabulary-summary">
          <span className="style-profile__section-label">Vocabulary</span>
          <div className="style-profile__traits">
            <p className="style-profile__trait">{getContractionLabel(profile.usesContractions, profile.contractionRate)}</p>
            <p className="style-profile__trait">{getEmojiLabel(profile.usesEmoji, profile.emojiFrequency)}</p>
            <p className="style-profile__trait">{getExclamationLabel(profile.usesExclamation, profile.exclamationRate)}</p>
          </div>
        </div>

        <div className="style-profile__meta">
          Based on {profile.emailsAnalyzed} emails analyzed
        </div>

        <div className="style-profile__actions">
          {onReanalyze && (
            <button
              type="button"
              data-testid="style-reanalyze-button"
              onClick={onReanalyze}
              className="style-profile__action-btn"
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
                  className="style-profile__reset-btn"
                >
                  Reset profile
                </button>
              ) : (
                <div data-testid="style-reset-confirm" className="style-profile__reset-confirm">
                  <span className="style-profile__reset-text">Reset style profile?</span>
                  <button
                    type="button"
                    onClick={() => { onReset(); setShowResetConfirm(false); }}
                    className="style-profile__confirm-btn"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="style-profile__cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
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
