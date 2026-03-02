// @vitest-environment jsdom
/**
 * AgentInput i18n Component Smoke Test
 *
 * Validates that AgentInput renders without crashing.
 * react-i18next is mocked globally via vitest alias — useTranslation returns keys as-is.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AgentInput } from '../../packages/semblance-ui/components/AgentInput/AgentInput.web';

describe('AgentInput — i18n smoke test', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <AgentInput onSend={vi.fn()} />,
    );
    expect(container).toBeTruthy();
    // AgentInput should render a textarea element
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
  });

  it('renders with thinking state', () => {
    const { container } = render(
      <AgentInput onSend={vi.fn()} thinking={true} />,
    );
    expect(container).toBeTruthy();
  });
});
