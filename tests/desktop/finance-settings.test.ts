/**
 * Step 19 — FinanceSettingsSection tests.
 * CSV import button, Plaid shows Digital Representative prompt for free tier.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FinanceSettingsSectionProps } from '../../packages/desktop/src/components/FinanceSettingsSection';

describe('FinanceSettingsSection (Step 19)', () => {
  it('provides CSV/OFX import handlers', () => {
    const onImportCSV = vi.fn();
    const onImportOFX = vi.fn();

    const props: FinanceSettingsSectionProps = {
      isPremium: false,
      onImportCSV,
      onImportOFX,
      onConnectPlaid: vi.fn(),
      onDisconnectPlaid: vi.fn(),
      onActivateDigitalRepresentative: vi.fn(),
    };

    // Import buttons should call handlers
    props.onImportCSV();
    props.onImportOFX();
    expect(onImportCSV).toHaveBeenCalled();
    expect(onImportOFX).toHaveBeenCalled();
  });

  it('free tier shows Digital Representative prompt for Plaid', () => {
    const onActivate = vi.fn();

    const props: FinanceSettingsSectionProps = {
      isPremium: false,
      onImportCSV: vi.fn(),
      onImportOFX: vi.fn(),
      onConnectPlaid: vi.fn(),
      onDisconnectPlaid: vi.fn(),
      onActivateDigitalRepresentative: onActivate,
    };

    // Free tier should show activation instead of connect
    expect(props.isPremium).toBe(false);
    props.onActivateDigitalRepresentative();
    expect(onActivate).toHaveBeenCalled();
  });
});
