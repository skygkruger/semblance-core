/**
 * EXIF Photo Metadata Parser — Extracts metadata from JPEG/PNG images.
 *
 * Reads EXIF data from binary file headers without any npm dependency.
 * Extracts: GPS lat/lon, DateTimeOriginal, Make, Model, orientation.
 * Content field is a text description — NEVER stores image pixel data.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic']);

function deterministicId(filePath: string): string {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 12);
  return `exif_${hash}`;
}

export interface ExifData {
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  orientation?: number;
  imageWidth?: number;
  imageHeight?: number;
}

// EXIF tag IDs
const EXIF_TAGS: Record<number, string> = {
  0x010F: 'make',
  0x0110: 'model',
  0x0112: 'orientation',
  0x9003: 'dateTimeOriginal',
  0x9004: 'dateTimeDigitized',
  0xA002: 'imageWidth',
  0xA003: 'imageHeight',
};

const GPS_TAGS: Record<number, string> = {
  0x0001: 'gpsLatitudeRef',
  0x0002: 'gpsLatitude',
  0x0003: 'gpsLongitudeRef',
  0x0004: 'gpsLongitude',
};

function readUint16(buffer: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUint32(buffer: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function readRational(buffer: Buffer, offset: number, littleEndian: boolean): number {
  const numerator = readUint32(buffer, offset, littleEndian);
  const denominator = readUint32(buffer, offset + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

function readString(buffer: Buffer, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length; i++) {
    const c = buffer[offset + i]!;
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

function parseGpsDms(buffer: Buffer, valueOffset: number, littleEndian: boolean): number {
  const degrees = readRational(buffer, valueOffset, littleEndian);
  const minutes = readRational(buffer, valueOffset + 8, littleEndian);
  const seconds = readRational(buffer, valueOffset + 16, littleEndian);
  return degrees + minutes / 60 + seconds / 3600;
}

function parseExifFromJpeg(buffer: Buffer): ExifData {
  const exif: ExifData = {};

  // Check JPEG SOI marker
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return exif;

  // Find APP1 marker (EXIF data)
  let offset = 2;
  while (offset < buffer.length - 4) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1]!;

    if (marker === 0xE1) {
      // APP1 - EXIF data
      const length = buffer.readUInt16BE(offset + 2);
      const exifHeader = buffer.toString('ascii', offset + 4, offset + 10);

      if (exifHeader === 'Exif\0\0') {
        const tiffOffset = offset + 10;
        parseIfd(buffer, tiffOffset, exif);
      }
      break;
    }

    // Skip this marker
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }

  return exif;
}

function parseIfd(buffer: Buffer, tiffOffset: number, exif: ExifData): void {
  if (tiffOffset + 8 > buffer.length) return;

  // Determine byte order
  const byteOrder = buffer.readUInt16BE(tiffOffset);
  const littleEndian = byteOrder === 0x4949; // 'II'

  // Verify TIFF magic number
  const magic = readUint16(buffer, tiffOffset + 2, littleEndian);
  if (magic !== 0x002A) return;

  // Get offset to first IFD
  const ifdOffset = readUint32(buffer, tiffOffset + 4, littleEndian);
  readIfdEntries(buffer, tiffOffset, tiffOffset + ifdOffset, littleEndian, exif, false);
}

function readIfdEntries(
  buffer: Buffer,
  tiffOffset: number,
  ifdStart: number,
  littleEndian: boolean,
  exif: ExifData,
  isGps: boolean,
): void {
  if (ifdStart + 2 > buffer.length) return;

  const entryCount = readUint16(buffer, ifdStart, littleEndian);
  let gpsLatRef = '';
  let gpsLonRef = '';
  let gpsLat = 0;
  let gpsLon = 0;

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdStart + 2 + i * 12;
    if (entryOffset + 12 > buffer.length) break;

    const tag = readUint16(buffer, entryOffset, littleEndian);
    const type = readUint16(buffer, entryOffset + 2, littleEndian);
    const count = readUint32(buffer, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    if (isGps) {
      const gpsTag = GPS_TAGS[tag];
      if (gpsTag === 'gpsLatitudeRef') {
        gpsLatRef = String.fromCharCode(buffer[valueOffset]!);
      } else if (gpsTag === 'gpsLongitudeRef') {
        gpsLonRef = String.fromCharCode(buffer[valueOffset]!);
      } else if (gpsTag === 'gpsLatitude' && type === 5 && count === 3) {
        const dataOffset = tiffOffset + readUint32(buffer, valueOffset, littleEndian);
        if (dataOffset + 24 <= buffer.length) {
          gpsLat = parseGpsDms(buffer, dataOffset, littleEndian);
        }
      } else if (gpsTag === 'gpsLongitude' && type === 5 && count === 3) {
        const dataOffset = tiffOffset + readUint32(buffer, valueOffset, littleEndian);
        if (dataOffset + 24 <= buffer.length) {
          gpsLon = parseGpsDms(buffer, dataOffset, littleEndian);
        }
      }
    } else {
      const exifTag = EXIF_TAGS[tag];

      if (exifTag === 'make' || exifTag === 'model' || exifTag === 'dateTimeOriginal' || exifTag === 'dateTimeDigitized') {
        // String type
        if (count > 4) {
          const strOffset = tiffOffset + readUint32(buffer, valueOffset, littleEndian);
          if (strOffset + count <= buffer.length) {
            const value = readString(buffer, strOffset, count);
            if (exifTag === 'make') exif.make = value;
            else if (exifTag === 'model') exif.model = value;
            else if (exifTag === 'dateTimeOriginal') exif.dateTimeOriginal = value;
          }
        } else {
          const value = readString(buffer, valueOffset, count);
          if (exifTag === 'make') exif.make = value;
          else if (exifTag === 'model') exif.model = value;
          else if (exifTag === 'dateTimeOriginal') exif.dateTimeOriginal = value;
        }
      } else if (exifTag === 'orientation') {
        exif.orientation = readUint16(buffer, valueOffset, littleEndian);
      } else if (exifTag === 'imageWidth' || exifTag === 'imageHeight') {
        const val = type === 3
          ? readUint16(buffer, valueOffset, littleEndian)
          : readUint32(buffer, valueOffset, littleEndian);
        if (exifTag === 'imageWidth') exif.imageWidth = val;
        else exif.imageHeight = val;
      }

      // Check for EXIF sub-IFD pointer (tag 0x8769)
      if (tag === 0x8769) {
        const subIfdOffset = readUint32(buffer, valueOffset, littleEndian);
        readIfdEntries(buffer, tiffOffset, tiffOffset + subIfdOffset, littleEndian, exif, false);
      }

      // Check for GPS IFD pointer (tag 0x8825)
      if (tag === 0x8825) {
        const gpsIfdOffset = readUint32(buffer, valueOffset, littleEndian);
        readIfdEntries(buffer, tiffOffset, tiffOffset + gpsIfdOffset, littleEndian, exif, true);
      }
    }
  }

  // Apply GPS ref signs
  if (isGps) {
    if (gpsLat !== 0) {
      exif.gpsLatitude = gpsLatRef === 'S' ? -gpsLat : gpsLat;
    }
    if (gpsLon !== 0) {
      exif.gpsLongitude = gpsLonRef === 'W' ? -gpsLon : gpsLon;
    }
  }
}

function formatExifDate(dateStr: string): string | null {
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = dateStr.match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, h, min, s] = match;
  return `${y}-${m}-${d}T${h}:${min}:${s}`;
}

function buildDescription(exif: ExifData, fileName: string): string {
  const parts: string[] = [`Photo: ${fileName}`];

  if (exif.dateTimeOriginal) {
    const formatted = formatExifDate(exif.dateTimeOriginal);
    if (formatted) parts.push(`taken on ${formatted}`);
  }

  if (exif.make || exif.model) {
    const camera = [exif.make, exif.model].filter(Boolean).join(' ');
    parts.push(`with ${camera}`);
  }

  if (exif.gpsLatitude !== undefined && exif.gpsLongitude !== undefined) {
    parts.push(`at GPS ${exif.gpsLatitude.toFixed(4)}, ${exif.gpsLongitude.toFixed(4)}`);
  }

  return parts.join(' ');
}

export class ExifParser implements ImportParser {
  readonly sourceType = 'photos_metadata' as const;
  readonly supportedFormats = ['exif_jpeg', 'exif_png'];

  canParse(path: string): boolean {
    try {
      const { statSync, readdirSync } = require('node:fs');
      const { extname } = require('node:path');
      const stat = statSync(path);

      if (stat.isDirectory()) {
        const files = readdirSync(path) as string[];
        return files.some((f: string) => SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()));
      }

      return SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase());
    } catch {
      return false;
    }
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join, basename, extname } = await import('node:path');

    // Gather image files
    const imageFiles: string[] = [];

    const walkDir = (dir: string): void => {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory() && !entry.startsWith('.')) {
              walkDir(fullPath);
            } else if (SUPPORTED_EXTENSIONS.has(extname(entry).toLowerCase())) {
              imageFiles.push(fullPath);
            }
          } catch {
            errors.push({ message: `Cannot access ${fullPath}` });
          }
        }
      } catch {
        errors.push({ message: `Cannot read directory ${dir}` });
      }
    };

    try {
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walkDir(path);
      } else {
        imageFiles.push(path);
      }
    } catch (err) {
      return {
        format: 'exif_jpeg',
        items: [],
        errors: [{ message: `Failed to access path: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    const totalFound = imageFiles.length;
    let items: ImportedItem[] = [];

    for (const filePath of imageFiles) {
      try {
        const buffer = readFileSync(filePath);
        const ext = extname(filePath).toLowerCase();

        let exif: ExifData = {};
        if (ext === '.jpg' || ext === '.jpeg') {
          exif = parseExifFromJpeg(buffer);
        }
        // PNG and HEIC EXIF support would require additional parsing
        // For now, we create a basic metadata entry

        const fileName = basename(filePath);
        const stat = statSync(filePath);

        // Use EXIF date if available, otherwise file modified time
        let timestamp: string;
        if (exif.dateTimeOriginal) {
          const formatted = formatExifDate(exif.dateTimeOriginal);
          timestamp = formatted ? new Date(formatted).toISOString() : stat.mtime.toISOString();
        } else {
          timestamp = stat.mtime.toISOString();
        }

        if (options?.since && new Date(timestamp) < options.since) {
          continue;
        }

        const description = buildDescription(exif, fileName);

        items.push({
          id: deterministicId(filePath),
          sourceType: 'photos_metadata',
          title: fileName,
          content: description,
          timestamp,
          metadata: {
            filePath,
            make: exif.make,
            model: exif.model,
            gpsLatitude: exif.gpsLatitude,
            gpsLongitude: exif.gpsLongitude,
            orientation: exif.orientation,
            dateTimeOriginal: exif.dateTimeOriginal,
          },
        });
      } catch (err) {
        errors.push({ message: `Failed to parse ${filePath}: ${(err as Error).message}` });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'exif_jpeg',
      items,
      errors,
      totalFound,
    };
  }
}
