# Step 18 — Cloud Storage Sync (Google Drive)

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Steps 1–17 complete. Step 17 delivered Voice Interaction with 65 new tests. Sprint 4 continues — "Becomes Part of You." This step adds cloud storage sync: Google Drive files pulled locally, indexed into the knowledge graph, and searchable via semantic search. "Find the Q3 report" works whether the file is local or synced from Google Drive. Sync is pull-only — Semblance never modifies, uploads, or deletes cloud files.
**Test Baseline:** 3,021 tests passing across ~200 files. Privacy audit clean. TypeScript compilation clean (`npx tsc --noEmit` → EXIT_CODE=0).
**Architecture Note:** This is the first step where the Gateway does most of the heavy lifting. The Gateway handles OAuth, API calls, and file downloads. The Core handles sync orchestration, file indexing, and embedding. The boundary is strict: Core sends typed IPC actions, Gateway executes them. Core never touches the network.
**Rule:** ZERO stubs, ZERO placeholders, ZERO deferrals. Every deliverable ships production-ready. Platform-deferred adapters are acceptable with functional mocks and honest TODO labels.

---

## Read First

Before writing any code, read these files:

- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules, IPC protocol
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/core/platform/types.ts` — PlatformAdapter interface
- `packages/core/types/ipc.ts` — ActionType enum + payload schemas (you will add cloud storage actions)
- `packages/core/agent/ipc-client.ts` — IPCClient for Core → Gateway communication
- `packages/core/agent/orchestrator.ts` — Where cloud storage queries are handled
- `packages/core/knowledge/file-indexer.ts` — Existing file indexer (synced files feed into this)
- `packages/core/knowledge/embedding-pipeline.ts` — Embedding pipeline for semantic search
- `packages/core/agent/types.ts` — AutonomyDomain union
- `packages/core/agent/autonomy.ts` — ACTION_DOMAIN_MAP + ACTION_RISK_MAP
- `packages/gateway/services/` — Existing service adapter pattern (email, calendar)
- `packages/gateway/security/credential-store.ts` — Where OAuth tokens are stored
- `packages/gateway/security/allowlist.ts` — Domain allowlist configuration
- `tests/privacy/location-privacy.test.ts` — Privacy test scanning pattern

---

## Why This Step Matters — The Moat Argument

Most people's important documents live in Google Drive. Work reports, contracts, shared spreadsheets, tax documents, personal records. When they ask ChatGPT about "the Q3 report" or "that contract Sarah sent," ChatGPT has no idea what they're talking about. It has zero access to their files.

Semblance can pull those files locally, index them into the knowledge graph, and make them searchable alongside emails, calendar events, and every other data source. "Find the Q3 report" returns the actual document with relevant context — when it was last modified, who shared it, what emails reference it. Compound knowledge across data sources.

The critical architectural distinction: Semblance pulls files locally and processes them on-device. The files live on the user's machine. The embeddings are local. The semantic search is local. Google Drive is a data SOURCE, not a data STORE. If the user disconnects Google Drive, the local copies and embeddings remain — their knowledge graph doesn't lose information.

This also establishes the cloud storage adapter pattern. Dropbox, OneDrive, iCloud Drive — they all follow the same interface. Google Drive first, others follow.

**Privacy guarantee:** OAuth tokens are stored encrypted in the credential store (Gateway-side, same as email/calendar). Every API call to Google Drive goes through the Gateway with full audit trail visibility in Network Monitor. The user sees exactly what Semblance is accessing in their Drive. Pull-only means Semblance can never delete, modify, or share the user's cloud files.

---

## Scope Overview

| Section | Description | Test Target |
|---------|-------------|-------------|
| A | CloudStorageAdapter interface + IPC ActionTypes | 6+ |
| B | Gateway: Google Drive Service Adapter + OAuth | 12+ |
| C | Core: Sync Orchestrator + File Index Integration | 12+ |
| D | Selective Sync + Storage Management | 8+ |
| E | Autonomy + Orchestrator Wiring | 6+ |
| F | UI: Settings, Folder Picker, Storage Indicator | 8+ |
| G | Privacy Audit + Integration Tests | 8+ |

**Minimum 60 new tests. Target 65+.**

---

## Section A: CloudStorageAdapter Interface + IPC ActionTypes

### A1: CloudStorageAdapter Interface

Create `packages/core/platform/cloud-storage-types.ts`:

```typescript
/**
 * CloudStorageAdapter abstracts cloud storage providers.
 * Google Drive first. Same interface for Dropbox, OneDrive later.
 *
 * The adapter lives in Core conceptually but ALL network operations
 * go through the Gateway via IPC. The adapter methods map to
 * IPC actions: cloud.auth, cloud.list, cloud.download, cloud.metadata.
 *
 * The Core side orchestrates WHAT to sync.
 * The Gateway side handles HOW to sync (OAuth, API calls, downloads).
 */

export interface CloudStorageAdapter {
  /** Provider identifier */
  readonly provider: CloudStorageProvider;

  /** Check if user has authenticated with this provider */
  isAuthenticated(): Promise<boolean>;

  /** Initiate OAuth flow. Opens browser/webview for user consent. */
  authenticate(): Promise<AuthResult>;

  /** Disconnect from this provider. Revokes token. */
  disconnect(): Promise<void>;

  /** List files/folders at a path. Returns paginated results. */
  listFiles(options: ListFilesOptions): Promise<ListFilesResult>;

  /** Get metadata for a specific file (without downloading content) */
  getFileMetadata(fileId: string): Promise<CloudFileMetadata>;

  /** Download a file's content to local storage */
  downloadFile(fileId: string, localPath: string): Promise<DownloadResult>;

  /** Check if a file has been modified since last sync */
  hasFileChanged(fileId: string, lastSyncTimestamp: number): Promise<boolean>;
}

export type CloudStorageProvider = 'google-drive' | 'dropbox' | 'onedrive';

export interface AuthResult {
  success: boolean;
  provider: CloudStorageProvider;
  userEmail?: string;
  error?: string;
}

export interface ListFilesOptions {
  folderId?: string;
  pageToken?: string;
  pageSize?: number; // Default: 100
  mimeTypes?: string[];
  modifiedAfter?: number; // Unix ms
}

export interface ListFilesResult {
  files: CloudFileMetadata[];
  nextPageToken?: string;
  totalCount?: number;
}

export interface CloudFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedTime: number; // Unix ms
  createdTime?: number;
  path: string; // Full path from root
  parentId?: string;
  isFolder: boolean;
  webViewLink?: string;
  owners?: string[];
  shared: boolean;
  md5Checksum?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath: string;
  sizeBytes: number;
  mimeType: string;
  durationMs: number;
  error?: string;
}
```

### A2: IPC ActionTypes

Add to `packages/core/types/ipc.ts`:

```typescript
// New ActionTypes for cloud storage
'cloud.auth'              // Initiate OAuth flow
'cloud.auth_status'       // Check authentication status
'cloud.disconnect'        // Revoke OAuth token
'cloud.list_files'        // List files in a folder
'cloud.file_metadata'     // Get single file metadata
'cloud.download_file'     // Download file to local storage
'cloud.check_changed'     // Check if file has changed since last sync
```

Add corresponding payload schemas and ActionPayloadMap entries for each.

### A3: Core-Side CloudStorageClient

Create `packages/core/cloud-storage/cloud-storage-client.ts`:

```typescript
/**
 * Core-side client that implements CloudStorageAdapter by
 * delegating all operations to the Gateway via IPCClient.
 *
 * Pattern: same as web-intelligence.ts using IPCClient.
 * CRITICAL: No network imports. No Gateway imports. Only IPCClient.
 */
export class CloudStorageClient implements CloudStorageAdapter {
  constructor(
    private ipcClient: IPCClient,
    public readonly provider: CloudStorageProvider
  ) {}
  // All methods delegate to ipcClient.sendAction('cloud.*', payload)
}
```

**Tests (6+):** `tests/core/cloud-storage/cloud-storage-client.test.ts`
- `listFiles()` sends correct IPC action with payload
- `downloadFile()` sends correct IPC action with file ID and local path
- `authenticate()` sends `cloud.auth` action
- `isAuthenticated()` sends `cloud.auth_status` action
- `hasFileChanged()` sends correct action with timestamp
- `disconnect()` sends `cloud.disconnect` action

---

## Section B: Gateway — Google Drive Service Adapter + OAuth

### B1: Google Drive Gateway Adapter

Create `packages/gateway/services/google-drive-adapter.ts`:

```typescript
/**
 * Gateway-side Google Drive adapter.
 * Handles all network communication with Google Drive API.
 *
 * OAuth flow:
 * 1. Core sends 'cloud.auth' action
 * 2. Gateway opens authorization URL in system browser
 * 3. User grants permission on Google's consent screen
 * 4. Google redirects to localhost callback with auth code
 * 5. Gateway exchanges auth code for access + refresh tokens
 * 6. Tokens stored encrypted in credential store
 * 7. Refresh token used to get new access tokens as needed
 *
 * Scopes: https://www.googleapis.com/auth/drive.readonly ONLY
 * CRITICAL: Only drive.readonly scope. Never full 'drive' scope.
 * Pull-only architecture enforced at OAuth scope level.
 *
 * Google Workspace document export:
 * - Google Docs → exported as .docx
 * - Google Sheets → exported as .csv
 * - Google Slides → exported as .pdf
 * - Other files → downloaded as-is
 */
export class GoogleDriveAdapter {
  constructor(
    private credentialStore: CredentialStore,
    private auditTrail: AuditTrail,
    private rateLimiter: RateLimiter
  ) {}

  async authorize(): Promise<AuthResult>;
  async checkAuthStatus(): Promise<boolean>;
  async revokeAccess(): Promise<void>;
  async listFiles(options: ListFilesOptions): Promise<ListFilesResult>;
  async getFileMetadata(fileId: string): Promise<CloudFileMetadata>;
  async downloadFile(fileId: string, localPath: string): Promise<DownloadResult>;
  async hasFileChanged(fileId: string, lastSyncTimestamp: number): Promise<boolean>;
}
```

### B2: OAuth Token Manager

Create `packages/gateway/services/oauth-token-manager.ts`:

```typescript
/**
 * Manages OAuth 2.0 token lifecycle for cloud storage providers.
 * Tokens stored encrypted in credential store.
 * Key format: 'oauth:{provider}:access_token', 'oauth:{provider}:refresh_token'
 * Reusable for Dropbox/OneDrive — same OAuth 2.0 pattern, different endpoints.
 */
export class OAuthTokenManager {
  constructor(private credentialStore: CredentialStore) {}

  async storeTokens(provider: CloudStorageProvider, tokens: OAuthTokens): Promise<void>;
  async getAccessToken(provider: CloudStorageProvider): Promise<string | null>;
  async getRefreshToken(provider: CloudStorageProvider): Promise<string | null>;
  async isTokenExpired(provider: CloudStorageProvider): Promise<boolean>;
  async refreshAccessToken(provider: CloudStorageProvider): Promise<string>;
  async revokeTokens(provider: CloudStorageProvider): Promise<void>;
  async hasValidTokens(provider: CloudStorageProvider): Promise<boolean>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}
```

### B3: OAuth Callback Server

Create `packages/gateway/services/oauth-callback-server.ts`:

```typescript
/**
 * Temporary local HTTP server for OAuth redirect callback.
 *
 * Security:
 * - Binds to localhost only (127.0.0.1)
 * - Only accepts requests to /callback path
 * - Validates 'state' parameter to prevent CSRF
 * - Shuts down after first valid callback or after timeout (2 minutes)
 * - NOT a persistent server — lives for OAuth flow duration only
 */
export class OAuthCallbackServer {
  constructor(private options?: { port?: number; timeoutMs?: number }) {}

  async start(): Promise<{ callbackUrl: string; state: string }>;
  async waitForCallback(): Promise<string>;
  async stop(): Promise<void>;
}
```

### B4: Gateway Action Router Extension

Modify Gateway action router to handle `cloud.*` action types → GoogleDriveAdapter. Follow existing pattern for `email.*` and `calendar.*` actions.

**Tests (12+):** `tests/gateway/google-drive-adapter.test.ts` (6) + `tests/gateway/oauth-token-manager.test.ts` (4) + `tests/gateway/oauth-callback-server.test.ts` (2)
- OAuth token storage and retrieval from credential store
- Token refresh when expired
- Token revocation clears credential store
- `hasValidTokens` returns false when no tokens
- `listFiles` returns CloudFileMetadata array with correct types
- `listFiles` pagination: passes pageToken, returns nextPageToken
- `downloadFile` writes to specified local path
- Google Doc → exported as .docx (MIME type mapping)
- Google Sheet → exported as .csv
- Rate limiter enforces limits
- Callback server binds to localhost only
- Callback server validates state parameter (CSRF protection)

---

## Section C: Core — Sync Orchestrator + File Index Integration

### C1: SyncState Store

Create `packages/core/cloud-storage/sync-state-store.ts`:

```typescript
/**
 * Tracks sync state for cloud storage files.
 * SQLite table: cloud_sync_state
 *
 * Answers:
 * - "What files have I synced from Google Drive?"
 * - "Which files have changed since last sync?"
 * - "Which synced files haven't been indexed yet?"
 * - "How much storage are synced files using?"
 */
export class SyncStateStore {
  constructor(private db: Database) {}

  async recordSync(entry: SyncStateEntry): Promise<void>;
  async getSyncedFiles(provider: CloudStorageProvider): Promise<SyncStateEntry[]>;
  async getFileByCloudId(provider: CloudStorageProvider, fileId: string): Promise<SyncStateEntry | null>;
  async updateSyncStatus(id: string, status: SyncStatus): Promise<void>;
  async markIndexed(id: string): Promise<void>;
  async getUnindexedFiles(): Promise<SyncStateEntry[]>;
  async getStorageUsage(provider: CloudStorageProvider): Promise<StorageUsage>;
  async deleteSyncRecord(id: string): Promise<void>;
  async clearProvider(provider: CloudStorageProvider): Promise<void>;
}

export interface SyncStateEntry {
  id: string;
  provider: CloudStorageProvider;
  fileId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  cloudModifiedTime: number;
  localPath: string;
  lastSyncedAt: number;
  md5Checksum?: string;
  syncStatus: SyncStatus;
  indexed: boolean;
}

export type SyncStatus = 'synced' | 'pending' | 'error' | 'deleted';

export interface StorageUsage {
  totalBytes: number;
  fileCount: number;
  indexedCount: number;
  pendingCount: number;
}
```

### C2: SyncOrchestrator

Create `packages/core/cloud-storage/sync-orchestrator.ts`:

```typescript
/**
 * Orchestrates the cloud storage sync process.
 *
 * Sync flow:
 * 1. Get list of selected sync folders
 * 2. List files via CloudStorageClient (IPC → Gateway → Google Drive API)
 * 3. Compare with sync state to find new/modified files
 * 4. Download new/modified files to local sync directory
 * 5. Feed into existing file indexer + embedding pipeline
 * 6. Update sync state store
 *
 * Sync modes:
 * - Full sync: re-check all files (first connect or manual trigger)
 * - Incremental sync: only files modified after last sync
 * - Periodic sync: auto every N minutes (default 30)
 *
 * File type handling:
 * - PDF, DOCX, TXT, MD, CSV → index directly
 * - Google Docs → exported as DOCX, then indexed
 * - Google Sheets → exported as CSV, then indexed
 * - Google Slides → exported as PDF, then indexed
 * - Images, videos, executables → skip
 *
 * CRITICAL: Sync is PULL-ONLY.
 * There are NO cloud.upload, cloud.delete, cloud.modify actions.
 * Enforced at the IPC type level — impossible, not just disallowed.
 */
export class SyncOrchestrator {
  constructor(
    private storageClient: CloudStorageClient,
    private syncStateStore: SyncStateStore,
    private fileIndexer: FileIndexer,
    private embeddingPipeline: EmbeddingPipeline,
    private config: SyncConfig
  ) {}

  async fullSync(): Promise<SyncResult>;
  async incrementalSync(): Promise<SyncResult>;
  async syncFile(fileId: string): Promise<SyncFileResult>;
  async removeSyncedFiles(provider: CloudStorageProvider): Promise<void>;
  async getSyncStatus(): Promise<SyncStatusSummary>;
  startPeriodicSync(): void;
  stopPeriodicSync(): void;
}

export interface SyncConfig {
  provider: CloudStorageProvider;
  selectedFolders: SelectedFolder[];
  syncIntervalMinutes: number; // Default: 30
  maxFileSizeMB: number; // Default: 50
  indexableTypes: string[];
  localSyncDir: string;
}

export interface SelectedFolder {
  folderId: string;
  folderPath: string;
  includeSubfolders: boolean;
}

export interface SyncResult {
  filesDownloaded: number;
  filesIndexed: number;
  filesSkipped: number;
  filesErrored: number;
  bytesDownloaded: number;
  durationMs: number;
  errors: SyncError[];
}

export interface SyncFileResult {
  success: boolean;
  indexed: boolean;
  error?: string;
}

export interface SyncError {
  fileId: string;
  fileName: string;
  error: string;
}

export interface SyncStatusSummary {
  provider: CloudStorageProvider;
  authenticated: boolean;
  lastSyncAt: number | null;
  totalFilesSynced: number;
  totalStorageBytes: number;
  pendingFiles: number;
  selectedFolders: SelectedFolder[];
  nextSyncAt: number | null;
}
```

### C3: File Indexer Integration

Modify `packages/core/knowledge/file-indexer.ts`:
- Add optional `source?: string` to the file indexing method
- Tag cloud-synced files with `'cloud-sync:google-drive'`
- Semantic search returns results from both local and cloud-synced sources transparently

**Tests (12+):** `tests/core/cloud-storage/sync-state-store.test.ts` (5) + `tests/core/cloud-storage/sync-orchestrator.test.ts` (5) + `tests/core/cloud-storage/file-indexer-integration.test.ts` (2)
- SyncStateStore: record entry, retrieve by cloud ID
- SyncStateStore: update sync status
- SyncStateStore: getUnindexedFiles returns only unindexed
- SyncStateStore: getStorageUsage correct totals
- SyncStateStore: clearProvider removes all entries
- SyncOrchestrator: full sync lists, downloads, indexes
- SyncOrchestrator: incremental sync only downloads modified
- SyncOrchestrator: skips files exceeding maxFileSizeMB
- SyncOrchestrator: skips non-indexable MIME types
- SyncOrchestrator: handles download errors gracefully
- File indexer tags synced files with cloud-sync source
- Semantic search returns results from both local and cloud-synced files

---

## Section D: Selective Sync + Storage Management

### D1: Folder Selection

Create `packages/core/cloud-storage/folder-selector.ts`:

```typescript
/**
 * Manages user's selection of which cloud folders to sync.
 * SQLite table: cloud_sync_config
 */
export class FolderSelector {
  constructor(private db: Database, private storageClient: CloudStorageClient) {}

  async getSelectedFolders(provider: CloudStorageProvider): Promise<SelectedFolder[]>;
  async addFolder(provider: CloudStorageProvider, folder: SelectedFolder): Promise<void>;
  async removeFolder(provider: CloudStorageProvider, folderId: string): Promise<void>;
  async browseFolders(provider: CloudStorageProvider, parentId?: string): Promise<CloudFileMetadata[]>;
}
```

### D2: Storage Manager

Create `packages/core/cloud-storage/storage-manager.ts`:

```typescript
/**
 * Manages local storage for synced cloud files.
 *
 * Local sync directory:
 * {userData}/cloud-sync/google-drive/{relative-path}
 */
export class StorageManager {
  constructor(private syncStateStore: SyncStateStore, private localSyncDir: string) {}

  async getStorageUsage(provider: CloudStorageProvider): Promise<StorageUsage>;
  async getTotalStorageUsage(): Promise<StorageUsage>;
  async isWithinBudget(additionalBytes: number, budgetBytes: number): Promise<boolean>;
  async cleanupProvider(provider: CloudStorageProvider): Promise<number>;
  async cleanupFolder(provider: CloudStorageProvider, folderId: string): Promise<number>;
  async purgeOrphans(): Promise<number>;
  getLocalPath(provider: CloudStorageProvider, cloudPath: string): string;
}
```

**Tests (8+):** `tests/core/cloud-storage/folder-selector.test.ts` (4) + `tests/core/cloud-storage/storage-manager.test.ts` (4)
- Add folder, retrieve it
- Remove folder
- Browse folders returns list from cloud
- Selected folders persist across instances
- Storage usage calculation correct
- Budget check: within → true; exceeds → false
- Cleanup provider removes files and sync state
- `getLocalPath` mirrors cloud path structure

---

## Section E: Autonomy + Orchestrator Wiring

### E1: Autonomy Domain Extension

Add `'cloud-storage'` domain. **ALL updates in the SAME commit:**

1. Add `'cloud-storage'` to `AutonomyDomain` union in `packages/core/agent/types.ts`
2. Update `ACTION_DOMAIN_MAP`: all 7 `cloud.*` actions → `'cloud-storage'`
3. Update `ACTION_RISK_MAP`:
   - `cloud.auth` → `'write'` (grants access — requires approval)
   - `cloud.disconnect` → `'write'` (revokes access)
   - All others → `'read'` (pull-only operations)
4. Update `getConfig()` domains array
5. Add time-saved defaults: `cloud.download_file` → 60, `cloud.list_files` → 15, others → 5

### E2: Orchestrator Integration

Add `search_cloud_files` tool to Orchestrator:
- User asks "Find the Q3 report" → searches sync state + semantic search across synced file embeddings
- Add to TOOLS array, TOOL_ACTION_MAP, processToolCalls handler

### E3: Network Monitor

All cloud operations already visible via Gateway audit trail entries. Ensure entries have clear descriptions ("Google Drive: Downloaded Q3_Report.pdf (2.4 MB)").

**Tests (6+):** `tests/core/cloud-storage/cloud-storage-autonomy.test.ts` (3) + `tests/core/cloud-storage/orchestrator-integration.test.ts` (3)
- `getConfig()` includes 'cloud-storage' domain
- ACTION_DOMAIN_MAP includes all cloud action types
- `cloud.auth` classified as 'write', `cloud.list_files` as 'read'
- Orchestrator `search_cloud_files` returns synced file results
- Orchestrator returns metadata with results
- Orchestrator handles no-results gracefully

---

## Section F: UI — Settings, Folder Picker, Storage Indicator

### F1: Cloud Storage Settings

Create `packages/desktop/src/components/CloudStorageSettingsSection.tsx`:
- Provider card: Google Drive (Dropbox/OneDrive greyed-out "Coming Soon")
- Connection status + connect/disconnect button
- Selected folders list + [Add Folder] button
- Storage usage bar
- Sync interval dropdown (15/30/60 min, manual)
- Last synced + [Sync Now] button
- Max file size dropdown (10/25/50/100 MB)

### F2: Folder Picker Modal

Create `packages/desktop/src/components/CloudFolderPicker.tsx`:
- Tree view with lazy-loaded folder expansion
- Checkbox selection per folder
- Include subfolders toggle
- File count and size preview

### F3: Mobile Settings

Create `packages/mobile/src/screens/CloudStorageSettingsScreen.tsx`:
- Simplified list view folder picker
- Storage usage visible

### F4: AppState Extension

Modify `packages/desktop/src/state/AppState.tsx`:
- Add `cloudStorageSettings` with per-provider config
- Add `SET_CLOUD_STORAGE_SETTINGS` action + reducer
- Initial: not connected, empty folders, 30 min interval, 50MB max file, 5GB budget

**Tests (8+):** `tests/desktop/cloud-storage-settings.test.ts` (4) + `tests/desktop/cloud-folder-picker.test.ts` (2) + `tests/core/cloud-storage/cloud-storage-settings-state.test.ts` (2)
- Settings section renders connection status
- Connect button triggers OAuth flow
- Disconnect removes synced files and clears state
- Storage usage bar renders correctly
- Folder picker renders folder tree
- Folder picker selection persists
- AppState initial settings correct
- Reducer updates state

---

## Section G: Privacy Audit + Integration Tests

### G1: Privacy Test Suite

Create `tests/privacy/cloud-storage-privacy.test.ts`:
- Zero network imports in `packages/core/cloud-storage/`
- Zero Gateway imports in `packages/core/cloud-storage/`
- Core uses only IPCClient for external operations
- IPC ActionTypes include NO cloud write/upload/delete/modify actions
- CloudStorageAdapter has NO write/upload/delete/modify methods

### G2: Integration Tests

Create `tests/integration/cloud-storage-e2e.test.ts`:
- E2E: authenticate → select folders → sync → files indexed → searchable
- E2E: incremental sync only downloads modified files
- E2E: disconnect → synced files removed → embeddings removed → state cleared

**Tests (8+):** privacy (5) + integration (3+)

---

## Commit Strategy

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A | CloudStorageAdapter interface + IPC ActionTypes + CloudStorageClient | 6+ |
| 2 | B1-B2 | Google Drive Gateway adapter + OAuth token manager | 8+ |
| 3 | B3-B4 | OAuth callback server + Gateway action router extension | 4+ |
| 4 | C1 | SyncStateStore (SQLite) | 5+ |
| 5 | C2-C3 | SyncOrchestrator + file indexer integration | 7+ |
| 6 | D | FolderSelector + StorageManager | 8+ |
| 7 | E | Autonomy domain + Orchestrator tool + time-saved defaults | 6+ |
| 8 | F | Cloud storage settings UI + folder picker + AppState | 8+ |
| 9 | G1 | Privacy test suite | 5+ |
| 10 | G2 | Integration tests + barrel exports + final verification | 3+ |

**Minimum 60 new tests. Target: 65+.**

---

## Exit Criteria

Step 18 is complete when ALL of the following are true. No exceptions. No deferrals.

### Cloud Storage Interface (A)
1. ☐ CloudStorageAdapter interface defined with all read-only methods
2. ☐ 7 IPC ActionTypes defined with payload schemas
3. ☐ CloudStorageClient implements adapter via IPCClient (zero network in Core)

### Gateway — Google Drive (B)
4. ☐ GoogleDriveAdapter handles OAuth flow (authorize → tokens → credential store)
5. ☐ OAuth scope is `drive.readonly` ONLY
6. ☐ File listing with pagination works
7. ☐ File download to local path works
8. ☐ Google Workspace documents exported (Docs→DOCX, Sheets→CSV, Slides→PDF)
9. ☐ OAuth callback server binds localhost only, validates state parameter
10. ☐ Token refresh handles expired access tokens

### Sync Orchestration (C)
11. ☐ SyncStateStore tracks synced files in SQLite
12. ☐ Full sync downloads all files in selected folders
13. ☐ Incremental sync only downloads modified files
14. ☐ Synced files indexed via existing embedding pipeline
15. ☐ Semantic search returns results from cloud-synced files
16. ☐ File indexer tags synced files with `cloud-sync:google-drive` source

### Selective Sync + Storage (D)
17. ☐ User can select/deselect folders for sync
18. ☐ Deselected folders: local files and embeddings removed
19. ☐ Storage usage calculated and queryable
20. ☐ Storage budget enforced

### Autonomy + Integration (E)
21. ☐ `cloud-storage` autonomy domain added with all maps updated atomically
22. ☐ `cloud.auth` classified as `write` risk
23. ☐ `search_cloud_files` tool in Orchestrator works
24. ☐ All cloud operations visible in Network Monitor

### Privacy
25. ☐ Zero network imports in `packages/core/cloud-storage/`
26. ☐ Zero Gateway imports in `packages/core/cloud-storage/`
27. ☐ IPC types contain NO cloud write/upload/delete/modify actions
28. ☐ OAuth tokens stored encrypted in credential store
29. ☐ All existing privacy tests still pass

### Tests + Compilation
30. ☐ `npx tsc --noEmit` → zero errors
31. ☐ All existing 3,021 tests pass — zero regressions
32. ☐ 60+ new tests from this step
33. ☐ Total test suite passes with zero failures

**All 33 criteria must be marked PASS.**

---

## Approved Dependencies

### New (requires justification in commit message)
- `googleapis` or `google-auth-library` — Google Drive API client (Gateway-side ONLY)
- Alternative: direct HTTP to Google Drive API v3 REST endpoints using existing Gateway HTTP client (recommended if googleapis dependency tree is too large)

### NOT Approved
- Any cloud storage SDK in Core
- Any bidirectional sync library
- Dropbox SDK, OneDrive SDK (future steps)
- Any analytics or telemetry package

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Choosing between `googleapis` library vs direct REST API calls
- Google Drive API pagination parameters
- Google Workspace document export format choices
- Sync interval default (15-60 min range)
- Max file size default (25-100 MB range)
- Storage budget default (1-10 GB range)
- Local sync directory structure
- File type inclusion/exclusion list
- OAuth callback server port selection
- Retry logic for failed downloads (up to 3 retries)

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- Google Drive API requires registered OAuth app with verified redirect URI that can't use localhost
- `googleapis` dependency has security issues or conflicts with Core isolation
- File indexer changes for cloud-synced files would break existing local file indexing
- OAuth token refresh requires credential store encryption changes
- Any change would require network access in `packages/core/` (RULE 1 VIOLATION)
- Autonomy domain extension causes type regressions in more than 3 files
- The `\bfetch\b` ban applies to `packages/core/cloud-storage/` and blocks necessary naming

---

## Verification Commands

```bash
echo "=== CHECK 1: GIT HISTORY ==="
git log --oneline -12
echo "--- Expected: 10 Step 18 commits visible ---"

echo "=== CHECK 2: TYPESCRIPT ==="
npx tsc --noEmit 2>&1
echo "EXIT_CODE=$?"
echo "--- Expected: EXIT_CODE=0, zero errors ---"

echo "=== CHECK 3: TEST SUITE ==="
npx vitest run 2>&1 | tail -30
echo "--- Expected: ~3,085+ tests, 0 failures ---"

echo "=== CHECK 4: TEST FILES EXIST ==="
for f in \
  tests/core/cloud-storage/cloud-storage-client.test.ts \
  tests/core/cloud-storage/sync-state-store.test.ts \
  tests/core/cloud-storage/sync-orchestrator.test.ts \
  tests/core/cloud-storage/file-indexer-integration.test.ts \
  tests/core/cloud-storage/folder-selector.test.ts \
  tests/core/cloud-storage/storage-manager.test.ts \
  tests/core/cloud-storage/cloud-storage-autonomy.test.ts \
  tests/core/cloud-storage/orchestrator-integration.test.ts \
  tests/gateway/google-drive-adapter.test.ts \
  tests/gateway/oauth-token-manager.test.ts \
  tests/gateway/oauth-callback-server.test.ts \
  tests/desktop/cloud-storage-settings.test.ts \
  tests/desktop/cloud-folder-picker.test.ts \
  tests/privacy/cloud-storage-privacy.test.ts \
  tests/integration/cloud-storage-e2e.test.ts; do
  if [ -f "$f" ]; then echo "OK: $f"
  else echo "MISSING: $f"
  fi
done

echo "=== CHECK 5: SOURCE FILES EXIST ==="
for f in \
  packages/core/platform/cloud-storage-types.ts \
  packages/core/cloud-storage/cloud-storage-client.ts \
  packages/core/cloud-storage/sync-state-store.ts \
  packages/core/cloud-storage/sync-orchestrator.ts \
  packages/core/cloud-storage/folder-selector.ts \
  packages/core/cloud-storage/storage-manager.ts \
  packages/core/cloud-storage/index.ts \
  packages/gateway/services/google-drive-adapter.ts \
  packages/gateway/services/oauth-token-manager.ts \
  packages/gateway/services/oauth-callback-server.ts \
  packages/desktop/src/components/CloudStorageSettingsSection.tsx \
  packages/desktop/src/components/CloudFolderPicker.tsx \
  packages/mobile/src/screens/CloudStorageSettingsScreen.tsx; do
  if [ -f "$f" ]; then echo "OK: $f ($(wc -l < "$f") lines)"
  else echo "MISSING: $f"
  fi
done

echo "=== CHECK 6: ZERO NETWORK IN CORE ==="
grep -rn "import.*from.*['\"]node:http\|import.*from.*['\"]node:https\|import.*from.*['\"]node:net" packages/core/cloud-storage/ --include="*.ts" || echo "CLEAN: zero Node.js network imports"
grep -rn "import.*XMLHttpRequest\|import.*WebSocket\|import.*from.*['\"]node-fetch\|import.*from.*['\"]undici\|import.*from.*['\"]axios" packages/core/cloud-storage/ --include="*.ts" || echo "CLEAN: zero HTTP library imports"

echo "=== CHECK 7: ZERO GATEWAY IMPORTS IN CORE ==="
grep -rn "from.*['\"].*gateway" packages/core/cloud-storage/ --include="*.ts" | grep -v '\.test\.' || echo "CLEAN: zero gateway imports"

echo "=== CHECK 8: PULL-ONLY ENFORCEMENT ==="
grep -n "cloud\." packages/core/types/ipc.ts | grep -i "upload\|delete\|modify\|write\|update\|create\|edit\|move\|rename" || echo "CLEAN: no cloud write actions"
grep -n "upload\|delete\|modify\|write\|update\|create\|edit\|move\|rename" packages/core/platform/cloud-storage-types.ts | grep -v "//\|modifiedTime\|cloudModifiedTime\|createdTime" || echo "CLEAN: no write methods"

echo "=== CHECK 9: OAUTH SCOPE ==="
grep -rn "drive.readonly\|auth/drive" packages/gateway/services/google-drive-adapter.ts

echo "=== CHECK 10: AUTONOMY DOMAIN ==="
grep -n "'cloud-storage'" packages/core/agent/types.ts
grep -n "cloud\." packages/core/agent/autonomy.ts | head -15

echo "=== CHECK 11: ORCHESTRATOR TOOL ==="
grep -n "search_cloud_files\|cloud.files\|cloud_files" packages/core/agent/orchestrator.ts | head -5

echo "=== CHECK 12: EXISTING PRIVACY TESTS ==="
npx vitest run tests/privacy/ 2>&1 | tail -10

echo "=== CHECK 13: STUB AUDIT ==="
grep -rn "TODO\|PLACEHOLDER\|FIXME\|stub\|not.implemented" packages/core/cloud-storage/ packages/gateway/services/google-drive-adapter.ts packages/gateway/services/oauth-token-manager.ts packages/gateway/services/oauth-callback-server.ts --include="*.ts" | grep -v '\.test\.' | grep -v 'node_modules'

echo "=== CHECK 14: DEFAULT DISCONNECTED ==="
grep -n "connected.*false\|cloudStorage\|cloud-storage" packages/desktop/src/state/AppState.tsx | head -5

echo ""
echo "=========================================="
echo "  STEP 18 VERIFICATION SUMMARY"
echo "=========================================="
echo ""
echo "CHECK 1:  Git History (10 commits)            [ ]"
echo "CHECK 2:  TypeScript Clean (EXIT_CODE=0)       [ ]"
echo "CHECK 3:  Tests (≥3,080, 0 failures)           [ ]"
echo "CHECK 4:  Test Files Exist (15 files)          [ ]"
echo "CHECK 5:  Source Files Exist (13+ files)       [ ]"
echo "CHECK 6:  Zero Network in Core                 [ ]"
echo "CHECK 7:  Zero Gateway Imports in Core         [ ]"
echo "CHECK 8:  Pull-Only Enforcement                [ ]"
echo "CHECK 9:  OAuth Scope readonly Only            [ ]"
echo "CHECK 10: Autonomy Domain Added                [ ]"
echo "CHECK 11: Orchestrator Cloud Search Tool       [ ]"
echo "CHECK 12: Existing Privacy Tests Pass          [ ]"
echo "CHECK 13: Stub Audit Clean                     [ ]"
echo "CHECK 14: Cloud Storage Default Disconnected   [ ]"
echo ""
echo "ALL 14 CHECKS MUST PASS."
echo "=========================================="
```

If ANY check fails: fix the issue, then re-run ALL checks.

---

## The Bar

When this step closes:

- A user connects Google Drive in Settings. They grant read-only access. They select their "Work" and "Personal" folders to sync. Within minutes, Semblance has pulled their documents locally and indexed them.

- They ask: "Find the Q3 report that Sarah shared." Semblance searches across their local files, emails, AND Google Drive — and finds it. Not just the file name, but the semantic content. Compound knowledge from every data source, unified by the local knowledge graph.

- They check the Network Monitor. Every Google Drive API call is visible: "Listed 47 files in Work/Reports", "Downloaded Q3_Report.pdf (2.4 MB)", "Checked 12 files for changes." Complete transparency.

- They open Settings and see: "Cloud Storage: 847 MB used. 23 files synced. Last sync: 12 minutes ago." They can disconnect at any time. If they do, local copies are deleted, but the knowledge derived from those documents persists in the knowledge graph.

- A privacy auditor checks the OAuth scope: `drive.readonly`. They check the IPC types: no `cloud.upload`, no `cloud.delete`, no `cloud.modify`. Pull-only is enforced at the type level — it's not a policy, it's an architectural impossibility. Semblance physically cannot modify your cloud files.

Cloud AI can summarize a document you paste into it. Semblance knows about ALL your documents — and connects them to your emails, calendar, contacts, and everything else in your life. That's the difference between a tool and an intelligence layer.
