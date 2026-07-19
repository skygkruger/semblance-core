import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { ExtensionTrustChecker } from './publisher-policy.js';
import type { ExtensionOwnership } from './revocation.js';
import {
  emptyPermissionBundle,
  extractRequestedPermissions,
  narrowGrantedPermissions,
  permissionBundleFromInput,
  validateExplicitInstallGrant,
  type ExtensionPermissionBundle,
} from './permissions.js';

export const EXTENSION_INSTALL_SCHEMA_VERSION = 1 as const;

export interface InstalledExtensionRecord {
  readonly manifestId: string;
  readonly publisher: string;
  readonly version: string;
  readonly manifestPath: string;
  readonly artifactPath: string;
  readonly installDir: string;
  readonly installedAt: string;
  readonly revoked: boolean;
  readonly enabled: boolean;
  readonly ownership: ExtensionOwnership;
  readonly requestedPermissions: ExtensionPermissionBundle;
  readonly grantedPermissions: ExtensionPermissionBundle;
  readonly migrationUninstall: 'delete' | 'retain_user_data' | 'ask';
}

export interface ExtensionInstallDocument {
  readonly schemaVersion: typeof EXTENSION_INSTALL_SCHEMA_VERSION;
  readonly extensions: readonly InstalledExtensionRecord[];
  readonly updatedAt: string;
}

export interface AvailableExtensionSummary {
  readonly manifestId: string;
  readonly publisher: string;
  readonly version: string;
  readonly manifestPath: string;
  readonly artifactPath: string;
  readonly requestedPermissions: ExtensionPermissionBundle;
}

export interface InstallExtensionInput {
  readonly manifestPath: string;
  readonly artifactPath?: string;
  readonly grantedPermissions: ExtensionPermissionBundle;
  readonly ownership?: ExtensionOwnership;
  readonly trustChecker: ExtensionTrustChecker;
  readonly coreVersion?: string;
  readonly installsRoot: string;
  readonly catalogRoot: string;
}

export interface InstallExtensionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly extension?: InstalledExtensionRecord;
}

function normalizeRecord(input: unknown): InstalledExtensionRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Partial<InstalledExtensionRecord>;
  const requested = permissionBundleFromInput(record.requestedPermissions);
  const granted = permissionBundleFromInput(record.grantedPermissions);
  if (
    typeof record.manifestId !== 'string'
    || record.manifestId.length === 0
    || typeof record.publisher !== 'string'
    || typeof record.version !== 'string'
    || typeof record.manifestPath !== 'string'
    || typeof record.artifactPath !== 'string'
    || typeof record.installDir !== 'string'
    || typeof record.installedAt !== 'string'
    || typeof record.revoked !== 'boolean'
    || typeof record.enabled !== 'boolean'
    || !requested
    || !granted
    || (record.migrationUninstall !== 'delete'
      && record.migrationUninstall !== 'retain_user_data'
      && record.migrationUninstall !== 'ask')
  ) {
    return null;
  }
  const ownership = record.ownership ?? 'marketplace';
  if (ownership !== 'marketplace' && ownership !== 'user-local') {
    return null;
  }
  return {
    manifestId: record.manifestId,
    publisher: record.publisher,
    version: record.version,
    manifestPath: record.manifestPath,
    artifactPath: record.artifactPath,
    installDir: record.installDir,
    installedAt: record.installedAt,
    revoked: record.revoked,
    enabled: record.enabled,
    ownership,
    requestedPermissions: requested,
    grantedPermissions: granted,
    migrationUninstall: record.migrationUninstall,
  };
}

export function createDefaultExtensionInstallDocument(now = new Date()): ExtensionInstallDocument {
  return {
    schemaVersion: EXTENSION_INSTALL_SCHEMA_VERSION,
    extensions: [],
    updatedAt: now.toISOString(),
  };
}

export function normalizeExtensionInstallDocument(input: unknown, now = new Date()): ExtensionInstallDocument {
  const defaults = createDefaultExtensionInstallDocument(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }
  const record = input as Partial<ExtensionInstallDocument>;
  const extensions = Array.isArray(record.extensions)
    ? record.extensions
        .map((entry) => normalizeRecord(entry))
        .filter((entry): entry is InstalledExtensionRecord => entry !== null)
    : [];
  return {
    schemaVersion: EXTENSION_INSTALL_SCHEMA_VERSION,
    extensions,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now.toISOString(),
  };
}

export function loadExtensionInstallDocument(filePath: string): ExtensionInstallDocument {
  if (!existsSync(filePath)) {
    return createDefaultExtensionInstallDocument();
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeExtensionInstallDocument(parsed);
  } catch {
    return createDefaultExtensionInstallDocument();
  }
}

export function saveExtensionInstallDocument(
  filePath: string,
  document: ExtensionInstallDocument,
): ExtensionInstallDocument {
  const normalized = normalizeExtensionInstallDocument(document);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

function resolveArtifactPath(manifestPath: string, artifactPath?: string): string {
  if (artifactPath) {
    return resolve(artifactPath);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    artifactRelativePath?: string;
  };
  if (!manifest.artifactRelativePath) {
    throw new Error('Manifest missing artifactRelativePath');
  }
  return join(dirname(resolve(manifestPath)), manifest.artifactRelativePath);
}

function readMigrationPolicy(manifest: unknown): 'delete' | 'retain_user_data' | 'ask' {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return 'ask';
  }
  const migration = (manifest as Record<string, unknown>).migration;
  if (migration && typeof migration === 'object' && !Array.isArray(migration)) {
    const uninstall = (migration as Record<string, unknown>).uninstall;
    if (uninstall === 'delete' || uninstall === 'retain_user_data' || uninstall === 'ask') {
      return uninstall;
    }
  }
  return 'ask';
}

function readManifestIdentity(manifest: unknown): { id: string; publisher: string; version: string } {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid manifest');
  }
  const record = manifest as Record<string, unknown>;
  if (
    typeof record.id !== 'string'
    || record.id.length === 0
    || typeof record.version !== 'string'
  ) {
    throw new Error('Manifest missing id or version');
  }
  const publisher =
    typeof record.publisher === 'string' && record.publisher.length > 0
      ? record.publisher
      : 'unknown';
  return { id: record.id, publisher, version: record.version };
}

export class ExtensionInstallStore {
  private document: ExtensionInstallDocument;
  private readonly filePath: string;
  private readonly installsRoot: string;
  private readonly catalogRoot: string;

  constructor(filePath: string, installsRoot: string, catalogRoot: string, initial?: ExtensionInstallDocument) {
    this.filePath = filePath;
    this.installsRoot = installsRoot;
    this.catalogRoot = catalogRoot;
    this.document = normalizeExtensionInstallDocument(initial ?? loadExtensionInstallDocument(filePath));
    mkdirSync(this.installsRoot, { recursive: true });
    mkdirSync(this.catalogRoot, { recursive: true });
  }

  getDocument(): ExtensionInstallDocument {
    return this.document;
  }

  listInstalled(): readonly InstalledExtensionRecord[] {
    return this.document.extensions;
  }

  get(manifestId: string): InstalledExtensionRecord | undefined {
    return this.document.extensions.find((entry) => entry.manifestId === manifestId);
  }

  listAvailable(): AvailableExtensionSummary[] {
    if (!existsSync(this.catalogRoot)) {
      return [];
    }
    const entries: AvailableExtensionSummary[] = [];
    for (const fileName of readdirSync(this.catalogRoot)) {
      if (!fileName.endsWith('.json')) {
        continue;
      }
      const manifestPath = join(this.catalogRoot, fileName);
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
        const identity = readManifestIdentity(manifest);
        if (this.get(identity.id)) {
          continue;
        }
        entries.push({
          manifestId: identity.id,
          publisher: identity.publisher,
          version: identity.version,
          manifestPath,
          artifactPath: resolveArtifactPath(manifestPath),
          requestedPermissions: extractRequestedPermissions(manifest),
        });
      } catch {
        // Skip malformed catalog entries
      }
    }
    return entries;
  }

  inspect(manifestId: string): InstalledExtensionRecord | AvailableExtensionSummary | null {
    const installed = this.get(manifestId);
    if (installed) {
      return installed;
    }
    return this.listAvailable().find((entry) => entry.manifestId === manifestId) ?? null;
  }

  install(input: InstallExtensionInput): InstallExtensionResult {
    const manifestPath = resolve(input.manifestPath);
    if (!existsSync(manifestPath)) {
      return { success: false, error: `Manifest not found: ${manifestPath}` };
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    const identity = readManifestIdentity(manifest);
    if (this.get(identity.id)) {
      return { success: false, error: `Extension '${identity.id}' is already installed` };
    }

    const requested = extractRequestedPermissions(manifest);
    const grantValidation = validateExplicitInstallGrant(requested, input.grantedPermissions);
    if (!grantValidation.ok) {
      return { success: false, error: grantValidation.error };
    }

    let artifactPath: string;
    try {
      artifactPath = resolveArtifactPath(manifestPath, input.artifactPath);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to resolve artifact path',
      };
    }
    if (!existsSync(artifactPath)) {
      return { success: false, error: `Artifact not found: ${artifactPath}` };
    }

    const artifactBytes = readFileSync(artifactPath);
    const trust = input.trustChecker.checkTrust({
      manifest,
      artifactBytes,
      coreVersion: input.coreVersion ?? '1.0.0',
      ownership: input.ownership ?? 'marketplace',
    });
    if (!trust.allowed) {
      return { success: false, error: trust.reason ?? 'Publisher trust verification failed' };
    }

    const installDir = join(input.installsRoot, identity.id);
    mkdirSync(installDir, { recursive: true });
    const installedManifestPath = join(installDir, basename(manifestPath));
    const installedArtifactPath = join(installDir, basename(artifactPath));
    copyFileSync(manifestPath, installedManifestPath);
    copyFileSync(artifactPath, installedArtifactPath);

    const record: InstalledExtensionRecord = {
      manifestId: identity.id,
      publisher: identity.publisher,
      version: identity.version,
      manifestPath: installedManifestPath,
      artifactPath: installedArtifactPath,
      installDir,
      installedAt: new Date().toISOString(),
      revoked: false,
      enabled: true,
      ownership: input.ownership ?? 'marketplace',
      requestedPermissions: requested,
      grantedPermissions: input.grantedPermissions,
      migrationUninstall: readMigrationPolicy(manifest),
    };

    this.document = normalizeExtensionInstallDocument({
      ...this.document,
      extensions: [...this.document.extensions, record],
      updatedAt: new Date().toISOString(),
    });
    saveExtensionInstallDocument(this.filePath, this.document);
    return { success: true, extension: record };
  }

  setPermissions(
    manifestId: string,
    grantedPermissions: ExtensionPermissionBundle,
  ): InstallExtensionResult {
    const existing = this.get(manifestId);
    if (!existing) {
      return { success: false, error: `Extension '${manifestId}' is not installed` };
    }
    if (existing.revoked) {
      return { success: false, error: `Extension '${manifestId}' is revoked` };
    }

    const validation = narrowGrantedPermissions(
      existing.grantedPermissions,
      grantedPermissions,
      existing.requestedPermissions,
    );
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }

    const updated: InstalledExtensionRecord = {
      ...existing,
      grantedPermissions,
    };
    this.document = normalizeExtensionInstallDocument({
      ...this.document,
      extensions: this.document.extensions.map((entry) =>
        entry.manifestId === manifestId ? updated : entry,
      ),
      updatedAt: new Date().toISOString(),
    });
    saveExtensionInstallDocument(this.filePath, this.document);
    return { success: true, extension: updated };
  }

  revoke(manifestId: string): InstallExtensionResult {
    const existing = this.get(manifestId);
    if (!existing) {
      return { success: false, error: `Extension '${manifestId}' is not installed` };
    }
    const updated: InstalledExtensionRecord = {
      ...existing,
      revoked: true,
      enabled: false,
      grantedPermissions: emptyPermissionBundle(),
    };
    this.document = normalizeExtensionInstallDocument({
      ...this.document,
      extensions: this.document.extensions.map((entry) =>
        entry.manifestId === manifestId ? updated : entry,
      ),
      updatedAt: new Date().toISOString(),
    });
    saveExtensionInstallDocument(this.filePath, this.document);
    return { success: true, extension: updated };
  }

  uninstall(manifestId: string, retainUserData = false): InstallExtensionResult {
    const existing = this.get(manifestId);
    if (!existing) {
      return { success: false, error: `Extension '${manifestId}' is not installed` };
    }

    const shouldDeleteData =
      existing.migrationUninstall === 'delete'
      || (existing.migrationUninstall === 'ask' && !retainUserData);

    if (shouldDeleteData && existsSync(existing.installDir)) {
      rmSync(existing.installDir, { recursive: true, force: true });
    }

    this.document = normalizeExtensionInstallDocument({
      ...this.document,
      extensions: this.document.extensions.filter((entry) => entry.manifestId !== manifestId),
      updatedAt: new Date().toISOString(),
    });
    saveExtensionInstallDocument(this.filePath, this.document);
    return { success: true };
  }
}

export function createExtensionInstallStore(
  dataDir: string,
  fileName = 'extension-installs.json',
): ExtensionInstallStore {
  const installsRoot = join(dataDir, 'extensions', 'installed');
  const catalogRoot = join(dataDir, 'extensions', 'catalog');
  const filePath = join(dataDir, fileName);
  return new ExtensionInstallStore(filePath, installsRoot, catalogRoot);
}
