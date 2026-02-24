import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { ExifParser } from '@semblance/core/importers/photos/exif-parser.js';

/**
 * Build a minimal JPEG with EXIF data for testing.
 * Creates proper JPEG SOI + APP1 EXIF marker structure.
 */
function buildTestJpeg(opts: {
  make?: string;
  model?: string;
  dateTime?: string;
  gpsLat?: { degrees: number; minutes: number; seconds: number; ref: 'N' | 'S' };
  gpsLon?: { degrees: number; minutes: number; seconds: number; ref: 'E' | 'W' };
}): Buffer {
  const littleEndian = true;
  const entries: Array<{ tag: number; type: number; count: number; value: Buffer }> = [];
  const dataBlocks: Buffer[] = [];
  let dataOffset = 0; // Will be calculated after IFD

  // Collect string entries that need external data blocks
  function addStringEntry(tag: number, value: string): void {
    const strBuf = Buffer.from(value + '\0', 'ascii');
    entries.push({ tag, type: 2, count: strBuf.length, value: strBuf });
  }

  if (opts.make) addStringEntry(0x010F, opts.make);
  if (opts.model) addStringEntry(0x0110, opts.model);

  // We'll build the EXIF sub-IFD for dateTimeOriginal
  const exifSubIfdEntries: Array<{ tag: number; type: number; count: number; value: Buffer }> = [];
  if (opts.dateTime) {
    const strBuf = Buffer.from(opts.dateTime + '\0', 'ascii');
    exifSubIfdEntries.push({ tag: 0x9003, type: 2, count: strBuf.length, value: strBuf });
  }

  // Build GPS IFD
  const gpsIfdEntries: Array<{ tag: number; type: number; count: number; value: Buffer }> = [];
  if (opts.gpsLat) {
    // GPS Latitude Ref
    const refBuf = Buffer.alloc(4);
    refBuf.write(opts.gpsLat.ref, 0, 'ascii');
    gpsIfdEntries.push({ tag: 0x0001, type: 2, count: 2, value: refBuf });

    // GPS Latitude (3 rationals = 24 bytes)
    const latBuf = Buffer.alloc(24);
    latBuf.writeUInt32LE(opts.gpsLat.degrees, 0);
    latBuf.writeUInt32LE(1, 4);
    latBuf.writeUInt32LE(opts.gpsLat.minutes, 8);
    latBuf.writeUInt32LE(1, 12);
    latBuf.writeUInt32LE(Math.round(opts.gpsLat.seconds * 100), 16);
    latBuf.writeUInt32LE(100, 20);
    gpsIfdEntries.push({ tag: 0x0002, type: 5, count: 3, value: latBuf });
  }
  if (opts.gpsLon) {
    // GPS Longitude Ref
    const refBuf = Buffer.alloc(4);
    refBuf.write(opts.gpsLon.ref, 0, 'ascii');
    gpsIfdEntries.push({ tag: 0x0003, type: 2, count: 2, value: refBuf });

    // GPS Longitude
    const lonBuf = Buffer.alloc(24);
    lonBuf.writeUInt32LE(opts.gpsLon.degrees, 0);
    lonBuf.writeUInt32LE(1, 4);
    lonBuf.writeUInt32LE(opts.gpsLon.minutes, 8);
    lonBuf.writeUInt32LE(1, 12);
    lonBuf.writeUInt32LE(Math.round(opts.gpsLon.seconds * 100), 16);
    lonBuf.writeUInt32LE(100, 20);
    gpsIfdEntries.push({ tag: 0x0004, type: 5, count: 3, value: lonBuf });
  }

  // Now build the TIFF structure
  // TIFF header: byte order (2) + magic (2) + IFD offset (4) = 8 bytes
  // IFD0: entry count (2) + entries (12 each) + next IFD (4)
  // Then data blocks, then EXIF sub-IFD, then GPS IFD

  const hasExifSubIfd = exifSubIfdEntries.length > 0;
  const hasGpsIfd = gpsIfdEntries.length > 0;

  // Add pointer entries to IFD0
  if (hasExifSubIfd) {
    entries.push({ tag: 0x8769, type: 4, count: 1, value: Buffer.alloc(4) }); // placeholder offset
  }
  if (hasGpsIfd) {
    entries.push({ tag: 0x8825, type: 4, count: 1, value: Buffer.alloc(4) }); // placeholder offset
  }

  // Sort entries by tag (EXIF spec requirement)
  entries.sort((a, b) => a.tag - b.tag);

  const ifd0EntryCount = entries.length;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4; // count + entries + next IFD pointer
  const ifd0DataStart = 8 + ifd0Size; // After TIFF header + IFD

  // Calculate data block positions
  let currentDataPos = ifd0DataStart;
  const entryDataOffsets: number[] = [];
  for (const entry of entries) {
    const dataSize = getDataSize(entry.type, entry.count);
    if (dataSize > 4 && entry.tag !== 0x8769 && entry.tag !== 0x8825) {
      entryDataOffsets.push(currentDataPos);
      currentDataPos += entry.value.length;
    } else {
      entryDataOffsets.push(-1); // Inline
    }
  }

  // EXIF sub-IFD position
  let exifSubIfdPos = currentDataPos;
  if (hasExifSubIfd) {
    const subIfdSize = 2 + exifSubIfdEntries.length * 12 + 4;
    currentDataPos = exifSubIfdPos + subIfdSize;
    // Sub-IFD data
    const subEntryDataOffsets: number[] = [];
    for (const entry of exifSubIfdEntries) {
      const dataSize = getDataSize(entry.type, entry.count);
      if (dataSize > 4) {
        subEntryDataOffsets.push(currentDataPos);
        currentDataPos += entry.value.length;
      } else {
        subEntryDataOffsets.push(-1);
      }
    }
    (exifSubIfdEntries as any).__dataOffsets = subEntryDataOffsets;
  }

  // GPS IFD position
  let gpsIfdPos = currentDataPos;
  if (hasGpsIfd) {
    const gpsIfdSize = 2 + gpsIfdEntries.length * 12 + 4;
    currentDataPos = gpsIfdPos + gpsIfdSize;
    const gpsEntryDataOffsets: number[] = [];
    for (const entry of gpsIfdEntries) {
      const dataSize = getDataSize(entry.type, entry.count);
      if (dataSize > 4) {
        gpsEntryDataOffsets.push(currentDataPos);
        currentDataPos += entry.value.length;
      } else {
        gpsEntryDataOffsets.push(-1);
      }
    }
    (gpsIfdEntries as any).__dataOffsets = gpsEntryDataOffsets;
  }

  // Build TIFF data
  const tiffSize = currentDataPos;
  const tiff = Buffer.alloc(tiffSize);

  // TIFF header
  tiff.writeUInt16LE(0x4949, 0); // Little endian
  tiff.writeUInt16LE(0x002A, 2); // TIFF magic
  tiff.writeUInt32LE(8, 4); // Offset to IFD0

  // IFD0
  let pos = 8;
  tiff.writeUInt16LE(ifd0EntryCount, pos);
  pos += 2;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    tiff.writeUInt16LE(entry.tag, pos);
    tiff.writeUInt16LE(entry.type, pos + 2);
    tiff.writeUInt32LE(entry.count, pos + 4);

    const dataSize = getDataSize(entry.type, entry.count);

    if (entry.tag === 0x8769 && hasExifSubIfd) {
      tiff.writeUInt32LE(exifSubIfdPos, pos + 8);
    } else if (entry.tag === 0x8825 && hasGpsIfd) {
      tiff.writeUInt32LE(gpsIfdPos, pos + 8);
    } else if (dataSize <= 4) {
      entry.value.copy(tiff, pos + 8, 0, Math.min(entry.value.length, 4));
    } else {
      tiff.writeUInt32LE(entryDataOffsets[i]!, pos + 8);
    }
    pos += 12;
  }
  tiff.writeUInt32LE(0, pos); // Next IFD = 0 (no more IFDs)
  pos += 4;

  // Write data blocks for IFD0
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const offset = entryDataOffsets[i]!;
    if (offset >= 0 && entry.tag !== 0x8769 && entry.tag !== 0x8825) {
      entry.value.copy(tiff, offset);
    }
  }

  // Write EXIF sub-IFD
  if (hasExifSubIfd) {
    const offsets = (exifSubIfdEntries as any).__dataOffsets as number[];
    pos = exifSubIfdPos;
    tiff.writeUInt16LE(exifSubIfdEntries.length, pos);
    pos += 2;
    for (let i = 0; i < exifSubIfdEntries.length; i++) {
      const entry = exifSubIfdEntries[i]!;
      tiff.writeUInt16LE(entry.tag, pos);
      tiff.writeUInt16LE(entry.type, pos + 2);
      tiff.writeUInt32LE(entry.count, pos + 4);
      const dataSize = getDataSize(entry.type, entry.count);
      if (dataSize <= 4) {
        entry.value.copy(tiff, pos + 8, 0, Math.min(entry.value.length, 4));
      } else {
        tiff.writeUInt32LE(offsets[i]!, pos + 8);
      }
      pos += 12;
    }
    tiff.writeUInt32LE(0, pos);
    // Write sub-IFD data
    for (let i = 0; i < exifSubIfdEntries.length; i++) {
      const offset = offsets[i]!;
      if (offset >= 0) {
        exifSubIfdEntries[i]!.value.copy(tiff, offset);
      }
    }
  }

  // Write GPS IFD
  if (hasGpsIfd) {
    const offsets = (gpsIfdEntries as any).__dataOffsets as number[];
    pos = gpsIfdPos;
    tiff.writeUInt16LE(gpsIfdEntries.length, pos);
    pos += 2;
    for (let i = 0; i < gpsIfdEntries.length; i++) {
      const entry = gpsIfdEntries[i]!;
      tiff.writeUInt16LE(entry.tag, pos);
      tiff.writeUInt16LE(entry.type, pos + 2);
      tiff.writeUInt32LE(entry.count, pos + 4);
      const dataSize = getDataSize(entry.type, entry.count);
      if (dataSize <= 4) {
        entry.value.copy(tiff, pos + 8, 0, Math.min(entry.value.length, 4));
      } else {
        tiff.writeUInt32LE(offsets[i]!, pos + 8);
      }
      pos += 12;
    }
    tiff.writeUInt32LE(0, pos);
    // Write GPS data blocks
    for (let i = 0; i < gpsIfdEntries.length; i++) {
      const offset = offsets[i]!;
      if (offset >= 0) {
        gpsIfdEntries[i]!.value.copy(tiff, offset);
      }
    }
  }

  // Wrap in JPEG: SOI + APP1 marker + EXIF header + TIFF data + EOI
  const exifHeader = Buffer.from('Exif\0\0', 'ascii');
  const app1Length = 2 + exifHeader.length + tiff.length;
  const jpeg = Buffer.alloc(2 + 2 + 2 + exifHeader.length + tiff.length + 2);
  jpeg.writeUInt16BE(0xFFD8, 0); // SOI
  jpeg.writeUInt16BE(0xFFE1, 2); // APP1 marker
  jpeg.writeUInt16BE(app1Length, 4); // APP1 length
  exifHeader.copy(jpeg, 6);
  tiff.copy(jpeg, 12);
  jpeg.writeUInt16BE(0xFFD9, jpeg.length - 2); // EOI

  return jpeg;
}

function getDataSize(type: number, count: number): number {
  const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  return (typeSizes[type] ?? 1) * count;
}

describe('ExifParser', () => {
  const parser = new ExifParser();

  it('canParse returns true for directory containing image files', () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'exif-test-'));
    writeFileSync(join(tmpDir, 'photo.jpg'), Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]));
    expect(parser.canParse(tmpDir)).toBe(true);
  });

  it('extracts GPS coordinates from EXIF data', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'exif-test-'));
    const jpeg = buildTestJpeg({
      gpsLat: { degrees: 40, minutes: 41, seconds: 21.12, ref: 'N' },
      gpsLon: { degrees: 74, minutes: 2, seconds: 40.20, ref: 'W' },
    });
    writeFileSync(join(tmpDir, 'nyc.jpg'), jpeg);

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    const meta = result.items[0]!.metadata;
    expect(meta.gpsLatitude).toBeCloseTo(40.689, 1);
    expect(meta.gpsLongitude).toBeCloseTo(-74.044, 1);
  });

  it('extracts timestamp and camera model from EXIF data', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'exif-test-'));
    const jpeg = buildTestJpeg({
      make: 'Canon',
      model: 'EOS R5',
      dateTime: '2024:06:15 14:30:00',
    });
    writeFileSync(join(tmpDir, 'portrait.jpg'), jpeg);

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    const meta = result.items[0]!.metadata;
    expect(meta.make).toBe('Canon');
    expect(meta.model).toBe('EOS R5');
    expect(meta.dateTimeOriginal).toBe('2024:06:15 14:30:00');
  });

  it('content field contains text description, never raw image data', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'exif-test-'));
    const jpeg = buildTestJpeg({
      make: 'Nikon',
      model: 'Z6',
      dateTime: '2024:03:10 09:15:00',
    });
    writeFileSync(join(tmpDir, 'landscape.jpg'), jpeg);

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    const content = result.items[0]!.content;
    expect(content).toContain('Photo:');
    expect(content).toContain('Nikon');
    expect(content).toContain('Z6');
    expect(result.items[0]!.id).toMatch(/^exif_/);
    // Content should never contain raw binary data
    expect(content.length).toBeLessThan(500);
  });
});
