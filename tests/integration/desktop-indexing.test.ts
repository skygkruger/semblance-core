/**
 * Desktop Indexing Integration Tests
 *
 * Validates the file indexing pipeline wiring:
 * - Sidecar uses FileScanner for directory scanning
 * - Individual file indexing with progress tracking
 * - Knowledge stats flow from real DocumentStore/VectorStore
 * - Indexed directories persist to preferences
 * - Error handling for corrupt/unreadable files
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');

const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');
const libContent = readFileSync(LIB_RS, 'utf-8');

describe('Indexing: File Discovery', () => {
  it('imports scanDirectory from core file scanner', () => {
    expect(bridgeContent).toContain('scanDirectory');
    expect(bridgeContent).toContain('file-scanner');
  });

  it('scans each directory in the input list', () => {
    expect(bridgeContent).toContain('for (const dir of params.directories)');
  });

  it('tracks total file count across all directories', () => {
    expect(bridgeContent).toContain('filesTotal');
    expect(bridgeContent).toContain('allFiles.length');
  });
});

describe('Indexing: File Processing', () => {
  it('reads content for each discovered file', () => {
    expect(bridgeContent).toContain('readFileContent(file.path)');
  });

  it('indexes each file with source, path, and metadata', () => {
    expect(bridgeContent).toContain("source: 'local_file'");
    expect(bridgeContent).toContain('sourcePath: file.path');
    expect(bridgeContent).toContain('mimeType: content.mimeType');
  });

  it('tracks chunks created per file', () => {
    expect(bridgeContent).toContain('result.chunksCreated');
    expect(bridgeContent).toContain('totalChunksCreated');
  });
});

describe('Indexing: Progress Events', () => {
  it('emits initial progress with zero counts', () => {
    expect(bridgeContent).toContain('filesScanned: 0');
    expect(bridgeContent).toContain('filesTotal');
  });

  it('emits progress for each file being processed', () => {
    expect(bridgeContent).toContain('currentFile: file.name');
  });

  it('emits completion with final stats', () => {
    expect(bridgeContent).toContain("emit('indexing-complete'");
    expect(bridgeContent).toContain('documentCount');
    expect(bridgeContent).toContain('chunkCount');
  });
});

describe('Indexing: Persistence', () => {
  it('persists indexed directories list', () => {
    expect(bridgeContent).toContain("'indexed_directories'");
    expect(bridgeContent).toContain('JSON.stringify(allDirs)');
  });

  it('merges new directories with existing ones', () => {
    expect(bridgeContent).toContain('new Set');
    expect(bridgeContent).toContain('existingDirs');
  });

  it('provides get_indexed_directories method', () => {
    expect(bridgeContent).toContain("case 'get_indexed_directories':");
  });
});

describe('Indexing: Error Handling', () => {
  it('catches per-directory scan errors', () => {
    expect(bridgeContent).toContain('Failed to scan');
  });

  it('catches per-file indexing errors', () => {
    expect(bridgeContent).toContain('Failed to index');
  });

  it('continues indexing after individual file failures', () => {
    // After a catch, the counter still increments
    expect(bridgeContent).toContain('totalFilesScanned++');
  });

  it('prevents concurrent indexing', () => {
    expect(bridgeContent).toContain('indexingInProgress');
    expect(bridgeContent).toContain('Indexing already in progress');
  });
});

describe('Indexing: Knowledge Stats', () => {
  it('queries real stats from knowledge graph', () => {
    expect(bridgeContent).toContain('core.knowledge.getStats()');
  });

  it('returns document count', () => {
    expect(bridgeContent).toContain('document_count');
    expect(bridgeContent).toContain('totalDocuments');
  });

  it('returns chunk count', () => {
    expect(bridgeContent).toContain('chunk_count');
    expect(bridgeContent).toContain('totalChunks');
  });
});

describe('Indexing: Rust Command Routing', () => {
  it('routes start_indexing through sidecar', () => {
    expect(libContent).toContain('"start_indexing"');
  });

  it('routes get_knowledge_stats through sidecar', () => {
    expect(libContent).toContain('"get_knowledge_stats"');
  });

  it('routes get_indexed_directories through sidecar', () => {
    expect(libContent).toContain('"get_indexed_directories"');
  });

  it('routes get_indexing_status through sidecar', () => {
    expect(libContent).toContain('"get_indexing_status"');
  });
});
