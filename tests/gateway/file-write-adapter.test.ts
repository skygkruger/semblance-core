// Tests for FileWriteAdapter — file write gateway service.
// Validates path resolution, filename safety checks, timestamp suffixes,
// and the full execute() flow including overwrite behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:os, node:fs, and node:path before importing the adapter.
// The adapter imports these at module scope, so mocks must be in place first.

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// node:path — use real implementations so join/resolve/basename/extname work correctly.
// We only need to ensure homedir is controlled (via the os mock above).
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...actual };
});

import { homedir } from 'node:os';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { FileWriteAdapter } from '@semblance/gateway/services/file-write-adapter.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const adapter = new FileWriteAdapter();

function resetMocks(): void {
  vi.mocked(homedir).mockReturnValue('/home/testuser');
  // Default: directory exists (1st call), file does NOT exist (2nd call)
  vi.mocked(existsSync).mockReset()
    .mockReturnValueOnce(true)    // resolvedDir exists
    .mockReturnValueOnce(false);  // targetPath does NOT exist
  vi.mocked(mkdirSync).mockReset();
  vi.mocked(writeFileSync).mockReset();
}

/** Setup: both directory and file exist (for overwrite/timestamp tests) */
function setupFileExists(): void {
  vi.mocked(existsSync).mockReset().mockReturnValue(true);
}

/** Setup: directory does NOT exist */
function setupNoDirNoFile(): void {
  vi.mocked(existsSync).mockReset()
    .mockReturnValueOnce(false)   // resolvedDir does NOT exist
    .mockReturnValueOnce(false);  // targetPath does NOT exist
}

// ─── resolveDirectory ───────────────────────────────────────────────────────

describe('FileWriteAdapter: resolveDirectory (via execute)', () => {
  beforeEach(resetMocks);

  it('resolves "downloads" to the home Downloads directory', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'hello',
      directory: 'downloads',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    expect(data.path).toContain('Downloads');
    expect(data.path).toContain('test.txt');
  });

  it('resolves "documents" to the home Documents directory', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'hello',
      directory: 'documents',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    expect(data.path).toContain('Documents');
  });

  it('resolves "desktop" to the home Desktop directory', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'hello',
      directory: 'desktop',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    expect(data.path).toContain('Desktop');
  });

  it('accepts an absolute path as directory', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'hello',
      directory: '/tmp/custom-dir',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    // The resolved path should contain our custom directory
    expect(data.path).toContain('custom-dir');
  });

  it('defaults to "downloads" when no directory is specified', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'hello',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    expect(data.path).toContain('Downloads');
  });
});

// ─── isFilenameUnsafe (via execute rejections) ──────────────────────────────

describe('FileWriteAdapter: filename safety', () => {
  beforeEach(resetMocks);

  it('rejects filenames with ../ path traversal', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: '../etc/passwd',
      content: 'evil',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PATH_TRAVERSAL');
  });

  it('rejects filenames with / path separator', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'subdir/secret.txt',
      content: 'evil',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PATH_TRAVERSAL');
  });

  it('rejects filenames with \\ path separator', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'subdir\\secret.txt',
      content: 'evil',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PATH_TRAVERSAL');
  });

  it('rejects filenames with .. without slash', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: '..hidden',
      content: 'evil',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PATH_TRAVERSAL');
  });

  it('accepts normal filenames', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'report.pdf',
      content: 'data',
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    expect(data.filename).toBe('report.pdf');
  });

  it('accepts filenames with spaces', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'my report.pdf',
      content: 'data',
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    expect(data.filename).toBe('my report.pdf');
  });

  it('accepts filenames with dashes and underscores', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'my-report_v2.pdf',
      content: 'data',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty filename', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: '',
      content: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });

  it('rejects missing filename', async () => {
    const result = await adapter.execute('file.write' as never, {
      content: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });
});

// ─── addTimestampSuffix (via overwrite=false behavior) ──────────────────────

describe('FileWriteAdapter: timestamp suffix on conflict', () => {
  beforeEach(resetMocks);

  it('adds timestamp suffix when file exists and overwrite is false', async () => {
    setupFileExists();

    const result = await adapter.execute('file.write' as never, {
      filename: 'report.md',
      content: 'data',
      overwrite: false,
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    // Filename should have a timestamp inserted before the extension
    expect(data.filename).toMatch(/^report_\d{8}T\d{6}\.md$/);
    expect(data.filename).not.toBe('report.md');
  });

  it('handles files without extensions when adding timestamp', async () => {
    setupFileExists();

    const result = await adapter.execute('file.write' as never, {
      filename: 'Makefile',
      content: 'data',
      overwrite: false,
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    // Should have timestamp appended with no extension
    expect(data.filename).toMatch(/^Makefile_\d{8}T\d{6}$/);
  });

  it('keeps original filename when file does not exist', async () => {
    // Default resetMocks already sets dir=true, file=false

    const result = await adapter.execute('file.write' as never, {
      filename: 'report.md',
      content: 'data',
      overwrite: false,
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    expect(data.filename).toBe('report.md');
  });
});

// ─── Full execute flow ──────────────────────────────────────────────────────

describe('FileWriteAdapter: execute', () => {
  beforeEach(resetMocks);

  it('writes file with correct content', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'output.txt',
      content: 'Hello, Semblance!',
      directory: 'downloads',
    });

    expect(result.success).toBe(true);
    expect(writeFileSync).toHaveBeenCalledTimes(1);

    const [writtenPath, writtenContent, writtenEncoding] = vi.mocked(writeFileSync).mock.calls[0];
    expect(writtenPath).toContain('output.txt');
    expect(writtenContent).toBe('Hello, Semblance!');
    expect(writtenEncoding).toBe('utf-8');
  });

  it('overwrites existing file when overwrite=true', async () => {
    setupFileExists();

    const result = await adapter.execute('file.write' as never, {
      filename: 'report.md',
      content: 'updated content',
      overwrite: true,
    });

    expect(result.success).toBe(true);
    const data = result.data as { filename: string };
    // Should keep original name since overwrite is true
    expect(data.filename).toBe('report.md');
  });

  it('returns bytesWritten in the response', async () => {
    const content = 'Hello world!';
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content,
    });

    expect(result.success).toBe(true);
    const data = result.data as { bytesWritten: number };
    expect(data.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));
  });

  it('returns the final path in the response', async () => {
    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'data',
      directory: 'downloads',
    });

    expect(result.success).toBe(true);
    const data = result.data as { path: string };
    expect(data.path).toContain('Downloads');
    expect(data.path).toContain('test.txt');
  });

  it('returns error for write failures', async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'data',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('WRITE_FAILED');
    expect(result.error?.message).toContain('permission denied');
  });

  it('creates directory if it does not exist', async () => {
    setupNoDirNoFile();

    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'data',
      directory: 'downloads',
    });

    expect(result.success).toBe(true);
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('Downloads'),
      { recursive: true },
    );
  });

  it('returns error when directory creation fails', async () => {
    setupNoDirNoFile();
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = await adapter.execute('file.write' as never, {
      filename: 'test.txt',
      content: 'data',
      directory: 'downloads',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DIR_CREATE_FAILED');
  });

  it('handles multibyte UTF-8 content correctly in bytesWritten', async () => {
    const content = 'Hello \u{1F600} world'; // Emoji is 4 bytes in UTF-8
    const result = await adapter.execute('file.write' as never, {
      filename: 'emoji.txt',
      content,
    });

    expect(result.success).toBe(true);
    const data = result.data as { bytesWritten: number };
    // Buffer.byteLength counts actual bytes, not JS string length
    expect(data.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));
    expect(data.bytesWritten).toBeGreaterThan(content.length);
  });
});
