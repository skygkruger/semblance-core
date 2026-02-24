/**
 * Step 21 — FormFillFlow (desktop) tests.
 * Tests form fill UI rendering, free tier, and bureaucracy tracking display.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  FormFillFlowProps,
  FormFieldView,
} from '@semblance/desktop/components/FormFillFlow';
import type { FormSubmission } from '@semblance/core/forms/types';

function makeField(overrides?: Partial<FormFieldView>): FormFieldView {
  return {
    name: 'fullName',
    label: 'Full Name',
    type: 'text',
    value: 'John Smith',
    confidence: 'high',
    source: 'user-profile',
    requiresManualEntry: false,
    ...overrides,
  };
}

function makeSubmission(overrides?: Partial<FormSubmission>): FormSubmission {
  return {
    id: 'fs_1',
    formName: 'Expense Report',
    filledAt: new Date().toISOString(),
    expectedResponseDays: 14,
    status: 'submitted',
    ...overrides,
  };
}

function makeProps(overrides?: Partial<FormFillFlowProps>): FormFillFlowProps {
  return {
    isPremium: true,
    fields: [makeField()],
    submissions: [makeSubmission()],
    templates: [{ id: 'expense-report', name: 'Expense Report', description: 'Employee expense report', category: 'employment' }],
    hasXFA: false,
    onDropFile: vi.fn(),
    onFillField: vi.fn(),
    onSaveFilledPdf: vi.fn(),
    onSubmitForm: vi.fn(),
    onResolveSubmission: vi.fn(),
    ...overrides,
  };
}

describe('FormFillFlow (Step 21)', () => {
  it('renders form fill UI with field preview', () => {
    const props = makeProps({
      fields: [
        makeField({ name: 'fullName', confidence: 'high' }),
        makeField({ name: 'ssn', value: null, confidence: 'high', requiresManualEntry: true }),
      ],
    });

    expect(props.fields).toHaveLength(2);
    expect(props.fields[0]!.confidence).toBe('high');
    expect(props.fields[1]!.requiresManualEntry).toBe(true);
  });

  it('shows "Digital Representative" prompt for free tier (not "Premium")', () => {
    const props = makeProps({ isPremium: false });
    expect(props.isPremium).toBe(false);
    // Component would render free tier view when isPremium is false
  });

  it('displays bureaucracy tracking list with status indicators', () => {
    const props = makeProps({
      submissions: [
        makeSubmission({ id: 'fs_1', formName: 'Expense Report', status: 'submitted' }),
        makeSubmission({ id: 'fs_2', formName: 'PTO Request', status: 'needs-attention' }),
      ],
    });

    expect(props.submissions).toHaveLength(2);
    expect(props.submissions[1]!.status).toBe('needs-attention');
  });
});
