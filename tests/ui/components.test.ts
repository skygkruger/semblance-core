/**
 * semblance-ui Component Tests
 *
 * Structural verification of all UI components. Validates:
 * - Design token usage (no hardcoded colors/spacing in component code)
 * - Proper TypeScript patterns (no `any` types)
 * - Dark mode support (dark: class prefix)
 * - Focus-visible styling for interactive components
 * - Keyboard accessibility (role, aria attributes)
 * - PrivacyBadge always rendered in layouts
 * - All components exported from index.ts
 *
 * Note: These are static analysis tests. Full render tests require
 * a DOM environment (jsdom + @testing-library/react) which will be
 * added when component visual regression testing is set up.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const UI_DIR = join(ROOT, 'packages', 'semblance-ui');
const COMPONENTS_DIR = join(UI_DIR, 'components');

const COMPONENT_NAMES = [
  'Button',
  'Input',
  'Card',
  'ActionCard',
  'StatusIndicator',
  'PrivacyBadge',
  'Toast',
  'Navigation',
  'ChatBubble',
  'ChatInput',
  'ProgressBar',
  'DirectoryPicker',
  'AutonomySelector',
  'ThemeToggle',
];

function readComponent(name: string): string {
  const tsxPath = join(COMPONENTS_DIR, name, `${name}.tsx`);
  const webTsxPath = join(COMPONENTS_DIR, name, `${name}.web.tsx`);
  if (existsSync(tsxPath)) return readFileSync(tsxPath, 'utf-8');
  return readFileSync(webTsxPath, 'utf-8');
}

describe('Component Exports', () => {
  const indexContent = readFileSync(join(UI_DIR, 'index.ts'), 'utf-8');

  for (const name of COMPONENT_NAMES) {
    it(`exports ${name} from index.ts`, () => {
      expect(indexContent).toContain(name);
    });
  }

  it('exports NavItem type', () => {
    expect(indexContent).toContain('NavItem');
  });

  it('exports AutonomyTier type', () => {
    expect(indexContent).toContain('AutonomyTier');
  });

  it('exports ThemeMode type', () => {
    expect(indexContent).toContain('ThemeMode');
  });

  it('exports DirectoryEntry type', () => {
    expect(indexContent).toContain('DirectoryEntry');
  });
});

describe('Component File Structure', () => {
  for (const name of COMPONENT_NAMES) {
    it(`${name} has component file and index barrel`, () => {
      const hasTsx = existsSync(join(COMPONENTS_DIR, name, `${name}.tsx`));
      const hasWebTsx = existsSync(join(COMPONENTS_DIR, name, `${name}.web.tsx`));
      expect(hasTsx || hasWebTsx).toBe(true);
      expect(existsSync(join(COMPONENTS_DIR, name, 'index.ts'))).toBe(true);
    });
  }
});

describe('Design Token Usage — No Hardcoded Colors', () => {
  // Hex color pattern: #xxx or #xxxxxx (excluding comments and string literals that are clearly not style)
  const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

  for (const name of COMPONENT_NAMES) {
    it(`${name} does not hardcode hex colors in className strings`, () => {
      const content = readComponent(name);
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Only check lines that contain className
        if (line!.includes('className') && HEX_COLOR_PATTERN.test(line!)) {
          // Allow opacity modifiers like bg-semblance-primary/30 which don't contain #
          // But fail on actual hex values in className strings
          throw new Error(
            `${name}.tsx line ${i + 1}: Hardcoded hex color in className: "${line!.trim()}"`
          );
        }
      }
    });
  }
});

describe('TypeScript Quality — No `any` Types', () => {
  for (const name of COMPONENT_NAMES) {
    it(`${name} does not use \`any\` type`, () => {
      const content = readComponent(name);
      // Match `: any` or `<any>` or `as any` but not inside comments
      const lines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
      for (const line of lines) {
        expect(line).not.toMatch(/:\s*any\b/);
        expect(line).not.toMatch(/as\s+any\b/);
      }
    });
  }
});

describe('Dark Mode Support', () => {
  // v3 components (Button, Input, Card, PrivacyBadge) use CSS files with
  // CSS custom properties — dark mode is the default, no `dark:` prefix needed.
  // v1/v2 components still use Tailwind `dark:` classes.
  const TAILWIND_COMPONENTS_REQUIRING_DARK_MODE = [
    'Navigation', 'ChatBubble', 'ChatInput', 'AutonomySelector',
    'ThemeToggle', 'Toast', 'DirectoryPicker',
  ];

  // v3 components use co-located CSS files with CSS custom properties
  const CSS_COMPONENTS = ['Button', 'Input', 'Card', 'PrivacyBadge', 'ActionCard'];

  for (const name of TAILWIND_COMPONENTS_REQUIRING_DARK_MODE) {
    it(`${name} includes dark: mode classes`, () => {
      const content = readComponent(name);
      expect(content).toContain('dark:');
    });
  }

  for (const name of CSS_COMPONENTS) {
    it(`${name} uses CSS custom properties for theming`, () => {
      const content = readComponent(name);
      // v3 components import a CSS file that uses custom properties
      expect(content).toMatch(/import\s+['"]\.\/.*\.css['"]/);
    });
  }
});

describe('Focus-Visible Styling', () => {
  // v1/v2 components have focus-visible in Tailwind classes within the .tsx
  const TAILWIND_INTERACTIVE = [
    'ChatInput', 'Navigation',
    'AutonomySelector', 'ThemeToggle', 'DirectoryPicker',
  ];

  // v3 components have focus-visible in co-located CSS files
  const CSS_INTERACTIVE = ['Button', 'Input', 'ActionCard'];

  for (const name of TAILWIND_INTERACTIVE) {
    it(`${name} has focus-visible styling`, () => {
      const content = readComponent(name);
      expect(content).toMatch(/focus-visible:|focus:/);
    });
  }

  for (const name of CSS_INTERACTIVE) {
    it(`${name} has focus-visible styling in CSS`, () => {
      const cssContent = readFileSync(join(COMPONENTS_DIR, name, `${name}.css`), 'utf-8');
      expect(cssContent).toMatch(/focus-visible|:focus/);
    });
  }
});

describe('Accessibility Attributes', () => {
  it('PrivacyBadge has role="status"', () => {
    const content = readComponent('PrivacyBadge');
    expect(content).toContain('role="status"');
  });

  it('PrivacyBadge has aria-label', () => {
    const content = readComponent('PrivacyBadge');
    expect(content).toContain('aria-label');
  });

  it('Navigation has aria-label', () => {
    const content = readComponent('Navigation');
    expect(content).toContain('aria-label');
  });

  it('Navigation marks active item with aria-current', () => {
    const content = readComponent('Navigation');
    expect(content).toContain('aria-current');
  });

  it('ProgressBar has role="progressbar"', () => {
    const content = readComponent('ProgressBar');
    expect(content).toContain('role="progressbar"');
  });

  it('ProgressBar has aria-valuenow', () => {
    const content = readComponent('ProgressBar');
    expect(content).toContain('aria-valuenow');
  });

  it('StatusIndicator has role="status"', () => {
    const content = readComponent('StatusIndicator');
    expect(content).toContain('role="status"');
  });

  it('AutonomySelector uses radio group pattern', () => {
    const content = readComponent('AutonomySelector');
    expect(content).toContain('role="radiogroup"');
    expect(content).toContain('role="radio"');
    expect(content).toContain('aria-checked');
  });

  it('ThemeToggle uses radio group pattern', () => {
    const content = readComponent('ThemeToggle');
    expect(content).toContain('role="radiogroup"');
    expect(content).toContain('role="radio"');
  });

  it('Toast has aria-live', () => {
    const content = readComponent('Toast');
    expect(content).toContain('aria-live');
  });
});

describe('PrivacyBadge — Always Rendered', () => {
  it('PrivacyBadge is imported and used in App.tsx', () => {
    const appContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src', 'App.tsx'), 'utf-8');
    expect(appContent).toContain('PrivacyBadge');
    // Verify it's actually rendered, not just imported
    expect(appContent).toContain('<PrivacyBadge');
  });

  it('PrivacyBadge is in the sidebar footer (visible on all screens)', () => {
    const appContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src', 'App.tsx'), 'utf-8');
    // PrivacyBadge should be inside the footer prop of Navigation
    expect(appContent).toContain('footer=');
    expect(appContent).toContain('PrivacyBadge');
  });
});

describe('Component Patterns', () => {
  it('Button uses forwardRef', () => {
    const content = readComponent('Button');
    expect(content).toContain('forwardRef');
    expect(content).toContain('displayName');
  });

  it('Input uses forwardRef', () => {
    const content = readComponent('Input');
    expect(content).toContain('forwardRef');
    expect(content).toContain('displayName');
  });

  it('ChatInput handles Enter to send and Shift+Enter for newline', () => {
    const content = readComponent('ChatInput');
    expect(content).toContain('shiftKey');
    expect(content).toContain('Enter');
  });

  it('AutonomySelector pre-selects Partner tier', () => {
    const content = readComponent('AutonomySelector');
    expect(content).toMatch(/partner/i);
  });

  it('ThemeToggle supports light, dark, and system modes', () => {
    const content = readComponent('ThemeToggle');
    expect(content).toContain('light');
    expect(content).toContain('dark');
    expect(content).toContain('system');
  });

  it('ProgressBar supports indeterminate mode', () => {
    const content = readComponent('ProgressBar');
    expect(content).toContain('indeterminate');
  });

  it('Navigation supports collapsed mode', () => {
    const content = readComponent('Navigation');
    expect(content).toContain('collapsed');
  });

  it('ChatBubble supports streaming state', () => {
    const content = readComponent('ChatBubble');
    expect(content).toContain('streaming');
  });
});

describe('Prefers Reduced Motion — Global Handling', () => {
  it('styles.css disables all animations when prefers-reduced-motion is set', () => {
    const styles = readFileSync(join(ROOT, 'packages', 'desktop', 'src', 'styles.css'), 'utf-8');
    expect(styles).toContain('prefers-reduced-motion: reduce');
    expect(styles).toContain('animation-duration: 0.01ms');
    expect(styles).toContain('transition-duration: 0.01ms');
  });
});
