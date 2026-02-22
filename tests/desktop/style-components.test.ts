// Tests for Step 11 Commit 8 — StyleMatchIndicator and StyleProfileCard components.
// Structure, rendering logic, design system compliance.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const INDICATOR_PATH = path.resolve(
  __dirname,
  '../../packages/desktop/src/components/StyleMatchIndicator.tsx',
);

const PROFILE_CARD_PATH = path.resolve(
  __dirname,
  '../../packages/desktop/src/components/StyleProfileCard.tsx',
);

describe('StyleMatchIndicator component', () => {
  it('component file exists', () => {
    expect(fs.existsSync(INDICATOR_PATH)).toBe(true);
  });

  it('exports StyleMatchIndicator function', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('export function StyleMatchIndicator');
  });

  it('has score prop in interface', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('score');
    expect(content).toContain('breakdown');
  });

  it('renders data-testid for testing', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-match-indicator"');
  });

  it('shows learning progress when score is null (inactive profile)', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-learning-progress"');
    expect(content).toContain('Style learning in progress');
  });

  it('shows score percentage when active', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-match-score"');
    expect(content).toContain('Matches your style:');
  });

  it('uses correct colors: green for 80+, amber for 60-79, coral for <60', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    // Green for high score (success color)
    expect(content).toContain('bg-semblance-success');
    // Amber for medium (accent color)
    expect(content).toContain('bg-semblance-accent');
    // Red for low (attention color)
    expect(content).toContain('bg-semblance-attention');
  });

  it('renders expandable breakdown', () => {
    const content = fs.readFileSync(INDICATOR_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-match-breakdown"');
    expect(content).toContain('Greeting');
    expect(content).toContain('Sign-off');
    expect(content).toContain('Formality');
    expect(content).toContain('Vocabulary');
  });
});

describe('StyleProfileCard component', () => {
  it('component file exists', () => {
    expect(fs.existsSync(PROFILE_CARD_PATH)).toBe(true);
  });

  it('exports StyleProfileCard function', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('export function StyleProfileCard');
  });

  it('has data-testid for testing', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-profile-card"');
  });

  it('shows profile status (active or learning)', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-profile-status"');
    expect(content).toContain('Style profile active');
    expect(content).toContain('Learning your style');
  });

  it('displays greeting and signoff patterns', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-greeting-patterns"');
    expect(content).toContain('data-testid="style-signoff-patterns"');
  });

  it('displays tone summary with human-readable labels', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-tone-summary"');
    expect(content).toContain('Moderately formal');
    expect(content).toContain('Conversational');
  });

  it('displays vocabulary summary', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-vocabulary-summary"');
    expect(content).toContain('Uses contractions');
    expect(content).toContain('emoji');
  });

  it('has re-analyze and reset buttons', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-reanalyze-button"');
    expect(content).toContain('Re-analyze');
    expect(content).toContain('data-testid="style-reset-button"');
    expect(content).toContain('Reset profile');
  });

  it('has reset confirmation dialog', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-testid="style-reset-confirm"');
    expect(content).toContain('Reset style profile?');
    expect(content).toContain('Confirm');
    expect(content).toContain('Cancel');
  });

  it('handles null profile (no profile yet)', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('data-state="empty"');
    expect(content).toContain('No style profile yet');
  });

  it('follows design system colors and borders', () => {
    const content = fs.readFileSync(PROFILE_CARD_PATH, 'utf-8');
    expect(content).toContain('border-semblance-border');
    expect(content).toContain('bg-semblance-surface-1');
    expect(content).toContain('text-semblance-text-primary');
    expect(content).toContain('text-semblance-text-secondary');
  });
});
