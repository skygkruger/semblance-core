import type { Preview } from '@storybook/react';
import { colorTokens } from '../tokens/colors';
import { typographyTokens } from '../tokens/typography';
import { spacingTokens } from '../tokens/spacing';
import { shadowTokens } from '../tokens/shadows';

// Merge all design tokens into CSS custom properties
const allTokens: Record<string, string> = {
  ...colorTokens,
  ...typographyTokens,
  ...spacingTokens,
  ...shadowTokens,
};

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#1A1D2E' },
        { name: 'light', value: '#FAFBFC' },
      ],
    },
  },
  decorators: [
    (Story) => {
      // Apply all Semblance design tokens as CSS custom properties on the root
      const root = document.documentElement;
      for (const [prop, value] of Object.entries(allTokens)) {
        root.style.setProperty(prop, value);
      }
      return Story();
    },
  ],
};

export default preview;
