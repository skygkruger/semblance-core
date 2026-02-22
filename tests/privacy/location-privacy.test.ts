// Location Privacy Tests — Verify no network imports in location/weather code,
// no Gateway imports, and adapter interfaces have no network methods.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const LOCATION_DIR = resolve(__dirname, '../../packages/core/location');
const WEATHER_DIR = resolve(__dirname, '../../packages/core/weather');

/** Banned network patterns in packages/core/ location and weather code */
const NETWORK_PATTERNS = [
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\brequire\s*\(\s*['"]http['"]\s*\)/,
  /\brequire\s*\(\s*['"]https['"]\s*\)/,
  /\brequire\s*\(\s*['"]net['"]\s*\)/,
  /\bimport\b.*['"]axios['"]/,
  /\bimport\b.*['"]node-fetch['"]/,
  /\bimport\b.*['"]got['"]/,
  /\bimport\b.*['"]undici['"]/,
];

const GATEWAY_PATTERNS = [
  /from\s+['"].*gateway/,
  /import\s+.*['"].*gateway/,
  /require\s*\(\s*['"].*gateway/,
];

function getTypeScriptFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getTypeScriptFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('Location Privacy', () => {
  it('no network imports in packages/core/location/', () => {
    const files = getTypeScriptFiles(LOCATION_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of NETWORK_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found network pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('no network imports in packages/core/weather/', () => {
    const files = getTypeScriptFiles(WEATHER_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of NETWORK_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found network pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('no Gateway imports in location/weather code', () => {
    const locationFiles = getTypeScriptFiles(LOCATION_DIR);
    const weatherFiles = getTypeScriptFiles(WEATHER_DIR);
    const allFiles = [...locationFiles, ...weatherFiles];

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of GATEWAY_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found Gateway import in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('LocationAdapter and WeatherAdapter interfaces have no network methods', () => {
    const locationTypesFile = resolve(__dirname, '../../packages/core/platform/location-types.ts');
    const weatherTypesFile = resolve(__dirname, '../../packages/core/platform/weather-types.ts');

    const locationContent = readFileSync(locationTypesFile, 'utf-8');
    const weatherContent = readFileSync(weatherTypesFile, 'utf-8');

    // Extract LocationAdapter interface block
    const locationMatch = locationContent.match(/interface\s+LocationAdapter\s*\{[\s\S]*?\n\}/);
    expect(locationMatch).not.toBeNull();
    const locationBlock = locationMatch![0];

    // Should not contain network-related method names
    expect(locationBlock).not.toMatch(/\bsync\b/i);
    expect(locationBlock).not.toMatch(/\bupload\b/i);
    expect(locationBlock).not.toMatch(/\bdownload\b/i);
    expect(locationBlock).not.toMatch(/\bapi\b/i);
    expect(locationBlock).not.toMatch(/\bhttp\b/i);

    // Should contain expected local methods
    expect(locationBlock).toMatch(/getCurrentLocation/);
    expect(locationBlock).toMatch(/hasPermission/);

    // Extract WeatherAdapter interface block
    const weatherMatch = weatherContent.match(/interface\s+WeatherAdapter\s*\{[\s\S]*?\n\}/);
    expect(weatherMatch).not.toBeNull();
    const weatherBlock = weatherMatch![0];

    // Should not contain network-related method names
    expect(weatherBlock).not.toMatch(/\bsync\b/i);
    expect(weatherBlock).not.toMatch(/\bupload\b/i);
    expect(weatherBlock).not.toMatch(/\bdownload\b/i);
    expect(weatherBlock).not.toMatch(/\bapi\b/i);
    expect(weatherBlock).not.toMatch(/\bhttp\b/i);

    // Should contain expected local methods
    expect(weatherBlock).toMatch(/getForecast/);
    expect(weatherBlock).toMatch(/getCurrentConditions/);
  });
});
