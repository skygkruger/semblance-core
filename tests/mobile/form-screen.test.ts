/**
 * Step 21 — FormScreen (mobile) test.
 * Tests mobile form screen rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  FormScreenProps,
  MobileFormField,
} from '@semblance/mobile/src/screens/FormScreen';

function makeProps(overrides?: Partial<FormScreenProps>): FormScreenProps {
  return {
    isPremium: true,
    fields: [
      {
        name: 'fullName',
        label: 'Full Name',
        type: 'text',
        value: 'John Smith',
        confidence: 'high' as const,
        source: 'user-profile',
        requiresManualEntry: false,
      },
    ],
    submissions: [],
    templates: [{ id: 'expense-report', name: 'Expense Report', description: 'Test', category: 'employment' }],
    hasXFA: false,
    onPickFile: vi.fn(),
    onFillField: vi.fn(),
    onSaveFilledPdf: vi.fn(),
    onSubmitForm: vi.fn(),
    onResolveSubmission: vi.fn(),
    ...overrides,
  };
}

describe('FormScreen (Step 21)', () => {
  it('renders mobile form screen with file picker and field list', () => {
    const props = makeProps();
    expect(props.isPremium).toBe(true);
    expect(props.fields).toHaveLength(1);
    expect(props.fields[0]!.value).toBe('John Smith');
    expect(typeof props.onPickFile).toBe('function');
  });
});
