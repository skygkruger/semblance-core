import React from 'react';
import type { Preview } from '@storybook/react';
import '../tokens/tokens.css';
import '../tokens/fonts.css';
import '../tokens/opal.css';
import { DotMatrix } from '../components/DotMatrix/DotMatrix';

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    viewport: {
      viewports: {
        mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' } },
        tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '900px' } },
        wide: { name: 'Wide', styles: { width: '1440px', height: '900px' } },
      },
    },
  },
  decorators: [
    (Story) =>
      React.createElement(
        'div',
        { style: { position: 'relative', minHeight: '100vh', background: '#0B0E11' } },
        React.createElement(DotMatrix, null),
        React.createElement(
          'div',
          { style: { position: 'relative', zIndex: 1, padding: '2rem' } },
          React.createElement(Story, null),
        ),
      ),
  ],
};

export default preview;
