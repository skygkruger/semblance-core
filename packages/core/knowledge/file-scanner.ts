// File Scanner — Discovers and reads local files for indexing.
// Supported: .txt, .md, .pdf, .docx, .csv, .json
// PDF: pdf-parse (lightweight, no native deps)
// DOCX: mammoth (lightweight DOCX → text)
// Both are local-only document parsers with ZERO network capabilities.

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.csv', '.json']);

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.cache',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '.semblance',
]);

export interface ScannedFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  lastModified: string;        // ISO 8601
}

export interface FileContent {
  path: string;
  title: string;
  content: string;
  mimeType: string;
}

/**
 * Scan a directory for indexable files.
 */
export async function scanDirectory(dirPath: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  await scanRecursive(dirPath, files);
  return files;
}

async function scanRecursive(dirPath: string, results: ScannedFile[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Skip directories we can't read
  }

  for (const entry of entries) {
    // Skip hidden files and excluded directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await scanRecursive(fullPath, results);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      const stats = await stat(fullPath);
      results.push({
        path: fullPath,
        name: entry.name,
        extension: ext,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    } catch {
      // Skip files we can't stat
    }
  }
}

/**
 * Read and extract text content from a file.
 */
export async function readFileContent(filePath: string): Promise<FileContent> {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath, ext);

  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv': {
      const buffer = await readFile(filePath);
      return {
        path: filePath,
        title: name,
        content: buffer.toString('utf-8'),
        mimeType: ext === '.md' ? 'text/markdown' : ext === '.csv' ? 'text/csv' : 'text/plain',
      };
    }

    case '.json': {
      const buffer = await readFile(filePath);
      const text = buffer.toString('utf-8');
      // Pretty-print JSON for better chunking
      try {
        const parsed = JSON.parse(text) as unknown;
        return {
          path: filePath,
          title: name,
          content: JSON.stringify(parsed, null, 2),
          mimeType: 'application/json',
        };
      } catch {
        return { path: filePath, title: name, content: text, mimeType: 'application/json' };
      }
    }

    case '.pdf': {
      const buffer = await readFile(filePath);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      return {
        path: filePath,
        title: name,
        content: result.text,
        mimeType: 'application/pdf',
      };
    }

    case '.docx': {
      const buffer = await readFile(filePath);
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return {
        path: filePath,
        title: name,
        content: result.value,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
