/**
 * ConnectionsScreen — Dedicated screen for managing all data connectors.
 *
 * Two tabs:
 *   - Services: OAuth-based connectors organized by category
 *   - Imports: Manual export file drop zone + import history
 *
 * Replaces scattered SettingsScreen connector sections.
 */

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectorCard } from '@semblance/ui';
import { ipcSend } from '../ipc/commands';
import type { ConnectorCardStatus } from '@semblance/ui';
import { Card, Button } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import type {
  ConnectorCategory,
  ConnectorDefinition,
  ConnectorState,
} from '@semblance/core/importers/connector-status';
import {
  createDefaultConnectorRegistry,
} from '@semblance/core/importers/connector-registry';

// ─── Category Display Config ──────────────────────────────────────────────────

const CATEGORY_ORDER: ConnectorCategory[] = [
  'cloud_storage',
  'productivity',
  'developer',
  'reading_research',
  'health_fitness',
  'social',
  'music_entertainment',
  'finance',
  'messaging',
];

// ─── Connector Registry Instance ──────────────────────────────────────────────

const registry = createDefaultConnectorRegistry();

// ─── Platform Detection ───────────────────────────────────────────────────────

function getCurrentPlatform(): 'macos' | 'windows' | 'linux' {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'windows';
}

// ─── Tab Components ───────────────────────────────────────────────────────────

type TabId = 'services' | 'imports';

interface ImportHistoryEntry {
  id: string;
  filename: string;
  sourceType: string;
  format: string;
  imported: number;
  importedAt: string;
}

function ServicesTab({
  connectorStates,
  onConnect,
  onDisconnect,
  onSync,
}: {
  connectorStates: Record<string, ConnectorState>;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const { t } = useTranslation();
  const platform = getCurrentPlatform();
  const license = useLicense();
  const isPremium = license.tier !== 'free';

  // Filter connectors for current platform
  const allConnectors = registry.listByPlatform(platform);

  // Group by category
  const byCategory = new Map<ConnectorCategory, ConnectorDefinition[]>();
  for (const connector of allConnectors) {
    const existing = byCategory.get(connector.category) ?? [];
    existing.push(connector);
    byCategory.set(connector.category, existing);
  }

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map(category => (
        <div key={category}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-3">
            {t(`screen.connections.categories.${category}`)}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byCategory.get(category)!.map(connector => {
              const state = connectorStates[connector.id];
              const status: ConnectorCardStatus = state?.status ?? 'disconnected';
              const isLocked = connector.isPremium && !isPremium;

              return (
                <ConnectorCard
                  key={connector.id}
                  id={connector.id}
                  displayName={connector.displayName}
                  description={isLocked ? t('screen.connections.dr_required') : connector.description}
                  status={isLocked ? 'disconnected' : status}
                  isPremium={connector.isPremium}
                  platform={connector.platform}
                  userEmail={state?.userEmail}
                  lastSyncedAt={state?.lastSyncedAt}
                  onConnect={isLocked ? () => {} : onConnect}
                  onDisconnect={onDisconnect}
                  onSync={onSync}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImportsTab({
  importHistory,
  onImportFile,
}: {
  importHistory: ImportHistoryEntry[];
  onImportFile: (filePath: string) => void;
}) {
  const { t } = useTranslation();
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      // Tauri provides the file path via the webkitRelativePath or name
      // In a real Tauri app, we'd use the file dialog API
      onImportFile(file.name);
    }
  }, [onImportFile]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file) {
          onImportFile(file.name);
        }
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onImportFile]);

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${isDragOver
            ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark'
            : 'border-semblance-border dark:border-semblance-border-dark hover:border-semblance-primary/50'
          }
        `.trim()}
        onClick={handleFileSelect}
        data-testid="import-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".json,.csv,.zip,.xml,.enex,.tar.gz"
          onChange={handleFileInputChange}
        />
        <div className="space-y-2">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" x2="12" y1="3" y2="15" />
          </svg>
          <p className="text-sm font-medium text-semblance-text dark:text-semblance-text-dark">
            {t('screen.connections.drop_zone')}
          </p>
          <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {t('screen.connections.drop_zone_formats')}
          </p>
        </div>
      </div>

      {/* Supported Formats Guide */}
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-semibold text-semblance-text dark:text-semblance-text-dark mb-2">
            {t('screen.connections.section_formats')}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            <div>{t('screen.connections.format_google_takeout')}</div>
            <div>{t('screen.connections.format_facebook')}</div>
            <div>{t('screen.connections.format_notion')}</div>
            <div>{t('screen.connections.format_evernote')}</div>
            <div>{t('screen.connections.format_signal')}</div>
            <div>{t('screen.connections.format_telegram')}</div>
            <div>{t('screen.connections.format_discord')}</div>
            <div>{t('screen.connections.format_slack')}</div>
            <div>{t('screen.connections.format_ynab_mint')}</div>
            <div>{t('screen.connections.format_strava')}</div>
            <div>{t('screen.connections.format_goodreads')}</div>
            <div>{t('screen.connections.format_apple_health')}</div>
          </div>
        </div>
      </Card>

      {/* Import History */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-3">
          {t('screen.connections.section_import_history')}
        </h2>
        {importHistory.length === 0 ? (
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark py-4 text-center">
            {t('screen.connections.empty_imports')}
          </p>
        ) : (
          <div className="space-y-2">
            {importHistory.map(entry => (
              <div
                key={entry.id}
                className="opal-surface rounded-lg p-3 flex items-center justify-between text-sm"
                data-testid={`import-history-${entry.id}`}
              >
                <div>
                  <span className="font-medium text-semblance-text dark:text-semblance-text-dark">
                    {entry.filename}
                  </span>
                  <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark ml-2">
                    {entry.format}
                  </span>
                </div>
                <div className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  {t('screen.connections.items_count', { count: entry.imported })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ConnectionsScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('services');
  const state = useAppState();
  const dispatch = useAppDispatch();

  // Connector states from app state (or default empty)
  const connectorStates: Record<string, ConnectorState> = (state as unknown as Record<string, unknown>)['connectorStates'] as Record<string, ConnectorState> ?? {};
  const importHistory: ImportHistoryEntry[] = (state as unknown as Record<string, unknown>)['importHistory'] as ImportHistoryEntry[] ?? [];

  const handleConnect = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.auth',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to connect ${connectorId}:`, err);
    }
  }, []);

  const handleDisconnect = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.disconnect',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to disconnect ${connectorId}:`, err);
    }
  }, []);

  const handleSync = useCallback(async (connectorId: string) => {
    try {
      await ipcSend({
        action: 'connector.sync',
        payload: { connectorId },
      });
    } catch (err) {
      console.error(`Failed to sync ${connectorId}:`, err);
    }
  }, []);

  const handleImportFile = useCallback(async (filePath: string) => {
    try {
      await ipcSend({
        action: 'import.run',
        payload: { sourcePath: filePath, sourceType: 'notes' },
      });
    } catch (err) {
      console.error(`Failed to import ${filePath}:`, err);
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-semblance-text dark:text-semblance-text-dark">
            {t('screen.connections.title')}
          </h1>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
            {t('screen.connections.subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg bg-semblance-surface-2 dark:bg-semblance-surface-2-dark w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`
              px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${activeTab === 'services'
                ? 'bg-semblance-surface dark:bg-semblance-surface-dark text-semblance-text dark:text-semblance-text-dark shadow-sm'
                : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-text dark:hover:text-semblance-text-dark'
              }
            `.trim()}
            data-testid="tab-services"
          >
            {t('screen.connections.tab_services')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('imports')}
            className={`
              px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${activeTab === 'imports'
                ? 'bg-semblance-surface dark:bg-semblance-surface-dark text-semblance-text dark:text-semblance-text-dark shadow-sm'
                : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-text dark:hover:text-semblance-text-dark'
              }
            `.trim()}
            data-testid="tab-imports"
          >
            {t('screen.connections.tab_imports')}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'services' ? (
          <ServicesTab
            connectorStates={connectorStates}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
          />
        ) : (
          <ImportsTab
            importHistory={importHistory}
            onImportFile={handleImportFile}
          />
        )}
      </div>
    </div>
  );
}
