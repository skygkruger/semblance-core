import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { LanguageSelect } from './LanguageSelect';
import { DotMatrix } from '../DotMatrix/DotMatrix';

// ─── Wrapper — dark background + centering + DotMatrix ───────────────────────

const CenterWrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
    <DotMatrix />
    <div style={{
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 32,
    }}>
      {children}
    </div>
  </div>
);

// ─── Meta ────────────────────────────────────────────────────────────────────

const meta: Meta<typeof LanguageSelect> = {
  title: 'Components/LanguageSelect',
  component: LanguageSelect,
  parameters: { layout: 'fullscreen' },
  args: {
    onConfirm: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof LanguageSelect>;

// ─── Stories ─────────────────────────────────────────────────────────────────

/** English detected — default selection, Continue button. */
export const DetectedEnglish: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="en" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};

/** Japanese detected — pre-selects 日本語, button shows 続ける. */
export const DetectedJapanese: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="ja" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};

/** Simplified Chinese detected — pre-selects 简体中文, button shows 继续. */
export const DetectedSimplifiedChinese: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="zh-CN" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};

/** Korean detected — pre-selects 한국어, button shows 계속. */
export const DetectedKorean: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="ko" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};

/** Unknown locale — falls back to English. */
export const UnknownLocale: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="xx-YY" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};

/** All languages visible — scrollable list with all 10 options. */
export const AllLanguagesVisible: Story = {
  render: (args) => (
    <CenterWrap>
      <LanguageSelect detectedCode="en" onConfirm={args.onConfirm} />
    </CenterWrap>
  ),
};
