// Chat Attachments — Types and validation for multi-file upload.
//
// Supports up to MAX_ATTACHMENTS files per message.
// Validates file size and extension before processing.
// No network access — all validation is local.

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_ATTACHMENTS = 10;
export const MAX_DOC_SIZE_BYTES = 50 * 1024 * 1024;   // 50 MB
export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;  // 20 MB

/** Extensions grouped by category for UI filtering and size validation. */
export const FILE_CATEGORIES = {
  document: new Set(['.txt', '.md', '.pdf', '.docx', '.csv', '.json', '.rtf']),
  spreadsheet: new Set(['.xlsx', '.xls']),
  code: new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp',
    '.h', '.hpp', '.cs', '.rb', '.swift', '.kt', '.lua', '.sh', '.bash',
    '.zsh', '.fish', '.yaml', '.yml', '.toml', '.ini', '.xml', '.html',
    '.css', '.scss', '.less', '.sql', '.graphql', '.proto', '.dockerfile',
  ]),
  image: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']),
} as const;

/** All supported extensions — union of all categories. */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  ...FILE_CATEGORIES.document,
  ...FILE_CATEGORIES.spreadsheet,
  ...FILE_CATEGORIES.code,
  ...FILE_CATEGORIES.image,
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttachmentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface ChatAttachment {
  /** Unique ID for this attachment (nanoid). */
  id: string;
  /** Original file name with extension. */
  fileName: string;
  /** Absolute file path on device. */
  filePath: string;
  /** MIME type (e.g., 'application/pdf'). */
  mimeType: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** Processing status. */
  status: AttachmentStatus;
  /** Error message if status is 'error'. */
  error?: string;
  /** Knowledge graph document ID once indexed for context. */
  documentId?: string;
  /** Whether this file has been added to the permanent knowledge graph. */
  addedToKnowledge: boolean;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface AttachmentValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Get the file category for a given extension.
 * Returns undefined if the extension is not supported.
 */
export function getFileCategory(ext: string): 'document' | 'spreadsheet' | 'code' | 'image' | undefined {
  const lower = ext.toLowerCase();
  if (FILE_CATEGORIES.document.has(lower)) return 'document';
  if (FILE_CATEGORIES.spreadsheet.has(lower)) return 'spreadsheet';
  if (FILE_CATEGORIES.code.has(lower)) return 'code';
  if (FILE_CATEGORIES.image.has(lower)) return 'image';
  return undefined;
}

/**
 * Validate a single file for attachment.
 * Checks extension support and size limits.
 */
export function validateAttachment(
  fileName: string,
  sizeBytes: number,
  existingCount: number,
): AttachmentValidationResult {
  if (existingCount >= MAX_ATTACHMENTS) {
    return { valid: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` };
  }

  const ext = extractExtension(fileName);
  if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Unsupported file type: ${ext ?? 'unknown'}` };
  }

  const category = getFileCategory(ext);
  const maxSize = category === 'image' ? MAX_IMAGE_SIZE_BYTES : MAX_DOC_SIZE_BYTES;
  if (sizeBytes > maxSize) {
    const limitMb = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `File exceeds ${limitMb}MB limit` };
  }

  if (sizeBytes === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}

/**
 * Map file extension to MIME type.
 */
export function mimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.rtf': 'application/rtf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.html': 'text/html',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'application/toml',
    '.ini': 'text/plain',
    '.sql': 'application/sql',
    '.graphql': 'application/graphql',
    '.proto': 'text/plain',
    '.dockerfile': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.css': 'text/css',
    '.scss': 'text/x-scss',
    '.less': 'text/x-less',
  };
  return map[ext.toLowerCase()] ?? 'text/plain';
}

/**
 * Extract extension from a file name, including the dot.
 * Returns null if no extension found.
 */
function extractExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return null;
  return fileName.slice(lastDot).toLowerCase();
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
