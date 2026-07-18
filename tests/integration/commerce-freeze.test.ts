import { beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import { setLicensePublicKey } from '../../packages/core/premium/license-keys.js';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  validDRKey,
} from '../fixtures/license-keys.js';

const ROOT = join(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'release', 'release-manifest.json'), 'utf8')) as {
  commerce: { newSalesEnabled: boolean };
};
const licenseContext = readFileSync(
  join(ROOT, 'packages', 'desktop', 'src', 'contexts', 'LicenseContext.tsx'),
  'utf8',
);
const upgradeScreen = readFileSync(
  join(ROOT, 'packages', 'semblance-ui', 'components', 'UpgradeScreen', 'UpgradeScreen.web.tsx'),
  'utf8',
);

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

describe('release-manifest commerce freeze', () => {
  it('bundles new sales as disabled and gates every checkout control from that value', () => {
    expect(manifest.commerce.newSalesEnabled).toBe(false);
    expect(licenseContext).toContain("releaseManifest.commerce.newSalesEnabled");
    expect(upgradeScreen).toContain('newSalesEnabled');
    expect(upgradeScreen).toContain('Sales are paused while existing entitlements are migrated');
    expect(upgradeScreen).not.toMatch(/newSalesEnabled\s*\|\|\s*onCheckout/);
  });

  it('keeps paid key activation, subscription renewal, and portal capability during freeze', () => {
    const db = new Database(':memory:');
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    expect(gate.activateLicense(validDRKey()).success).toBe(true);
    expect(gate.isPremium()).toBe(true);

    expect(licenseContext).toContain('activateLicenseKey(key)');
    expect(licenseContext).toContain('manageSubscription');
    expect(licenseContext).toContain('WORKER_URL');
    const portalBody = licenseContext.slice(
      licenseContext.indexOf('const manageSubscription ='),
      licenseContext.indexOf('const value ='),
    );
    expect(portalBody).not.toContain('newSalesEnabled');
    db.close();
  });
});
