export interface ReleaseManifestCliError {
  code: string;
  message: string;
  path?: string;
}

export interface ReleaseManifestCliResult {
  valid: boolean;
  errors: ReleaseManifestCliError[];
}

export interface ReleaseRepositoryAdapter {
  root: string;
  headCommit: string;
  isAncestor(sourceCommit: string, headCommit: string): boolean;
  treeHash(sourceCommit: string): string | null;
}

export interface ReleaseManifestAdapters {
  trustedKeys: unknown;
  now?: Date;
  repositories: Record<'core' | 'representative' | 'website', ReleaseRepositoryAdapter>;
  artifactRoot: string;
  readFile(path: string): Buffer;
  realpath(path: string): string;
}

export function verifyReleaseManifest(
  manifest: unknown,
  adapters: ReleaseManifestAdapters,
): Promise<ReleaseManifestCliResult>;
