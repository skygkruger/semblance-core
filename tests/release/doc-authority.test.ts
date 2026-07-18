import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkDocumentationAuthority,
  checkStateWorkflowConsistency,
  loadAuthorityWorkspace,
  scanLegacyContradictions,
  verifyAuthorityRegistry,
  type AuthorityRegistry,
  type AuthorityWorkspace,
} from '../../scripts/check-doc-authority.js';

const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoots = {
  core: coreRoot,
  representative: resolve(coreRoot, '../semblence-representative'),
};

describe('documentation authority', () => {
  it('has one content-addressed checked-in architecture authority chain', () => {
    const result = checkDocumentationAuthority(loadAuthorityWorkspace(repositoryRoots));

    expect(result.errors).toEqual([]);
    expect(result.legacyConflicts).toEqual([]);
    expect(result.canonicalPaths).toEqual([
      'semblence-representative/docs/superpowers/specs/2026-07-18-semblance-sovereign-platform-design.md',
      'semblence-representative/docs/superpowers/plans/01-truth-baseline-and-release-governance.md',
      'semblence-representative/docs/superpowers/plans/2026-07-18-semblance-sovereign-platform-program.md',
      'semblance-core/release/release-manifest.json',
    ]);
  });

  it('does not auto-approve an unregistered draft plan', () => {
    const workspace = validWorkspace({
      'semblence-representative/docs/superpowers/plans/draft.md':
        '# Draft\n**Status:** Draft plan\n',
    });

    const result = verifyAuthorityRegistry(workspace);

    expect(result.errors).toEqual([]);
    expect(result.canonicalPaths).not.toContain(
      'semblence-representative/docs/superpowers/plans/draft.md',
    );
  });

  it('accepts an explicitly registered approved ADR', () => {
    const workspace = validWorkspace();
    const path = 'semblance-core/docs/decisions/ADR-0001.md';
    workspace.files[path] = approvedDocument('Approved ADR', workspace);
    workspace.registry.authorities.splice(2, 0, authorityEntry(
      'approved-adr',
      path,
      'approved',
      workspace.files[path],
    ));
    workspace.registry.approvedAdrPaths.push(path);

    const result = verifyAuthorityRegistry(workspace);

    expect(result.errors).toEqual([]);
    expect(result.canonicalPaths).toContain(path);
  });

  it.each([
    ['draft registry status', 'draft', approvedDocument],
    ['malformed ADR metadata', 'approved', () => '# ADR without status\n'],
  ])('rejects a %s', (_name, status, contentFactory) => {
    const workspace = validWorkspace();
    const path = 'semblance-core/docs/decisions/ADR-0002.md';
    workspace.files[path] = contentFactory('Approved ADR', workspace);
    workspace.registry.authorities.splice(2, 0, authorityEntry(
      'approved-adr',
      path,
      status,
      workspace.files[path],
    ));
    workspace.registry.approvedAdrPaths.push(path);

    expect(verifyAuthorityRegistry(workspace).errors).toContainEqual(
      expect.objectContaining({
        code: status === 'draft' ? 'AUTHORITY_STATUS_INVALID' : 'DOCUMENT_STATUS_INVALID',
      }),
    );
  });

  it.each([
    ['hash tamper', (workspace: AuthorityWorkspace) => {
      workspace.files[workspace.registry.authorities[0]!.path] += '\ntampered';
    }, 'AUTHORITY_HASH_MISMATCH'],
    ['path tamper', (workspace: AuthorityWorkspace) => {
      workspace.registry.authorities[0]!.path = '../outside.md';
    }, 'AUTHORITY_PATH_INVALID'],
    ['policy hash tamper', (workspace: AuthorityWorkspace) => {
      workspace.registry.invariantPolicy.sha256 = '0'.repeat(64);
    }, 'INVARIANT_POLICY_HASH_MISMATCH'],
  ])('rejects %s', (_name, tamper, code) => {
    const workspace = validWorkspace();
    tamper(workspace);

    expect(verifyAuthorityRegistry(workspace).errors)
      .toContainEqual(expect.objectContaining({ code }));
  });

  it('rejects an authority list outside the declared order', () => {
    const workspace = validWorkspace();
    workspace.registry.authorities.reverse();

    expect(verifyAuthorityRegistry(workspace).errors)
      .toContainEqual(expect.objectContaining({ code: 'AUTHORITY_ORDER_INVALID' }));
  });

  it('requires every canonical design, plan, and ADR to reference the invariant policy', () => {
    const workspace = validWorkspace();
    const plan = workspace.registry.authorities[1]!;
    workspace.files[plan.path] = '# Plan\n**Status:** Approved plan\n';
    plan.sha256 = sha256(workspace.files[plan.path]!);

    expect(verifyAuthorityRegistry(workspace).errors)
      .toContainEqual(expect.objectContaining({ code: 'INVARIANT_POLICY_REFERENCE_MISSING' }));
  });

  it('treats negated legacy phrases as non-conflicting', () => {
    const conflicts = scanLegacyContradictions([
      {
        path: 'policy.md',
        content: 'This policy does not prohibit cloud synchronization or encrypted backup. '
          + 'The client must not contact a billing service directly. '
          + 'A waitlist token does not unlock paid features.',
      },
      {
        path: 'design.md',
        content: 'User-authorized sovereign encrypted sync is permitted. '
          + 'Reservation artifacts are reservation-only and confer no paid access.',
      },
    ]);

    expect(conflicts).toEqual([]);
  });

  it('detects semantic paraphrases as defense in depth', () => {
    const conflicts = scanLegacyContradictions([
      {
        path: 'legacy-a.md',
        content: 'Remote synchronization and off-device backup are forbidden in every form. '
          + 'The desktop client contacts the billing service itself. '
          + 'A waitlist token unlocks paid features.',
      },
      {
        path: 'policy-b.md',
        content: 'User-authorized sovereign encrypted sync is permitted. '
          + 'The application has no direct network path to commerce. '
          + 'Reservation artifacts are reservation-only and confer no paid access.',
      },
    ]);

    expect(conflicts.map((conflict) => conflict.code)).toEqual([
      'CLOUD_POLICY_CONFLICT',
      'APP_EGRESS_CONFLICT',
      'RESERVATION_ENTITLEMENT_CONFLICT',
    ]);
  });

  it('keeps SEMBLANCE_STATE historical and out of current session writes', () => {
    const claude = loadAuthorityWorkspace(repositoryRoots)
      .files['semblance-core/CLAUDE.md'];

    expect(checkStateWorkflowConsistency(claude!)).toEqual([]);
    expect(checkStateWorkflowConsistency(
      'SESSION START: Read SEMBLANCE_STATE.md\n'
        + 'SESSION END: Update SEMBLANCE_STATE.md',
    )).toEqual([
      expect.objectContaining({ code: 'STATE_WORKFLOW_INVALID' }),
      expect.objectContaining({ code: 'STATE_WORKFLOW_INVALID' }),
    ]);
  });
});

function validWorkspace(extraFiles: Record<string, string> = {}): AuthorityWorkspace {
  const policyPath = 'semblance-core/release/document-authority-policy.v1.json';
  const policy = JSON.stringify({
    schemaVersion: 1,
    policyId: 'test-policy',
    invariants: {
      zeroNetworkCore: true,
      gatewayOnlyEgress: true,
      noTelemetry: true,
      localCanonicalData: true,
      actionAndDisclosureAuditBeforeExecution: true,
      secureStorage: true,
      firstPartyPlaintextOnlyInAttestedConfidentialCompute: true,
      byoAndSelfHostedAreUserControlledDestinations: true,
      reservationArtifactsNeverGrantEntitlement: true,
      historicalStateIsReadOnly: true,
      currentStateRequiresGeneratedEvidence: true,
    },
  });
  const policyHash = sha256(policy);
  const files: Record<string, string> = {
    [policyPath]: policy,
    'semblence-representative/docs/design.md':
      documentWithPolicy('Approved design', policyPath, policyHash),
    'semblence-representative/docs/plan.md':
      documentWithPolicy('Approved plan', policyPath, policyHash),
    'semblance-core/release/evidence.json': '{"state":"Specified"}',
    ...extraFiles,
  };
  const registry: AuthorityRegistry = {
    schemaVersion: 1,
    registryId: 'test-registry',
    authorityOrder: [
      'approved-design',
      'approved-plan',
      'approved-adr',
      'generated-evidence',
    ],
    invariantPolicy: { path: policyPath, sha256: policyHash },
    approvedAdrPaths: [],
    authorities: [
      authorityEntry(
        'approved-design',
        'semblence-representative/docs/design.md',
        'approved',
        files['semblence-representative/docs/design.md']!,
      ),
      authorityEntry(
        'approved-plan',
        'semblence-representative/docs/plan.md',
        'approved',
        files['semblence-representative/docs/plan.md']!,
      ),
      authorityEntry(
        'generated-evidence',
        'semblance-core/release/evidence.json',
        'generated-baseline',
        files['semblance-core/release/evidence.json']!,
      ),
    ],
  };
  return { registry, files };
}

function authorityEntry(
  type: AuthorityRegistry['authorities'][number]['type'],
  path: string,
  status: string,
  content: string,
): AuthorityRegistry['authorities'][number] {
  return { type, path, status, sha256: sha256(content) };
}

function approvedDocument(status: string, workspace: AuthorityWorkspace): string {
  return documentWithPolicy(
    status,
    workspace.registry.invariantPolicy.path,
    workspace.registry.invariantPolicy.sha256,
  );
}

function documentWithPolicy(status: string, policyPath: string, policyHash: string): string {
  return `# Authority\n**Status:** ${status}\n`
    + `**Invariant policy:** \`${policyPath}\` (\`sha256:${policyHash}\`)\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
