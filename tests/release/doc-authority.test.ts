import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectRepositoryMarkdown,
  scanDocumentationAuthority,
  type RepositoryMarkdown,
} from '../../scripts/check-doc-authority.js';

const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repositoryRoots = {
  core: coreRoot,
  representative: resolve(coreRoot, '../semblence-representative'),
};

describe('documentation authority', () => {
  it('has one checked-in architecture authority chain', () => {
    const repositoryMarkdown = collectRepositoryMarkdown(repositoryRoots);
    const result = scanDocumentationAuthority(repositoryMarkdown);

    expect(result.missingAuthorities).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.canonicalPaths).toEqual([
      'semblence-representative/docs/superpowers/specs/2026-07-18-semblance-sovereign-platform-design.md',
      'semblence-representative/docs/superpowers/plans/',
    ]);
  });

  it('does not require a missing gitignored Build Bible', () => {
    const repositoryMarkdown = collectRepositoryMarkdown(repositoryRoots);

    expect(scanDocumentationAuthority(repositoryMarkdown).missingAuthorities)
      .not.toContain('SEMBLANCE_BUILD_BIBLE.md');
  });

  it('rejects a missing Build Bible claimed as active canonical authority', () => {
    const fixture: RepositoryMarkdown = [{
      path: 'semblance-core/CLAUDE.md',
      content: '<!-- doc-authority: active -->\n'
        + 'Read SEMBLANCE_BUILD_BIBLE.md. It is the mandatory canonical specification.',
    }];

    expect(scanDocumentationAuthority(fixture).missingAuthorities)
      .toContain('SEMBLANCE_BUILD_BIBLE.md');
  });

  it.each([
    {
      name: 'cloud prohibition conflicts with sovereign cloud',
      left: 'No cloud sync. No cloud backup. No remote storage of any kind.',
      right: 'Approved sovereign cloud and encrypted sync are permitted.',
      expected: 'CLOUD_POLICY_CONFLICT',
    },
    {
      name: 'zero app egress conflicts with direct commerce calls',
      left: 'The Semblance app makes zero outbound calls. Ever.',
      right: 'The app directly calls the commerce entitlement endpoint.',
      expected: 'APP_EGRESS_CONFLICT',
    },
    {
      name: 'reservation and entitlement semantics conflict',
      left: 'A founding reservation JWT grants premium entitlement.',
      right: 'A reservation JWT is reservation only and never an entitlement.',
      expected: 'RESERVATION_ENTITLEMENT_CONFLICT',
    },
  ])('detects $name between active authorities', ({ left, right, expected }) => {
    const fixture: RepositoryMarkdown = [
      authorityFixture('docs/left.md', left),
      authorityFixture('docs/right.md', right),
    ];

    expect(scanDocumentationAuthority(fixture).conflicts)
      .toContainEqual(expect.objectContaining({ code: expected }));
  });

  it('does not rewrite historical logs as current truth', () => {
    const fixture: RepositoryMarkdown = [
      authorityFixture(
        'docs/current.md',
        'Approved sovereign cloud and encrypted sync are permitted. '
          + 'A reservation JWT is reservation only and never an entitlement.',
      ),
      {
        path: 'docs/history.md',
        content: '<!-- doc-authority: historical -->\n'
          + 'No cloud sync. A founding reservation JWT grants premium entitlement.',
      },
    ];

    expect(scanDocumentationAuthority(fixture).conflicts).toEqual([]);
  });

  it('preserves the active architecture invariants', () => {
    const result = scanDocumentationAuthority(collectRepositoryMarkdown(repositoryRoots));

    expect(result.invariants).toEqual(expect.objectContaining({
      zeroNetworkCore: true,
      gatewayOnlyEgress: true,
      noTelemetry: true,
      localCanonicalData: true,
      actionAudit: true,
      secureStorage: true,
    }));
  });
});

function authorityFixture(path: string, content: string): RepositoryMarkdown[number] {
  return {
    path,
    content: `<!-- doc-authority: active -->\n${content}`,
  };
}
