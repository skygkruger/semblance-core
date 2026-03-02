// @vitest-environment jsdom
/**
 * ApprovalCard i18n Component Smoke Test
 *
 * Validates that ApprovalCard renders with mock data.
 * react-i18next is mocked globally via vitest alias.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalCard } from '../../packages/semblance-ui/components/ApprovalCard/ApprovalCard.web';

describe('ApprovalCard — i18n smoke test', () => {
  it('renders with mock action data', () => {
    const { container } = render(
      <ApprovalCard
        action="Send email"
        context="Reply to meeting invitation from team lead"
        risk="low"
        state="pending"
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
    expect(screen.getByText('Send email')).toBeTruthy();
    expect(screen.getByText('Reply to meeting invitation from team lead')).toBeTruthy();
  });

  it('renders with data-out list and high risk', () => {
    const { container } = render(
      <ApprovalCard
        action="Delete subscription"
        context="Cancel recurring charge of $49/mo"
        dataOut={['Subscription ID', 'Payment provider']}
        risk="high"
        state="pending"
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
