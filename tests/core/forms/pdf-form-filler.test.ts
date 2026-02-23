/**
 * Step 21 — PDFFormFiller tests.
 * Tests field filling, checkbox handling, and preview mode.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PDFFormFiller } from '@semblance/core/forms/pdf-form-filler';
import type { ResolvedField, PDFFormField } from '@semblance/core/forms/types';

function makeField(overrides?: Partial<PDFFormField>): PDFFormField {
  return {
    name: 'testField',
    type: 'text',
    label: 'Test Field',
    page: 0,
    required: false,
    ...overrides,
  };
}

function makeResolved(field: PDFFormField, value: string | null, confidence: 'high' | 'medium' | 'low' = 'high'): ResolvedField {
  return { field, value, confidence, source: 'test' };
}

async function createPdfWithTextField(name: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  form.createTextField(name);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function createPdfWithCheckbox(name: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  const cb = form.createCheckBox(name);
  cb.addToPage(page, { x: 50, y: 300, width: 20, height: 20 });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function createPdfWithDropdown(name: string, options: string[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([600, 400]);
  const form = pdfDoc.getForm();
  const dd = form.createDropdown(name);
  dd.addOptions(options);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

describe('PDFFormFiller (Step 21)', () => {
  const filler = new PDFFormFiller();

  it('fills text fields in PDF buffer', async () => {
    const pdf = await createPdfWithTextField('fullName');
    const field = makeField({ name: 'fullName' });
    const resolved = makeResolved(field, 'John Smith');

    const filledBuffer = await filler.fillForm(pdf, [resolved]);
    expect(filledBuffer).toBeInstanceOf(Buffer);
    expect(filledBuffer.length).toBeGreaterThan(0);

    // Verify the value was actually set
    const doc = await PDFDocument.load(filledBuffer);
    const form = doc.getForm();
    const tf = form.getTextField('fullName');
    expect(tf.getText()).toBe('John Smith');
  });

  it('fills checkbox fields', async () => {
    const pdf = await createPdfWithCheckbox('agree');
    const field = makeField({ name: 'agree', type: 'checkbox' });
    const resolved = makeResolved(field, 'true');

    const filledBuffer = await filler.fillForm(pdf, [resolved]);
    const doc = await PDFDocument.load(filledBuffer);
    const form = doc.getForm();
    const cb = form.getCheckBox('agree');
    expect(cb.isChecked()).toBe(true);
  });

  it('fills dropdown fields', async () => {
    const pdf = await createPdfWithDropdown('state', ['CA', 'NY', 'TX']);
    const field = makeField({ name: 'state', type: 'dropdown' });
    const resolved = makeResolved(field, 'NY');

    const filledBuffer = await filler.fillForm(pdf, [resolved]);
    const doc = await PDFDocument.load(filledBuffer);
    const form = doc.getForm();
    const dd = form.getDropdown('state');
    expect(dd.getSelected()).toEqual(['NY']);
  });

  it('skips fields with no resolved value', async () => {
    const pdf = await createPdfWithTextField('fullName');
    const field = makeField({ name: 'fullName' });
    const resolved = makeResolved(field, null);

    const filledBuffer = await filler.fillForm(pdf, [resolved]);
    const doc = await PDFDocument.load(filledBuffer);
    const form = doc.getForm();
    const tf = form.getTextField('fullName');
    expect(tf.getText()).toBeUndefined();
  });

  it('preview mode returns field map without modifying PDF', () => {
    const field1 = makeField({ name: 'name' });
    const field2 = makeField({ name: 'ssn' });

    const resolved: ResolvedField[] = [
      makeResolved(field1, 'John', 'high'),
      { field: field2, value: null, confidence: 'high', source: 'safety-policy', requiresManualEntry: true },
    ];

    const preview = filler.previewFill(resolved);
    expect(preview.fields).toHaveLength(2);
    expect(preview.manualEntryCount).toBe(1);
    expect(preview.uncertainCount).toBe(0);
  });

  it('handles empty resolved fields array (returns original PDF)', async () => {
    const pdf = await createPdfWithTextField('test');
    const filledBuffer = await filler.fillForm(pdf, []);
    expect(filledBuffer).toBeInstanceOf(Buffer);
    expect(filledBuffer.length).toBeGreaterThan(0);
  });
});
