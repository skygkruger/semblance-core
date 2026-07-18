export interface MarkdownDocument {
  path: string;
  content: string;
}

export type RepositoryMarkdown = MarkdownDocument[];

export type AuthorityType =
  | 'approved-design'
  | 'approved-plan'
  | 'approved-adr'
  | 'generated-evidence';

export interface AuthorityEntry {
  type: AuthorityType;
  path: string;
  status: string;
  sha256: string;
}

export interface AuthorityRegistry {
  schemaVersion: 1;
  registryId: string;
  authorityOrder: AuthorityType[];
  invariantPolicy: { path: string; sha256: string };
  approvedAdrPaths: string[];
  authorities: AuthorityEntry[];
}

export interface AuthorityWorkspace {
  registry: AuthorityRegistry;
  registryError?: string | null;
  registryPath?: string;
  files: Record<string, string>;
}

export interface AuthorityViolation {
  code: string;
  message: string;
  path?: string;
}

export interface DocumentationConflict extends AuthorityViolation {
  paths: string[];
}

export interface AuthorityRegistryResult {
  canonicalPaths: string[];
  errors: AuthorityViolation[];
}

export interface DocumentationAuthorityResult extends AuthorityRegistryResult {
  legacyConflicts: DocumentationConflict[];
}

export function collectRepositoryFiles(
  repositoryRoots: Record<string, string>,
): Record<string, string>;

export function collectRepositoryMarkdown(
  repositoryRoots: Record<string, string>,
): RepositoryMarkdown;

export function loadAuthorityWorkspace(
  repositoryRoots: Record<string, string>,
  registryPath?: string,
): AuthorityWorkspace;

export function verifyAuthorityRegistry(
  workspace: AuthorityWorkspace,
): AuthorityRegistryResult;

export function scanLegacyContradictions(
  documents: RepositoryMarkdown,
): DocumentationConflict[];

export function checkStateWorkflowConsistency(content: string): AuthorityViolation[];

export function checkDocumentationAuthority(
  workspace: AuthorityWorkspace,
): DocumentationAuthorityResult;
