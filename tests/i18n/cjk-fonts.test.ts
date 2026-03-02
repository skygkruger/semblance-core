// CJK font support tests
//
// Verifies that the design system CSS tokens include CJK font-family
// declarations and language-specific selectors for Japanese, Chinese,
// and Korean.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const TOKENS_CSS = join(ROOT, 'packages', 'semblance-ui', 'tokens', 'tokens.css');

describe('CJK font support', () => {
  const css = readFileSync(TOKENS_CSS, 'utf8');

  it('tokens.css contains CJK font-family declarations', () => {
    // Must include at least one CJK font stack (Noto Sans JP/SC/KR or similar)
    const hasCjkFont =
      css.includes('Noto Sans JP') ||
      css.includes('Noto Sans SC') ||
      css.includes('Noto Sans KR') ||
      css.includes('Noto Serif JP') ||
      css.includes('Noto Serif SC') ||
      css.includes('Noto Serif KR') ||
      css.includes('Hiragino') ||
      css.includes('PingFang') ||
      css.includes('Apple SD Gothic');

    expect(hasCjkFont, 'tokens.css should declare CJK font families').toBe(true);
  });

  it('tokens.css contains lang selectors for CJK locales', () => {
    // Must include language attribute selectors for ja, zh, and ko
    expect(css, 'should contain [lang^="ja"] selector').toMatch(/\[lang\^=["']ja["']\]/);
    expect(css, 'should contain [lang^="zh"] selector').toMatch(/\[lang\^=["']zh["']\]/);
    expect(css, 'should contain [lang^="ko"] selector').toMatch(/\[lang\^=["']ko["']\]/);
  });
});
