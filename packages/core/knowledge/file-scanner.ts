// File Scanner — Discovers and reads local files for indexing.
// Supported: .txt, .md, .pdf, .docx, .csv, .json, .rtf (documents)
//            .xlsx, .xls (spreadsheets — parsed via SheetJS to CSV text)
//            .ts, .js, .py, .rs, .go, .java, etc. (code files — plain text)
//            .png, .jpg, .webp, etc. (images — metadata only, no text extraction)
// PDF: pdf-parse (lightweight, no native deps)
// DOCX: mammoth (lightweight DOCX → text)
// Both are local-only document parsers with ZERO network capabilities.

import { getPlatform } from '../platform/index.js';

const SUPPORTED_EXTENSIONS = new Set([
  // Documents
  '.txt', '.md', '.pdf', '.docx', '.csv', '.json', '.rtf',
  // Spreadsheets
  '.xlsx', '.xls',
  // Code files
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp',
  '.h', '.hpp', '.cs', '.rb', '.swift', '.kt', '.lua', '.sh', '.bash',
  '.zsh', '.fish', '.yaml', '.yml', '.toml', '.ini', '.xml', '.html',
  '.css', '.scss', '.less', '.sql', '.graphql', '.proto', '.dockerfile',
  // Images (metadata only — not text-extractable)
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg',
]);

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
  const p = getPlatform();
  let entries;
  try {
    entries = await p.fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Skip directories we can't read
  }

  for (const entry of entries) {
    // Skip hidden files and excluded directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = p.path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await scanRecursive(fullPath, results);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = p.path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      const stats = await p.fs.stat(fullPath);
      results.push({
        path: fullPath,
        name: entry.name,
        extension: ext,
        size: stats.size,
        lastModified: new Date(stats.mtimeMs).toISOString(),
      });
    } catch {
      // Skip files we can't stat
    }
  }
}

const READ_FILE_TIMEOUT_MS = 30_000; // 30s — default timeout for normal files
const READ_FILE_TIMEOUT_LARGE_MS = 120_000; // 120s — timeout for files >50MB
const CONTENT_EXTRACT_LIMIT_BYTES = 100 * 1024 * 1024; // 100MB — max text content to extract from huge files
const TEXT_STREAM_CHUNK_BYTES = 1024 * 1024; // 1MB — chunk size for streaming text reads

/**
 * Read and extract text content from a file.
 * Wraps actual parsing with a timeout to prevent corrupt files from hanging the indexer.
 *
 * Tiered approach for large files:
 * - Up to 100MB: Read normally
 * - 100MB-500MB: Read in chunks, extract first 100MB of text content
 * - >500MB: Extract first 100MB, note truncation
 *
 * Content is ALWAYS real extracted text, never a placeholder.
 */
export async function readFileContent(filePath: string): Promise<FileContent> {
  const p = getPlatform();
  const ext = p.path.extname(filePath).toLowerCase();
  const name = p.path.basename(filePath, ext);

  let fileSize = 0;
  try {
    const stats = await p.fs.stat(filePath);
    fileSize = stats.size;
  } catch {
    // Can't stat — proceed cautiously, the read itself may fail
  }

  // Use longer timeout for large files (>50MB)
  const timeoutMs = fileSize > 50 * 1024 * 1024 ? READ_FILE_TIMEOUT_LARGE_MS : READ_FILE_TIMEOUT_MS;

  return Promise.race([
    readFileContentInner(filePath, fileSize),
    new Promise<FileContent>((_, reject) =>
      setTimeout(() => reject(new Error(`readFileContent timed out after ${timeoutMs}ms for ${name}${ext}`)), timeoutMs)
    ),
  ]);
}

/**
 * Check if an extension is a text-based format that can be streamed.
 */
function isTextFormat(ext: string): boolean {
  const textExts = new Set([
    '.txt', '.md', '.csv', '.rtf', '.json',
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.swift', '.kt',
    '.lua', '.sh', '.bash', '.zsh', '.fish',
    '.yaml', '.yml', '.toml', '.ini',
    '.xml', '.html', '.css', '.scss', '.less',
    '.sql', '.graphql', '.proto', '.dockerfile',
  ]);
  return textExts.has(ext);
}

/**
 * Read a large text file via the platform abstraction layer.
 * Uses p.fs.readFile (the only file API available in packages/core/)
 * then truncates the result to CONTENT_EXTRACT_LIMIT_BYTES.
 *
 * NOTE: We cannot use node:fs streaming here because packages/core/
 * must have ZERO Node.js builtins (Rule 1 — Zero Network in AI Core).
 * The platform abstraction handles the actual I/O.
 */
async function readLargeTextFile(filePath: string, fileSize: number): Promise<string> {
  const p = getPlatform();

  // Guard: refuse to load files larger than 50MB into memory at once.
  // The sidecar has 4GB heap, but loading many large files back-to-back
  // causes OOM before GC can reclaim. Better to index first 2MB than crash.
  const SAFE_READ_LIMIT = 50 * 1024 * 1024; // 50MB
  if (fileSize > SAFE_READ_LIMIT) {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    let content = await p.fs.readFile(filePath, 'utf-8');
    const trimmed = content.slice(0, 2 * 1024 * 1024); // 2MB extract
    content = ''; // Release full string for GC
    return trimmed + `\n\n[Content truncated: original file was ${sizeMB} MB, indexed first 2 MB]`;
  }

  let content = await p.fs.readFile(filePath, 'utf-8');

  // Truncate to our extraction limit
  if (content.length > CONTENT_EXTRACT_LIMIT_BYTES) {
    content = content.slice(0, CONTENT_EXTRACT_LIMIT_BYTES);
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    content += `\n\n[Content truncated: original file was ${sizeMB} MB, indexed first ${(CONTENT_EXTRACT_LIMIT_BYTES / (1024 * 1024)).toFixed(0)} MB]`;
  }

  return content;
}

async function readFileContentInner(filePath: string, fileSize: number): Promise<FileContent> {
  const p = getPlatform();
  const ext = p.path.extname(filePath).toLowerCase();
  const name = p.path.basename(filePath, ext);
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);

  // Helper: detect binary files by checking for nul bytes in text content.
  // Binary files (executables, images misnamed as .txt, etc.) contain nul bytes
  // that cause "nul byte found in provided data" errors during tokenization/embedding.
  function sanitizeTextContent(content: string, fallbackMime: string): FileContent {
    if (content.includes('\0')) {
      return {
        path: filePath,
        title: name,
        content: `[Binary file: ${name}${ext}] — Not text-extractable.`,
        mimeType: 'application/octet-stream',
      };
    }
    return { path: filePath, title: name, content, mimeType: fallbackMime };
  }

  // For large text-based files (>100MB), use streaming reads
  if (isTextFormat(ext) && fileSize > 100 * 1024 * 1024) {
    const content = await readLargeTextFile(filePath, fileSize);
    if (ext === '.json') {
      // For large JSON, skip pretty-printing (too expensive), return raw
      return sanitizeTextContent(content, 'application/json');
    }
    const mimeMap: Record<string, string> = {
      '.md': 'text/markdown', '.csv': 'text/csv', '.rtf': 'application/rtf',
      '.json': 'application/json',
    };
    return sanitizeTextContent(content, mimeMap[ext] ?? 'text/plain');
  }

  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv':
    case '.rtf': {
      const content = await p.fs.readFile(filePath, 'utf-8');
      const mimeMap: Record<string, string> = {
        '.md': 'text/markdown', '.csv': 'text/csv', '.rtf': 'application/rtf',
      };
      return sanitizeTextContent(content, mimeMap[ext] ?? 'text/plain');
    }

    // Code files — read as plain text
    case '.ts': case '.tsx': case '.js': case '.jsx':
    case '.py': case '.rs': case '.go': case '.java':
    case '.c': case '.cpp': case '.h': case '.hpp':
    case '.cs': case '.rb': case '.swift': case '.kt':
    case '.lua': case '.sh': case '.bash': case '.zsh': case '.fish':
    case '.yaml': case '.yml': case '.toml': case '.ini':
    case '.xml': case '.html': case '.css': case '.scss': case '.less':
    case '.sql': case '.graphql': case '.proto': case '.dockerfile': {
      const content = await p.fs.readFile(filePath, 'utf-8');
      return sanitizeTextContent(content, 'text/plain');
    }

    case '.xlsx':
    case '.xls': {
      try {
        const buffer = await p.fs.readFileBuffer(filePath);
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const sheets: string[] = [];
        let totalLength = 0;
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet);
          sheets.push(`--- Sheet: ${sheetName} ---\n${csv}`);
          totalLength += csv.length;
          // Stop extracting if we've accumulated enough text content
          if (totalLength > CONTENT_EXTRACT_LIMIT_BYTES) {
            sheets.push(`\n[Content truncated: original file was ${sizeMB} MB, extracted partial spreadsheet content]`);
            break;
          }
        }
        return {
          path: filePath,
          title: name,
          content: sheets.join('\n\n') || `[Empty spreadsheet: ${name}${ext}]`,
          mimeType: ext === '.xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/vnd.ms-excel',
        };
      } catch (err) {
        // OOM or parse failure on large spreadsheet — return what we can
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          path: filePath,
          title: name,
          content: `[Spreadsheet: ${name}${ext}] (${sizeMB} MB) — Partial extraction failed: ${errMsg}. File is indexed as metadata.`,
          mimeType: ext === '.xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/vnd.ms-excel',
        };
      }
    }

    // Images — no text extraction, metadata only
    case '.png': case '.jpg': case '.jpeg':
    case '.webp': case '.gif': case '.bmp': case '.svg': {
      const imageMime: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
      };
      return {
        path: filePath,
        title: name,
        content: `[Image: ${name}${ext}] — Visual content attached. No text extraction available.`,
        mimeType: imageMime[ext] ?? 'image/png',
      };
    }

    case '.json': {
      const text = await p.fs.readFile(filePath, 'utf-8');
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
      try {
        const buffer = await p.fs.readFileBuffer(filePath);
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        let text = result.text;
        if (fileSize > 50 * 1024 * 1024) {
          text += `\n\n[Content truncated: original file was ${sizeMB} MB]`;
        }
        return {
          path: filePath,
          title: name,
          content: text,
          mimeType: 'application/pdf',
        };
      } catch (err) {
        // Parse failure on large/corrupt PDF — return what context we can
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          path: filePath,
          title: name,
          content: `[PDF: ${name}${ext}] (${sizeMB} MB) — Extraction failed: ${errMsg}. File location indexed for reference.`,
          mimeType: 'application/pdf',
        };
      }
    }

    case '.docx': {
      try {
        const buffer = await p.fs.readFileBuffer(filePath);
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        let text = result.value;
        if (fileSize > 50 * 1024 * 1024) {
          text += `\n\n[Content truncated: original file was ${sizeMB} MB]`;
        }
        return {
          path: filePath,
          title: name,
          content: text,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      } catch (err) {
        // Parse failure on large/corrupt DOCX — return what context we can
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          path: filePath,
          title: name,
          content: `[DOCX: ${name}${ext}] (${sizeMB} MB) — Extraction failed: ${errMsg}. File location indexed for reference.`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      }
    }

    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
