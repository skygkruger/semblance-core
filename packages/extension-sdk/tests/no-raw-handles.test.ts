import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as sdk from '../src/index.js';
import {
  FORBIDDEN_RAW_HANDLE_EXPORTS,
  assertSdkSurfaceNoRawHandles,
  findForbiddenRawHandleExports,
  findForbiddenRawHandleSubstrings,
} from '../src/no-raw-handles.js';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function listPublicExportNames(): string[] {
  const indexSource = readFileSync(join(srcRoot, 'index.ts'), 'utf8');
  const reExportModules = [...indexSource.matchAll(/export \* from '\.\/([^']+)\.js'/g)].map(
    (match) => match[1] ?? '',
  );

  const exportNames = new Set<string>(Object.keys(sdk));

  for (const moduleName of reExportModules) {
    const modulePath = join(srcRoot, `${moduleName}.ts`);
    const moduleSource = readFileSync(modulePath, 'utf8');
    for (const match of moduleSource.matchAll(/^export (?:type )?(?:const|function|interface|class|enum) (\w+)/gm)) {
      exportNames.add(match[1] ?? '');
    }
    for (const match of moduleSource.matchAll(/^export \{([^}]+)\}/gm)) {
      for (const part of match[1]?.split(',') ?? []) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (name) exportNames.add(name);
      }
    }
  }

  return [...exportNames].sort();
}

describe('@semblance/extension-sdk no raw handles', () => {
  it('documents forbidden raw handle export names', () => {
    expect(FORBIDDEN_RAW_HANDLE_EXPORTS).toContain('VaultHandle');
    expect(FORBIDDEN_RAW_HANDLE_EXPORTS).toContain('GatewayHandle');
    expect(FORBIDDEN_RAW_HANDLE_EXPORTS).toContain('OsHandle');
  });

  it('does not export forbidden raw handle symbols from the public index', () => {
    const exportNames = listPublicExportNames();
    const exact = findForbiddenRawHandleExports(exportNames);
    const substring = findForbiddenRawHandleSubstrings(exportNames);
    expect(exact).toEqual([]);
    expect(substring).toEqual([]);
    expect(() => assertSdkSurfaceNoRawHandles(exportNames)).not.toThrow();
  });

  it('exports mediated clients instead of raw handles', () => {
    expect(sdk.VaultClient).toBeUndefined();
    expect(sdk.GatewayActionClient).toBeUndefined();
    expect(typeof sdk.createRecordingVaultClient).toBe('undefined');
    expect('VaultClient' in sdk).toBe(false);
    expect('GatewayHandle' in sdk).toBe(false);
    expect('OsHandle' in sdk).toBe(false);
  });

  it('src tree contains no raw handle type declarations', () => {
    const files = readdirSync(srcRoot).filter((file) => file.endsWith('.ts'));
    for (const file of files) {
      const source = readFileSync(join(srcRoot, file), 'utf8');
      for (const forbidden of FORBIDDEN_RAW_HANDLE_EXPORTS) {
        expect(source.includes(`export interface ${forbidden}`)).toBe(false);
        expect(source.includes(`export type ${forbidden}`)).toBe(false);
      }
    }
  });
});
