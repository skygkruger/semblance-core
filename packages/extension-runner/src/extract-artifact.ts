import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ExtractedExtensionArtifact {
  extractDir: string;
  packageDir: string;
  entryFile: string;
  cleanup: () => void;
}

function findPackageDir(extractDir: string): string {
  const directPackageJson = join(extractDir, 'package.json');
  if (statSync(directPackageJson, { throwIfNoEntry: false })?.isFile()) {
    return extractDir;
  }

  const packageSubdir = join(extractDir, 'package');
  if (statSync(join(packageSubdir, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
    return packageSubdir;
  }

  for (const entry of readdirSync(extractDir)) {
    const candidate = join(extractDir, entry);
    if (statSync(candidate).isDirectory()) {
      if (statSync(join(candidate, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
        return candidate;
      }
    }
  }

  throw new Error(`No package.json found in extracted artifact at ${extractDir}`);
}

function resolveEntryFile(packageDir: string): string {
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    main?: string;
    exports?: Record<string, { import?: string } | string>;
  };

  const exportEntry = pkg.exports?.['.'];
  if (typeof exportEntry === 'object' && exportEntry.import) {
    return join(packageDir, exportEntry.import);
  }
  if (typeof exportEntry === 'string') {
    return join(packageDir, exportEntry);
  }
  if (pkg.main) {
    return join(packageDir, pkg.main);
  }
  return join(packageDir, 'index.js');
}

export function extractExtensionArtifact(artifactBytes: Buffer): ExtractedExtensionArtifact {
  const extractDir = mkdtempSync(join(tmpdir(), 'semblance-dr-'));
  const tempTarball = join(tmpdir(), `semblance-dr-artifact-${process.pid}-${Date.now()}.tgz`);
  writeFileSync(tempTarball, artifactBytes);

  try {
    execFileSync('tar', ['-xzf', tempTarball, '-C', extractDir], { stdio: 'pipe' });
  } finally {
    unlinkSync(tempTarball);
  }

  const packageDir = findPackageDir(extractDir);
  const entryFile = resolveEntryFile(packageDir);

  return {
    extractDir,
    packageDir,
    entryFile,
    cleanup: () => {
      rmSync(extractDir, { recursive: true, force: true });
    },
  };
}

export async function importExtractedExtension<TModule extends Record<string, unknown>>(
  extracted: ExtractedExtensionArtifact,
): Promise<TModule> {
  const moduleUrl = `${pathToFileURL(extracted.entryFile).href}?t=${Date.now()}`;
  return import(moduleUrl) as Promise<TModule>;
}
