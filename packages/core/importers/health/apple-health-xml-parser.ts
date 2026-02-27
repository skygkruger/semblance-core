/**
 * Apple Health XML Parser — Streaming parser for Apple Health export.xml files.
 *
 * Apple Health exports can be multiple gigabytes. This parser uses a streaming
 * line-by-line approach to extract <Record> elements without loading the entire
 * file into memory.
 *
 * Each <Record> element contains:
 * - type: The health metric type (e.g. "HKQuantityTypeIdentifierStepCount")
 * - value: The recorded value
 * - unit: The unit of measurement
 * - startDate: When the measurement started
 * - endDate: When the measurement ended
 * - sourceName: The app/device that recorded it
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 * CRITICAL: Never load the entire XML into memory. Use streaming only.
 */

import { createHash } from 'node:crypto';
import { rejectXmlEntities } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

/** Extract an XML attribute value from a tag string */
function extractAttr(tag: string, attr: string): string | null {
  // Match attr="value" or attr='value'
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = regex.exec(tag);
  if (match) return match[1] ?? null;

  const regexSingle = new RegExp(`${attr}='([^']*)'`, 'i');
  const matchSingle = regexSingle.exec(tag);
  return matchSingle ? (matchSingle[1] ?? null) : null;
}

/** Clean up Apple Health type identifiers to human-readable names */
function humanizeType(rawType: string): string {
  // "HKQuantityTypeIdentifierStepCount" -> "Step Count"
  // "HKCategoryTypeIdentifierSleepAnalysis" -> "Sleep Analysis"
  let cleaned = rawType
    .replace(/^HK(Quantity|Category|Correlation)TypeIdentifier/, '')
    .replace(/^HKDataType/, '');

  // Insert spaces before capitals: "StepCount" -> "Step Count"
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  return cleaned || rawType;
}

function deterministicId(type: string, startDate: string, sourceName: string): string {
  const input = `applehealth:${type}:${startDate}:${sourceName}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `ahx_${hash}`;
}

export class AppleHealthXmlParser implements ImportParser {
  readonly sourceType = 'health' as const;
  readonly supportedFormats = ['apple_health_xml'];

  canParse(path: string, data?: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();

    // Check filename
    if (normalized.endsWith('export.xml') || normalized.endsWith('apple_health_export/export.xml')) {
      return true;
    }

    // Check data hint for HealthData root element
    if (data) {
      return data.includes('<HealthData') || data.includes('<!DOCTYPE HealthData');
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    const items: ImportedItem[] = [];
    let totalFound = 0;

    const { createReadStream } = await import('node:fs');
    const { createInterface } = await import('node:readline');

    return new Promise<ImportResult>((resolve) => {
      let stream: ReturnType<typeof createReadStream>;
      try {
        stream = createReadStream(path, { encoding: 'utf-8', highWaterMark: 64 * 1024 });
      } catch (err) {
        resolve({
          format: 'apple_health_xml',
          items: [],
          errors: [{ message: `Failed to open file: ${(err as Error).message}` }],
          totalFound: 0,
        });
        return;
      }

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      // Buffer for multi-line Record elements
      let recordBuffer = '';
      let insideRecord = false;

      // XXE detection: accumulate first ~4KB of the stream for DOCTYPE ENTITY check
      let headerBuffer = '';
      let headerChecked = false;

      const processRecord = (tag: string): void => {
        totalFound++;

        // If limit reached, still count totalFound but don't process
        if (options?.limit && items.length >= options.limit) {
          return;
        }

        const type = extractAttr(tag, 'type');
        const value = extractAttr(tag, 'value');
        const unit = extractAttr(tag, 'unit');
        const startDate = extractAttr(tag, 'startDate');
        const endDate = extractAttr(tag, 'endDate');
        const sourceName = extractAttr(tag, 'sourceName');

        if (!type || !startDate) {
          errors.push({
            message: 'Record missing required type or startDate attribute',
            raw: tag.slice(0, 200),
          });
          return;
        }

        // Apply since filter
        if (options?.since) {
          try {
            const recordDate = new Date(startDate);
            if (recordDate < options.since) return;
          } catch {
            // If date can't be parsed, include the record
          }
        }

        const humanType = humanizeType(type);
        const displayValue = value && unit ? `${value} ${unit}` : value || 'N/A';

        items.push({
          id: deterministicId(type, startDate, sourceName || 'unknown'),
          sourceType: 'health',
          title: humanType,
          content: `${humanType}: ${displayValue} (${startDate})`,
          timestamp: new Date(startDate).toISOString(),
          metadata: {
            raw_type: type,
            value: value ? parseFloat(value) || value : null,
            unit: unit || null,
            start_date: startDate,
            end_date: endDate || null,
            source_name: sourceName || null,
            source_app: 'apple_health',
          },
        });
      };

      rl.on('line', (line: string) => {
        // XXE detection on first ~4KB of the file
        if (!headerChecked) {
          headerBuffer += line + '\n';
          if (headerBuffer.length >= 4096) {
            try {
              rejectXmlEntities(headerBuffer, path);
            } catch (err) {
              rl.close();
              stream.destroy();
              resolve({
                format: 'apple_health_xml',
                items: [],
                errors: [{ message: (err as Error).message }],
                totalFound: 0,
              });
              return;
            }
            headerChecked = true;
          }
        }

        const trimmed = line.trim();

        if (!insideRecord) {
          // Handle self-closing <Record ... /> on a single line
          const selfClosingMatch = /<Record\s.*?\/>/i.exec(trimmed);
          if (selfClosingMatch) {
            processRecord(selfClosingMatch[0]);
            return;
          }

          // Check for start of multi-line Record element
          // Match "<Record " (with attributes on same line) or "<Record" at end of line (attributes on next line)
          if (/<Record(\s|$)/i.test(trimmed)) {
            if (trimmed.includes('</Record>')) {
              // Single-line <Record ...>...</Record>
              const singleLineMatch = /(<Record\s[^>]*>)/i.exec(trimmed);
              if (singleLineMatch) {
                processRecord(singleLineMatch[1]!);
              }
            } else {
              // Start of multi-line record
              insideRecord = true;
              recordBuffer = trimmed;
            }
            return;
          }
        } else {
          // Inside a multi-line record — accumulate
          recordBuffer += ' ' + trimmed;

          if (trimmed.includes('/>') || trimmed.includes('</Record>')) {
            // Multi-line record complete — process the full buffered tag
            processRecord(recordBuffer);
            recordBuffer = '';
            insideRecord = false;
          }
        }
      });

      rl.on('close', () => {
        // Check XXE on remaining header buffer if file was smaller than 4KB
        if (!headerChecked && headerBuffer.length > 0) {
          try {
            rejectXmlEntities(headerBuffer, path);
          } catch (err) {
            resolve({
              format: 'apple_health_xml',
              items: [],
              errors: [{ message: (err as Error).message }],
              totalFound: 0,
            });
            return;
          }
        }

        // Sort by timestamp descending
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        resolve({
          format: 'apple_health_xml',
          items,
          errors,
          totalFound,
        });
      });

      rl.on('error', (err: Error) => {
        resolve({
          format: 'apple_health_xml',
          items,
          errors: [...errors, { message: `Stream error: ${err.message}` }],
          totalFound,
        });
      });

      stream.on('error', (err: Error) => {
        rl.close();
        resolve({
          format: 'apple_health_xml',
          items: [],
          errors: [{ message: `Failed to read file: ${err.message}` }],
          totalFound: 0,
        });
      });
    });
  }
}
