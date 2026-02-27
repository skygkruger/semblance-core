/**
 * Import Digital Life View — Settings sub-view for importing external data.
 *
 * Shows import source cards with consent text, file picker, progress bar,
 * and import history. Non-premium users see "Available with Digital Representative".
 */

import { useState, useCallback } from 'react';
import { Card, Button } from '@semblance/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportSource {
  id: string;
  name: string;
  description: string;
  formats: string;
  consentText: string;
  icon: string;
}

export interface ImportProgress {
  phase: string;
  itemsProcessed: number;
  totalItems: number;
  isActive: boolean;
}

export interface ImportHistoryEntry {
  id: string;
  sourceType: string;
  format: string;
  importedAt: string;
  itemCount: number;
  status: string;
}

interface ImportDigitalLifeViewProps {
  isPremium?: boolean;
  importSources?: ImportSource[];
  importHistory?: ImportHistoryEntry[];
  progress?: ImportProgress | null;
  onImport?: (sourceId: string) => void;
}

// ─── Default Sources ────────────────────────────────────────────────────────

export const DEFAULT_IMPORT_SOURCES: ImportSource[] = [
  {
    id: 'browser_history',
    name: 'Browser History',
    description: 'Import your browsing history from Chrome or Firefox',
    formats: 'Chrome Takeout JSON, Firefox places.sqlite',
    consentText: 'Your browsing history will be indexed locally for search and context.',
    icon: 'globe',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Import notes from Obsidian or Apple Notes',
    formats: 'Markdown folders, Apple Notes HTML export',
    consentText: 'Your notes will be indexed locally. No content leaves your device.',
    icon: 'file-text',
  },
  {
    id: 'photos_metadata',
    name: 'Photos Metadata',
    description: 'Import EXIF data from your photo library',
    formats: 'JPEG, PNG (metadata only)',
    consentText: 'Your photos themselves are never stored. Only metadata (location, date, camera) is indexed.',
    icon: 'image',
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Import chat exports from WhatsApp',
    formats: 'WhatsApp .txt export',
    consentText: 'Your messages will be indexed locally for search and context.',
    icon: 'message-circle',
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportDigitalLifeView({
  isPremium = false,
  importSources = DEFAULT_IMPORT_SOURCES,
  importHistory = [],
  progress = null,
  onImport,
}: ImportDigitalLifeViewProps) {
  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold text-semblance-primary">Import Digital Life</h2>
        <p className="text-sm text-semblance-secondary mt-1">
          Expand what Semblance knows by importing data from other sources.
          Everything stays on your device.
        </p>
      </div>

      {/* Progress bar */}
      {progress?.isActive && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-semblance-primary font-medium">{progress.phase}</span>
              <span className="text-semblance-secondary">
                {progress.itemsProcessed} / {progress.totalItems} items
              </span>
            </div>
            <div className="w-full h-2 bg-semblance-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-semblance-accent rounded-full transition-all"
                style={{
                  width: `${progress.totalItems > 0 ? (progress.itemsProcessed / progress.totalItems) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Import source cards */}
      <div className="grid gap-4">
        {importSources.map(source => (
          <Card key={source.id} className={`p-4 ${!isPremium ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-semblance-primary">{source.name}</h3>
                <p className="text-sm text-semblance-secondary mt-1">{source.description}</p>
                <p className="text-xs text-semblance-muted mt-1">Formats: {source.formats}</p>
                <p className="text-xs text-semblance-secondary mt-2 italic">{source.consentText}</p>
              </div>
              <div className="ml-4">
                {isPremium ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onImport?.(source.id)}
                    disabled={progress?.isActive}
                  >
                    Import
                  </Button>
                ) : (
                  <span className="text-xs text-semblance-muted whitespace-nowrap">
                    Available with Digital Representative
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Import history */}
      {importHistory.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-semblance-primary mb-2">Import History</h3>
          <div className="space-y-2">
            {importHistory.map(entry => (
              <div
                key={entry.id}
                className="flex justify-between items-center text-sm px-3 py-2 bg-semblance-surface-2 rounded"
              >
                <span className="text-semblance-primary">{entry.sourceType}</span>
                <span className="text-semblance-secondary">
                  {entry.itemCount} items · {new Date(entry.importedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
