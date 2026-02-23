/**
 * Step 21 — PDF Field Detector tests.
 * Tests AcroForm field detection, XFA detection, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib';
import { PDFFieldDetector } from '@semblance/core/forms/pdf-field-detector';

async function createTestPdfWithFields(fields: Array<{ name: string; type: 'text' | 'checkbox' | 'dropdown'; options?: string[] }>): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();

  for (const f of fields) {
    if (f.type === 'text') {
      form.createTextField(f.name);
    } else if (f.type === 'checkbox') {
      form.createCheckBox(f.name);
    } else if (f.type === 'dropdown') {
      const dropdown = form.createDropdown(f.name);
      if (f.options) dropdown.addOptions(f.options);
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function createEmptyPdf(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

describe('PDFFieldDetector (Step 21)', () => {
  const detector = new PDFFieldDetector();

  it('detects text fields from AcroForm PDF', async () => {
    const pdf = await createTestPdfWithFields([
      { name: 'fullName', type: 'text' },
      { name: 'emailAddress', type: 'text' },
    ]);

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.isAcroForm).toBe(true);
    expect(analysis.fieldCount).toBe(2);
    expect(analysis.fields[0]!.type).toBe('text');
    expect(analysis.fields[0]!.name).toBe('fullName');
  });

  it('detects checkbox fields', async () => {
    const pdf = await createTestPdfWithFields([
      { name: 'agreeToTerms', type: 'checkbox' },
    ]);

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.fields[0]!.type).toBe('checkbox');
    expect(analysis.fields[0]!.name).toBe('agreeToTerms');
  });

  it('detects dropdown fields with options', async () => {
    const pdf = await createTestPdfWithFields([
      { name: 'state', type: 'dropdown', options: ['CA', 'NY', 'TX'] },
    ]);

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.fields[0]!.type).toBe('dropdown');
    expect(analysis.fields[0]!.options).toEqual(['CA', 'NY', 'TX']);
  });

  it('handles PDF with no form fields (returns empty)', async () => {
    const pdf = await createEmptyPdf();

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.fieldCount).toBe(0);
    expect(analysis.fields).toHaveLength(0);
    expect(analysis.isAcroForm).toBe(false);
  });

  it('sets hasXFA to false for standard AcroForm PDFs', async () => {
    const pdf = await createTestPdfWithFields([{ name: 'test', type: 'text' }]);
    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.hasXFA).toBe(false);
  });

  it('extracts field names and labels correctly', async () => {
    const pdf = await createTestPdfWithFields([
      { name: 'firstName', type: 'text' },
      { name: 'last_name', type: 'text' },
    ]);

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    // camelCase → spaced
    expect(analysis.fields[0]!.label).toBe('First Name');
    // snake_case → spaced
    expect(analysis.fields[1]!.label).toBe('Last name');
  });

  it('reports required vs optional fields', async () => {
    // pdf-lib createTextField defaults to not required
    const pdf = await createTestPdfWithFields([
      { name: 'optional_field', type: 'text' },
    ]);

    const analysis = await detector.analyzeForm(pdf, '/test/form.pdf', 'form.pdf');
    expect(analysis.fields[0]!.required).toBe(false);
  });

  it('handles corrupted/invalid PDF gracefully (error, not crash)', async () => {
    const badBuffer = Buffer.from('not a pdf at all');
    const analysis = await detector.analyzeForm(badBuffer, '/test/bad.pdf', 'bad.pdf');
    expect(analysis.fieldCount).toBe(0);
    expect(analysis.fields).toHaveLength(0);
    expect(analysis.isAcroForm).toBe(false);
  });
});
