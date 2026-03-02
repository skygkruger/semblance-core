// File Scanner — Discovers and reads local files for indexing.
// Supported: .txt, .md, .pdf, .docx, .csv, .json, .rtf (documents)
//            .xlsx, .xls (spreadsheets — placeholder, structured extraction TBD)
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

/**
 * Read and extract text content from a file.
 */
export async function readFileContent(filePath: string): Promise<FileContent> {
  const p = getPlatform();
  const ext = p.path.extname(filePath).toLowerCase();
  const name = p.path.basename(filePath, ext);

  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv':
    case '.rtf': {
      const content = await p.fs.readFile(filePath, 'utf-8');
      const mimeMap: Record<string, string> = {
        '.md': 'text/markdown', '.csv': 'text/csv', '.rtf': 'application/rtf',
      };
      return {
        path: filePath,
        title: name,
        content,
        mimeType: mimeMap[ext] ?? 'text/plain',
      };
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
      return { path: filePath, title: name, content, mimeType: 'text/plain' };
    }

    // Spreadsheets — read as text representation
    // TODO: Sprint 4 — add xlsx parsing via SheetJS or similar for structured extraction
    case '.xlsx':
    case '.xls': {
      return {
        path: filePath,
        title: name,
        content: `[Spreadsheet: ${name}${ext}] — Structured extraction pending. File attached for reference.`,
        mimeType: ext === '.xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/vnd.ms-excel',
      };
    }

    // Images — no text extraction, metadata placeholder
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
      const buffer = await p.fs.readFileBuffer(filePath);
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
      const buffer = await p.fs.readFileBuffer(filePath);
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
