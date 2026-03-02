// Attachment validation, file categories, MIME mapping, and formatting tests.

import { describe, it, expect } from 'vitest';
import {
  validateAttachment,
  getFileCategory,
  mimeFromExtension,
  formatFileSize,
  MAX_ATTACHMENTS,
  MAX_DOC_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  SUPPORTED_EXTENSIONS,
  FILE_CATEGORIES,
} from '../../../packages/core/agent/attachments';

describe('ChatAttachment validation', () => {
  // ─── validateAttachment ──────────────────────────────────────────────────

  it('accepts a valid .pdf file under size limit', () => {
    const result = validateAttachment('report.pdf', 1024 * 1024, 0);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid .ts code file', () => {
    const result = validateAttachment('index.ts', 5000, 0);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid .png image under 20MB', () => {
    const result = validateAttachment('photo.png', 10 * 1024 * 1024, 0);
    expect(result.valid).toBe(true);
  });

  it('rejects unsupported file extension', () => {
    const result = validateAttachment('video.mp4', 1000, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported file type');
  });

  it('rejects file with no extension', () => {
    const result = validateAttachment('Makefile', 1000, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('rejects document over 50MB', () => {
    const result = validateAttachment('huge.pdf', MAX_DOC_SIZE_BYTES + 1, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50MB');
  });

  it('rejects image over 20MB', () => {
    const result = validateAttachment('huge.png', MAX_IMAGE_SIZE_BYTES + 1, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20MB');
  });

  it('rejects empty file (0 bytes)', () => {
    const result = validateAttachment('empty.txt', 0, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects when at MAX_ATTACHMENTS capacity', () => {
    const result = validateAttachment('ok.txt', 100, MAX_ATTACHMENTS);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${MAX_ATTACHMENTS}`);
  });

  it('accepts when below MAX_ATTACHMENTS capacity', () => {
    const result = validateAttachment('ok.txt', 100, MAX_ATTACHMENTS - 1);
    expect(result.valid).toBe(true);
  });

  it('applies doc size limit for spreadsheets', () => {
    const result = validateAttachment('data.xlsx', MAX_DOC_SIZE_BYTES + 1, 0);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50MB');
  });

  it('applies doc size limit for code files', () => {
    const result = validateAttachment('big.py', MAX_DOC_SIZE_BYTES + 1, 0);
    expect(result.valid).toBe(false);
  });

  // ─── getFileCategory ──────────────────────────────────────────────────────

  it('classifies .pdf as document', () => {
    expect(getFileCategory('.pdf')).toBe('document');
  });

  it('classifies .xlsx as spreadsheet', () => {
    expect(getFileCategory('.xlsx')).toBe('spreadsheet');
  });

  it('classifies .ts as code', () => {
    expect(getFileCategory('.ts')).toBe('code');
  });

  it('classifies .py as code', () => {
    expect(getFileCategory('.py')).toBe('code');
  });

  it('classifies .rs as code', () => {
    expect(getFileCategory('.rs')).toBe('code');
  });

  it('classifies .png as image', () => {
    expect(getFileCategory('.png')).toBe('image');
  });

  it('classifies .jpg as image', () => {
    expect(getFileCategory('.jpg')).toBe('image');
  });

  it('returns undefined for unsupported extension', () => {
    expect(getFileCategory('.mp4')).toBeUndefined();
  });

  it('handles uppercase extensions', () => {
    expect(getFileCategory('.PDF')).toBe('document');
    expect(getFileCategory('.PNG')).toBe('image');
  });

  // ─── mimeFromExtension ────────────────────────────────────────────────────

  it('returns correct MIME for .pdf', () => {
    expect(mimeFromExtension('.pdf')).toBe('application/pdf');
  });

  it('returns correct MIME for .docx', () => {
    expect(mimeFromExtension('.docx')).toContain('wordprocessingml');
  });

  it('returns correct MIME for .xlsx', () => {
    expect(mimeFromExtension('.xlsx')).toContain('spreadsheetml');
  });

  it('returns correct MIME for .png', () => {
    expect(mimeFromExtension('.png')).toBe('image/png');
  });

  it('returns correct MIME for .jpg', () => {
    expect(mimeFromExtension('.jpg')).toBe('image/jpeg');
  });

  it('returns correct MIME for .svg', () => {
    expect(mimeFromExtension('.svg')).toBe('image/svg+xml');
  });

  it('returns text/plain for unknown code extension', () => {
    expect(mimeFromExtension('.rs')).toBe('text/plain');
  });

  // ─── formatFileSize ───────────────────────────────────────────────────────

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  // ─── Constants ────────────────────────────────────────────────────────────

  it('MAX_ATTACHMENTS is 10', () => {
    expect(MAX_ATTACHMENTS).toBe(10);
  });

  it('SUPPORTED_EXTENSIONS contains all categories', () => {
    for (const cat of Object.values(FILE_CATEGORIES)) {
      for (const ext of cat) {
        expect(SUPPORTED_EXTENSIONS.has(ext)).toBe(true);
      }
    }
  });

  it('SUPPORTED_EXTENSIONS has at least 30 entries', () => {
    expect(SUPPORTED_EXTENSIONS.size).toBeGreaterThan(30);
  });
});
