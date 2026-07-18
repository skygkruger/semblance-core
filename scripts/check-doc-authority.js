#!/usr/bin/env node
'use strict';

const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { basename, join, relative, resolve, sep } = require('node:path');

const DESIGN_PATH =
  'semblence-representative/docs/superpowers/specs/2026-07-18-semblance-sovereign-platform-design.md';
const PLANS_PATH = 'semblence-representative/docs/superpowers/plans/';
const BUILD_BIBLE = 'SEMBLANCE_BUILD_BIBLE.md';
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.superpowers',
  'node_modules',
  'build',
  'dist',
  'target',
  'coverage',
]);

function normalizePath(path) {
  return path.split(sep).join('/');
}

function markdownFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const path = join(current, entry.name);
    if (entry.isDirectory()) return markdownFiles(root, path);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [path] : [];
  });
}

/**
 * Read Markdown from each repository. Paths are stable cross-repository paths rather than
 * machine-specific absolute paths, so scan results are deterministic in CI and locally.
 */
function collectRepositoryMarkdown(repositoryRoots) {
  const entries = [];
  for (const [repository, rootInput] of Object.entries(repositoryRoots).sort()) {
    const root = resolve(rootInput);
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    for (const path of markdownFiles(root).sort()) {
      entries.push({
        path: `${basename(root)}/${normalizePath(relative(root, path))}`,
        repository,
        content: readFileSync(path, 'utf8'),
      });
    }
  }
  return entries;
}

function authorityStatus(document) {
  const marker = /<!--\s*doc-authority:\s*([a-z-]+)\s*-->/i.exec(document.content);
  if (marker) return marker[1].toLowerCase();
  if (document.path === DESIGN_PATH && /\*\*Status:\*\*\s*Approved design/i.test(document.content)) {
    return 'approved';
  }
  if (document.path.startsWith(PLANS_PATH)) return 'approved-plan';
  return 'informational';
}

function claimsMissingBuildBible(document, status) {
  if (!isActiveStatus(status) || !document.content.includes(BUILD_BIBLE)) return false;
  const claimingLines = document.content.split(/\r?\n/).filter(
    (line) => line.includes(BUILD_BIBLE)
      && !/(?:remove|missing|does not require|not require|not contain|supersed)/i.test(line),
  );
  return claimingLines.some((line) => [
    /BUILD_BIBLE\.md[^\n]*(?:canonical|mandatory|required)/i,
    /(?:canonical|mandatory|required)[^\n]*BUILD_BIBLE\.md/i,
    /read[^\n]*BUILD_BIBLE\.md/i,
  ].some((pattern) => pattern.test(line)));
}

function isActiveStatus(status) {
  return status === 'active' || status === 'approved' || status === 'approved-plan';
}

function semanticClaims(content) {
  return {
    cloudProhibited: /no cloud sync\.\s*no cloud backup\.\s*no remote storage/i.test(content),
    sovereignCloud: /approved sovereign cloud/i.test(content)
      || /optional encrypted sync\/backup/i.test(content)
      || /sovereign hybrid with user-controlled cloud/i.test(content),
    appNoOutbound: /(?:semblance|the) app(?:lication)? makes zero outbound (?:api )?calls(?:\. ever)?/i
      .test(content),
    directCommerce: /(?:app|application) directly calls? (?:the )?commerce/i.test(content),
    reservationGrantsEntitlement:
      /reservation jwt (?:grants?|activates?|is) (?:a )?(?:premium |paid )?entitlement/i.test(content)
      || /founding reservation jwt grants premium/i.test(content),
    reservationOnly: /reservation jwt is reservation only and never an entitlement/i.test(content)
      || /reservation artifacts? (?:only and )?never grants? paid access/i.test(content)
      || /waitlist reservations do not grant premium access/i.test(content),
  };
}

function documentsWithClaim(documents, claim) {
  return documents
    .filter((document) => semanticClaims(document.content)[claim])
    .map((document) => document.path)
    .sort();
}

function addConflict(conflicts, code, message, leftPaths, rightPaths) {
  if (leftPaths.length === 0 || rightPaths.length === 0) return;
  conflicts.push({
    code,
    message,
    paths: [...new Set([...leftPaths, ...rightPaths])].sort(),
  });
}

function invariantClaims(activeDocuments) {
  const text = activeDocuments.map((document) => document.content).join('\n');
  return {
    zeroNetworkCore: /Core (?:process )?(?:must )?(?:NEVER|never|has no ambient network entitlement)/i
      .test(text) || /zero network in AI Core/i.test(text),
    gatewayOnlyEgress: /Gateway is the (?:sole|only)[^\n]*(?:network|external)/i.test(text)
      || /Gateway-only (?:egress|transport)/i.test(text),
    noTelemetry: /No telemetry/i.test(text) || /Zero analytics\. Zero telemetry/i.test(text),
    localCanonicalData: /local[^\n]*canonical (?:user )?data remain authoritative/i.test(text),
    actionAudit: /audit(?:ed)? (?:trail|actions?)?[^\n]*(?:before execution|before dispatch)/i.test(text)
      || /audited before execution/i.test(text),
    secureStorage: /(?:OS|hardware)[^\n]*secure storage/i.test(text),
  };
}

/**
 * Analyze only documents explicitly designated as active/approved authority. Unmarked
 * documentation is informational; historical markers preserve old assertions without
 * allowing them to override current policy.
 */
function scanDocumentationAuthority(repositoryMarkdown) {
  const documents = repositoryMarkdown.map((document) => ({
    ...document,
    path: normalizePath(document.path),
  }));
  const statuses = new Map(
    documents.map((document) => [document.path, authorityStatus(document)]),
  );
  const activeDocuments = documents.filter(
    (document) => isActiveStatus(statuses.get(document.path)),
  );
  const paths = new Set(documents.map((document) => document.path));
  const canonicalPaths = [];
  const missingAuthorities = [];

  if (paths.has(DESIGN_PATH)) canonicalPaths.push(DESIGN_PATH);
  else missingAuthorities.push(DESIGN_PATH);
  if ([...paths].some((path) => path.startsWith(PLANS_PATH))) canonicalPaths.push(PLANS_PATH);
  else missingAuthorities.push(PLANS_PATH);

  if (activeDocuments.some(
    (document) => claimsMissingBuildBible(document, statuses.get(document.path)),
  ) && !paths.has(`semblance-core/${BUILD_BIBLE}`)) {
    missingAuthorities.push(BUILD_BIBLE);
  }

  const conflicts = [];
  addConflict(
    conflicts,
    'CLOUD_POLICY_CONFLICT',
    'Active authorities both prohibit all cloud storage and permit sovereign cloud.',
    documentsWithClaim(activeDocuments, 'cloudProhibited'),
    documentsWithClaim(activeDocuments, 'sovereignCloud'),
  );
  addConflict(
    conflicts,
    'APP_EGRESS_CONFLICT',
    'Active authorities both prohibit all app egress and require direct app commerce calls.',
    documentsWithClaim(activeDocuments, 'appNoOutbound'),
    documentsWithClaim(activeDocuments, 'directCommerce'),
  );
  addConflict(
    conflicts,
    'RESERVATION_ENTITLEMENT_CONFLICT',
    'Active authorities classify a reservation JWT as both reservation and entitlement.',
    documentsWithClaim(activeDocuments, 'reservationGrantsEntitlement'),
    documentsWithClaim(activeDocuments, 'reservationOnly'),
  );

  return {
    canonicalPaths,
    missingAuthorities: [...new Set(missingAuthorities)].sort(),
    conflicts,
    invariants: invariantClaims(activeDocuments),
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== '--core-repo' && name !== '--representative-repo') {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function runCli() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (cause) {
    console.error(`DOC_AUTHORITY_ARGUMENT_INVALID: ${cause.message}`);
    return 1;
  }
  const core = resolve(options['core-repo'] ?? join(__dirname, '..'));
  const representative = resolve(
    options['representative-repo'] ?? join(core, '..', 'semblence-representative'),
  );
  const result = scanDocumentationAuthority(collectRepositoryMarkdown({ core, representative }));
  for (const authority of result.missingAuthorities) {
    console.error(`MISSING_AUTHORITY: ${authority}`);
  }
  for (const conflict of result.conflicts) {
    console.error(`${conflict.code}: ${conflict.message} [${conflict.paths.join(', ')}]`);
  }
  const missingInvariants = Object.entries(result.invariants)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  for (const invariant of missingInvariants) {
    console.error(`MISSING_INVARIANT: ${invariant}`);
  }
  if (result.missingAuthorities.length || result.conflicts.length || missingInvariants.length) {
    return 1;
  }
  console.log(`Documentation authority verified: ${result.canonicalPaths.join(' -> ')}`);
  return 0;
}

module.exports = { collectRepositoryMarkdown, scanDocumentationAuthority };

if (require.main === module) process.exitCode = runCli();
