#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { basename, join, relative, resolve, sep } = require('node:path');

const REGISTRY_PATH =
  'semblence-representative/docs/release-manifests/document-authority.v1.json';
const AUTHORITY_ORDER = [
  'approved-design',
  'approved-plan',
  'approved-adr',
  'generated-evidence',
];
const REQUIRED_INVARIANTS = [
  'zeroNetworkCore',
  'gatewayOnlyEgress',
  'noTelemetry',
  'localCanonicalData',
  'actionAndDisclosureAuditBeforeExecution',
  'secureStorage',
  'firstPartyPlaintextOnlyInAttestedConfidentialCompute',
  'byoAndSelfHostedAreUserControlledDestinations',
  'reservationArtifactsNeverGrantEntitlement',
  'historicalStateIsReadOnly',
  'currentStateRequiresGeneratedEvidence',
];
const STATUS_BY_TYPE = {
  'approved-design': 'approved',
  'approved-plan': 'approved',
  'approved-adr': 'approved',
  'generated-evidence': 'generated-baseline',
};
const DOCUMENT_STATUS_BY_TYPE = {
  'approved-design': 'Approved design',
  'approved-plan': 'Approved plan',
  'approved-adr': 'Approved ADR',
};
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.superpowers',
  'node_modules',
  'build',
  'dist',
  'target',
  'coverage',
]);
const INCLUDED_EXTENSIONS = /\.(?:md|json)$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function normalizePath(path) {
  return path.split(sep).join('/');
}

function repositoryFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) return [];
    const path = join(current, entry.name);
    if (entry.isDirectory()) return repositoryFiles(root, path);
    return entry.isFile() && INCLUDED_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

function collectRepositoryFiles(repositoryRoots) {
  const files = {};
  for (const [, rootInput] of Object.entries(repositoryRoots).sort()) {
    const root = resolve(rootInput);
    if (!existsSync(root) || !statSync(root).isDirectory()) continue;
    for (const path of repositoryFiles(root).sort()) {
      files[`${basename(root)}/${normalizePath(relative(root, path))}`] =
        readFileSync(path, 'utf8');
    }
  }
  return files;
}

function collectRepositoryMarkdown(repositoryRoots) {
  return Object.entries(collectRepositoryFiles(repositoryRoots))
    .filter(([path]) => path.toLowerCase().endsWith('.md'))
    .map(([path, content]) => ({ path, content }));
}

function loadAuthorityWorkspace(repositoryRoots, registryPath = REGISTRY_PATH) {
  const files = collectRepositoryFiles(repositoryRoots);
  let registry = null;
  let registryError = null;
  try {
    registry = JSON.parse(files[registryPath]);
  } catch (cause) {
    registryError = cause instanceof Error ? cause.message : String(cause);
  }
  return { registry, registryError, registryPath, files };
}

function authorityError(code, message, path) {
  return path ? { code, message, path } : { code, message };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isConfinedRepositoryPath(path) {
  if (typeof path !== 'string'
    || path.length === 0
    || path.startsWith('/')
    || path.includes('\\')
    || path.split('/').includes('..')) return false;
  return path.startsWith('semblance-core/') || path.startsWith('semblence-representative/');
}

function validateRegistryShape(registry) {
  const errors = [];
  if (!isObject(registry)) {
    return [authorityError('REGISTRY_MALFORMED', 'Authority registry must be a JSON object')];
  }
  const allowedKeys = new Set([
    'schemaVersion',
    'registryId',
    'authorityOrder',
    'invariantPolicy',
    'approvedAdrPaths',
    'authorities',
  ]);
  for (const key of Object.keys(registry)) {
    if (!allowedKeys.has(key)) {
      errors.push(authorityError(
        'REGISTRY_MALFORMED',
        `Authority registry has unknown property ${key}`,
        key,
      ));
    }
  }
  if (registry.schemaVersion !== 1
    || typeof registry.registryId !== 'string'
    || registry.registryId.length === 0
    || !Array.isArray(registry.authorityOrder)
    || !isObject(registry.invariantPolicy)
    || !Array.isArray(registry.approvedAdrPaths)
    || !Array.isArray(registry.authorities)) {
    errors.push(authorityError('REGISTRY_MALFORMED', 'Authority registry v1 shape is invalid'));
  }
  return errors;
}

function verifyInvariantPolicy(registry, files) {
  const errors = [];
  const reference = registry.invariantPolicy;
  if (!isObject(reference)
    || !isConfinedRepositoryPath(reference.path)
    || typeof reference.sha256 !== 'string'
    || !SHA256_PATTERN.test(reference.sha256)) {
    return [authorityError(
      'INVARIANT_POLICY_REFERENCE_INVALID',
      'Invariant policy reference must have a confined path and SHA-256',
    )];
  }
  const content = files[reference.path];
  if (typeof content !== 'string') {
    return [authorityError(
      'INVARIANT_POLICY_MISSING',
      `Invariant policy is missing: ${reference.path}`,
      reference.path,
    )];
  }
  if (sha256(content) !== reference.sha256) {
    errors.push(authorityError(
      'INVARIANT_POLICY_HASH_MISMATCH',
      `Invariant policy hash does not match: ${reference.path}`,
      reference.path,
    ));
  }
  let policy;
  try {
    policy = JSON.parse(content);
  } catch {
    return [...errors, authorityError(
      'INVARIANT_POLICY_MALFORMED',
      'Invariant policy is not valid JSON',
      reference.path,
    )];
  }
  if (!isObject(policy)
    || policy.schemaVersion !== 1
    || !isObject(policy.invariants)
    || REQUIRED_INVARIANTS.some((name) => policy.invariants[name] !== true)) {
    errors.push(authorityError(
      'INVARIANT_POLICY_MALFORMED',
      'Invariant policy omits or disables a required invariant',
      reference.path,
    ));
  }
  return errors;
}

function verifyDocumentMetadata(entry, content, invariantPolicy) {
  const errors = [];
  const expectedStatus = DOCUMENT_STATUS_BY_TYPE[entry.type];
  if (!expectedStatus) return errors;
  const statusMatches = [...content.matchAll(/^\*\*Status:\*\*\s*(.+?)\s*$/gmi)];
  if (statusMatches.length !== 1 || statusMatches[0][1] !== expectedStatus) {
    errors.push(authorityError(
      'DOCUMENT_STATUS_INVALID',
      `${entry.path} must declare exactly one status: ${expectedStatus}`,
      entry.path,
    ));
  }
  const requiredReference =
    `**Invariant policy:** \`${invariantPolicy.path}\` (\`sha256:${invariantPolicy.sha256}\`)`;
  if (!content.split(/\r?\n/).includes(requiredReference)) {
    errors.push(authorityError(
      'INVARIANT_POLICY_REFERENCE_MISSING',
      `${entry.path} must reference the registered invariant policy and hash`,
      entry.path,
    ));
  }
  return errors;
}

function verifyAuthorityRegistry(workspace) {
  const errors = [];
  const canonicalPaths = [];
  const registry = workspace.registry;
  if (workspace.registryError || !isObject(registry)) {
    return {
      canonicalPaths,
      errors: [authorityError(
        'REGISTRY_MALFORMED',
        `Cannot read ${workspace.registryPath ?? REGISTRY_PATH}: `
          + (workspace.registryError ?? 'invalid JSON object'),
      )],
    };
  }
  errors.push(...validateRegistryShape(registry));
  if (errors.length > 0) return { canonicalPaths, errors };

  if (JSON.stringify(registry.authorityOrder) !== JSON.stringify(AUTHORITY_ORDER)) {
    errors.push(authorityError(
      'AUTHORITY_ORDER_INVALID',
      `authorityOrder must be ${AUTHORITY_ORDER.join(' -> ')}`,
      'authorityOrder',
    ));
  }
  errors.push(...verifyInvariantPolicy(registry, workspace.files));

  const seenPaths = new Set();
  let previousOrder = -1;
  let designCount = 0;
  let planCount = 0;
  const adrPaths = [];
  for (const [index, entry] of registry.authorities.entries()) {
    const entryPath = `authorities.${index}`;
    if (!isObject(entry)
      || !AUTHORITY_ORDER.includes(entry.type)
      || typeof entry.path !== 'string'
      || typeof entry.status !== 'string'
      || typeof entry.sha256 !== 'string'
      || !SHA256_PATTERN.test(entry.sha256)) {
      errors.push(authorityError(
        'AUTHORITY_ENTRY_MALFORMED',
        `Authority entry ${index} is malformed`,
        entryPath,
      ));
      continue;
    }
    const order = AUTHORITY_ORDER.indexOf(entry.type);
    if (order < previousOrder) {
      errors.push(authorityError(
        'AUTHORITY_ORDER_INVALID',
        `${entry.path} is outside the declared authority order`,
        entryPath,
      ));
    }
    previousOrder = Math.max(previousOrder, order);
    if (!isConfinedRepositoryPath(entry.path)) {
      errors.push(authorityError(
        'AUTHORITY_PATH_INVALID',
        `Authority path is not repository-confined: ${entry.path}`,
        entryPath,
      ));
      continue;
    }
    if (seenPaths.has(entry.path)) {
      errors.push(authorityError(
        'AUTHORITY_PATH_DUPLICATE',
        `Authority path is duplicated: ${entry.path}`,
        entryPath,
      ));
      continue;
    }
    seenPaths.add(entry.path);
    if (entry.status !== STATUS_BY_TYPE[entry.type]) {
      errors.push(authorityError(
        'AUTHORITY_STATUS_INVALID',
        `${entry.path} has invalid registered status ${entry.status}`,
        entryPath,
      ));
      continue;
    }
    const content = workspace.files[entry.path];
    if (typeof content !== 'string') {
      errors.push(authorityError(
        'AUTHORITY_PATH_MISSING',
        `Registered authority is missing: ${entry.path}`,
        entry.path,
      ));
      continue;
    }
    if (sha256(content) !== entry.sha256) {
      errors.push(authorityError(
        'AUTHORITY_HASH_MISMATCH',
        `Registered authority hash does not match: ${entry.path}`,
        entry.path,
      ));
    }
    errors.push(...verifyDocumentMetadata(entry, content, registry.invariantPolicy));
    if (entry.type === 'generated-evidence') {
      try {
        JSON.parse(content);
      } catch {
        errors.push(authorityError(
          'GENERATED_EVIDENCE_MALFORMED',
          `Generated evidence is not valid JSON: ${entry.path}`,
          entry.path,
        ));
      }
    }
    if (entry.type === 'approved-design') designCount += 1;
    if (entry.type === 'approved-plan') planCount += 1;
    if (entry.type === 'approved-adr') adrPaths.push(entry.path);
    canonicalPaths.push(entry.path);
  }
  if (designCount !== 1) {
    errors.push(authorityError(
      'DESIGN_AUTHORITY_INVALID',
      'Registry must contain exactly one approved design',
    ));
  }
  if (planCount < 1) {
    errors.push(authorityError(
      'PLAN_AUTHORITY_MISSING',
      'Registry must contain at least one exact approved plan',
    ));
  }
  if (JSON.stringify([...registry.approvedAdrPaths].sort())
    !== JSON.stringify([...adrPaths].sort())) {
    errors.push(authorityError(
      'ADR_REGISTRY_MISMATCH',
      'approvedAdrPaths must exactly match registered approved ADR entries',
      'approvedAdrPaths',
    ));
  }
  return { canonicalPaths, errors };
}

function statements(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .split(/(?:\r?\n|(?<=[.!?])\s+)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function hasPositiveStatement(documents, patterns, negations = []) {
  const paths = [];
  for (const document of documents) {
    if (statements(document.content).some(
      (statement) => patterns.some((pattern) => pattern.test(statement))
        && !negations.some((pattern) => pattern.test(statement)),
    )) paths.push(document.path);
  }
  return paths.sort();
}

function addLegacyConflict(conflicts, code, message, leftPaths, rightPaths) {
  if (leftPaths.length === 0 || rightPaths.length === 0) return;
  conflicts.push({
    code,
    message,
    paths: [...new Set([...leftPaths, ...rightPaths])].sort(),
  });
}

/**
 * Narrow defense-in-depth scan for known legacy contradiction families. This scanner is
 * deliberately not an authority parser; registration, status, hashes, and invariant-policy
 * references are the authority control.
 */
function scanLegacyContradictions(documents) {
  const conflicts = [];
  const cloudBan = hasPositiveStatement(documents, [
    /no cloud sync\.\s*no cloud backup\.\s*no remote storage/i,
    /(?:remote|cloud) synchroni[sz]ation.*(?:backup)?.*(?:forbidden|prohibited|never permitted)/i,
    /off-device backup.*(?:forbidden|prohibited|never permitted)/i,
  ], [
    /does not prohibit/i,
    /not (?:forbidden|prohibited)/i,
  ]);
  const sovereignCloud = hasPositiveStatement(documents, [
    /sovereign (?:encrypted )?(?:cloud|sync).*(?:permitted|allowed|approved)/i,
    /optional encrypted sync\/backup/i,
    /sovereign hybrid with user-controlled cloud/i,
  ], [/not (?:permitted|allowed|approved)/i]);
  const appNoDirectCommerce = hasPositiveStatement(documents, [
    /app(?:lication)? makes zero outbound (?:api )?calls/i,
    /app(?:lication)? has no direct network path to commerce/i,
    /client must not contact (?:a |the )?billing service directly/i,
  ]);
  const directCommerce = hasPositiveStatement(documents, [
    /app(?:lication)? directly calls? (?:the )?commerce/i,
    /(?:desktop )?client contacts (?:the )?billing service itself/i,
  ], [
    /does not directly call/i,
    /must not contact/i,
    /no direct network path/i,
  ]);
  const reservationOnly = hasPositiveStatement(documents, [
    /reservation jwt is reservation only and never an entitlement/i,
    /reservation artifacts?.*(?:never grants?|confer no) paid access/i,
    /waitlist reservations do not grant premium access/i,
  ]);
  const reservationEntitlement = hasPositiveStatement(documents, [
    /reservation jwt (?:grants?|activates?|is) (?:a )?(?:premium |paid )?entitlement/i,
    /founding reservation jwt grants premium/i,
    /waitlist token unlocks paid features/i,
  ], [
    /does not (?:grant|unlock)/i,
    /never grants?/i,
    /confer no/i,
  ]);
  addLegacyConflict(
    conflicts,
    'CLOUD_POLICY_CONFLICT',
    'Legacy scan found both a universal cloud ban and sovereign cloud permission.',
    cloudBan,
    sovereignCloud,
  );
  addLegacyConflict(
    conflicts,
    'APP_EGRESS_CONFLICT',
    'Legacy scan found both no direct commerce egress and direct client commerce.',
    appNoDirectCommerce,
    directCommerce,
  );
  addLegacyConflict(
    conflicts,
    'RESERVATION_ENTITLEMENT_CONFLICT',
    'Legacy scan found reservation artifacts described as both reservation and entitlement.',
    reservationOnly,
    reservationEntitlement,
  );
  return conflicts;
}

function checkStateWorkflowConsistency(content) {
  if (typeof content !== 'string') {
    return [authorityError('STATE_WORKFLOW_INVALID', 'CLAUDE.md is missing')];
  }
  const errors = [];
  const prohibited = [
    /\b(?:read|write|update|patch)\b[^\n]*SEMBLANCE_STATE\.md/i,
    /SEMBLANCE_STATE\.md[^\n]*(?:living memory|current build state|write at session end)/i,
    /scripts\/update-state\.js/i,
    /session-end[^\n]*update state/i,
  ];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (prohibited.some((pattern) => pattern.test(line))) {
      errors.push(authorityError(
        'STATE_WORKFLOW_INVALID',
        'Historical SEMBLANCE_STATE.md cannot be a current session input or write target',
        `CLAUDE.md:${index + 1}`,
      ));
    }
  }
  return errors;
}

function checkDocumentationAuthority(workspace) {
  const structural = verifyAuthorityRegistry(workspace);
  const authorityDocuments = structural.canonicalPaths
    .filter((path) => path.endsWith('.md'))
    .map((path) => ({ path, content: workspace.files[path] }))
    .filter((document) => typeof document.content === 'string');
  const claudePath = 'semblance-core/CLAUDE.md';
  if (typeof workspace.files[claudePath] === 'string') {
    authorityDocuments.push({ path: claudePath, content: workspace.files[claudePath] });
  }
  return {
    canonicalPaths: structural.canonicalPaths,
    errors: [
      ...structural.errors,
      ...checkStateWorkflowConsistency(workspace.files[claudePath]),
    ],
    legacyConflicts: scanLegacyContradictions(authorityDocuments),
  };
}

function parseArgs(argv) {
  const options = {};
  const allowed = new Set(['--core-repo', '--representative-repo', '--registry']);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${name}`);
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
  const workspace = loadAuthorityWorkspace(
    { core, representative },
    options.registry ?? REGISTRY_PATH,
  );
  const result = checkDocumentationAuthority(workspace);
  for (const violation of result.errors) {
    console.error(`${violation.code}: ${violation.message}`);
  }
  for (const conflict of result.legacyConflicts) {
    console.error(`${conflict.code}: ${conflict.message} [${conflict.paths.join(', ')}]`);
  }
  if (result.errors.length > 0 || result.legacyConflicts.length > 0) return 1;
  console.log(`Documentation authority registry verified: ${workspace.registry.registryId}`);
  console.log(`Invariant policy verified: ${workspace.registry.invariantPolicy.path}`);
  return 0;
}

module.exports = {
  checkDocumentationAuthority,
  checkStateWorkflowConsistency,
  collectRepositoryFiles,
  collectRepositoryMarkdown,
  loadAuthorityWorkspace,
  scanLegacyContradictions,
  verifyAuthorityRegistry,
};

if (require.main === module) process.exitCode = runCli();
