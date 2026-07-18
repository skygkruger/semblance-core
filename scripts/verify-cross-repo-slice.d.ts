export interface CrossRepoSliceError {
  code: string;
  message: string;
  path?: string;
}

export interface CrossRepoSliceResult {
  valid: boolean;
  errors: CrossRepoSliceError[];
}

export interface CrossRepoGitRepository {
  root: string;
  headCommit: string;
  isAncestor(sourceCommit: string, headCommit: string): boolean;
  treeHash(sourceCommit: string): string;
}

export function verifyCrossRepoSlice(options: {
  manifest: unknown;
  repositories: Record<'core' | 'representative' | 'website', CrossRepoGitRepository>;
}): CrossRepoSliceResult;

export const MIGRATION_EVIDENCE_IDS: string[];
