export interface MarkdownDocument {
  path: string;
  repository?: string;
  content: string;
}

export type RepositoryMarkdown = MarkdownDocument[];

export interface DocumentationConflict {
  code: string;
  message: string;
  paths: string[];
}

export interface DocumentationAuthorityResult {
  canonicalPaths: string[];
  missingAuthorities: string[];
  conflicts: DocumentationConflict[];
  invariants: {
    zeroNetworkCore: boolean;
    gatewayOnlyEgress: boolean;
    noTelemetry: boolean;
    localCanonicalData: boolean;
    actionAudit: boolean;
    secureStorage: boolean;
  };
}

export function collectRepositoryMarkdown(
  repositoryRoots: Record<string, string>,
): RepositoryMarkdown;

export function scanDocumentationAuthority(
  repositoryMarkdown: RepositoryMarkdown,
): DocumentationAuthorityResult;
