import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_API_V1,
  EXTENSION_MANIFEST_V1_SCHEMA_ID,
  EXTENSION_PLATFORM_API_V1,
  ExtensionManifestV1,
  assertExtensionManifestPlatformApiV1,
  parseExtensionManifestV1,
} from '../src/index.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'protocol',
  'fixtures',
  'cross-repo',
  'extension-manifest-v1.json',
);

describe('@semblance/extension-sdk Extension API v1 contracts', () => {
  it('freezes platform API identifiers', () => {
    expect(EXTENSION_API_V1).toBe('v1');
    expect(EXTENSION_PLATFORM_API_V1).toBe('2026-07-18');
    expect(EXTENSION_MANIFEST_V1_SCHEMA_ID).toBe('extension-manifest-v1');
  });

  it('parses protocol extension-manifest-v1 fixture', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    const manifest = parseExtensionManifestV1(fixture);
    expect(manifest.id).toBe('com.semblance.dr');
    expect(manifest.uiSlots).toContain('settings.digital_representative');
    expect(manifest.schedules).toContain('daily_digest');
    expect(manifest.migration.uninstall).toBe('retain_user_data');
    assertExtensionManifestPlatformApiV1(manifest);
  });

  it('rejects manifests with unsupported platformApi', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
    const manifest = ExtensionManifestV1.parse({
      ...fixture,
      platformApi: '2099-01-01',
    });
    expect(() => assertExtensionManifestPlatformApiV1(manifest)).toThrow(/Unsupported platformApi/);
  });

  it('validates schedule and UI slot declarations are arrays of strings', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
    const manifest = parseExtensionManifestV1(fixture);
    for (const slot of manifest.uiSlots) {
      expect(typeof slot).toBe('string');
    }
    for (const schedule of manifest.schedules) {
      expect(typeof schedule).toBe('string');
    }
  });
});
