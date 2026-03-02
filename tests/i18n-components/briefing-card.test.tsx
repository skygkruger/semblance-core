// @vitest-environment jsdom
/**
 * BriefingCard i18n Component Smoke Test
 *
 * Validates that BriefingCard renders with mock data.
 * react-i18next is mocked globally via vitest alias.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BriefingCard } from '../../packages/semblance-ui/components/BriefingCard/BriefingCard.web';

describe('BriefingCard — i18n smoke test', () => {
  it('renders with mock briefing items', () => {
    const { container } = render(
      <BriefingCard
        items={[
          { type: 'action', text: '3 emails archived' },
          { type: 'pending', text: 'Calendar conflict at 2pm' },
          { type: 'insight', text: 'Meeting prep recommended' },
        ]}
      />,
    );
    expect(container).toBeTruthy();
    expect(screen.getByText('3 emails archived')).toBeTruthy();
    expect(screen.getByText('Calendar conflict at 2pm')).toBeTruthy();
    expect(screen.getByText('Meeting prep recommended')).toBeTruthy();
  });

  it('renders with userName and founding member props', () => {
    const { container } = render(
      <BriefingCard
        items={[{ type: 'action', text: 'Test action' }]}
        userName="Sky"
        isFoundingMember={true}
        foundingSeat={42}
      />,
    );
    expect(container).toBeTruthy();
  });
});
