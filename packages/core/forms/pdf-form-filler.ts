// PDF Form Filler — Uses pdf-lib to write values into PDF form fields.
// Returns a filled PDF buffer. Does NOT save to disk — caller decides.
// CRITICAL: This file is in packages/core/. No network imports.

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import type { ResolvedField, FormFillPreview } from './types.js';

export class PDFFormFiller {
  /**
   * Fill a PDF with resolved field values. Returns the filled PDF as a Buffer.
   */
  async fillForm(pdfBuffer: Buffer, resolvedFields: ResolvedField[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();

    for (const resolved of resolvedFields) {
      if (!resolved.value || resolved.requiresManualEntry) continue;

      try {
        const pdfField = form.getField(resolved.field.name);

        if (pdfField instanceof PDFTextField) {
          pdfField.setText(resolved.value);
        } else if (pdfField instanceof PDFCheckBox) {
          if (resolved.value === 'true' || resolved.value === 'yes' || resolved.value === '1') {
            pdfField.check();
          } else {
            pdfField.uncheck();
          }
        } else if (pdfField instanceof PDFDropdown) {
          const options = pdfField.getOptions();
          if (options.includes(resolved.value)) {
            pdfField.select(resolved.value);
          }
        } else if (pdfField instanceof PDFRadioGroup) {
          const options = pdfField.getOptions();
          if (options.includes(resolved.value)) {
            pdfField.select(resolved.value);
          }
        }
      } catch {
        // Skip fields that can't be set — don't crash on partial fill
      }
    }

    const filledBytes = await pdfDoc.save();
    return Buffer.from(filledBytes);
  }

  /**
   * Generate a preview of what would be filled without modifying the PDF.
   */
  previewFill(resolvedFields: ResolvedField[]): FormFillPreview {
    let uncertainCount = 0;
    let manualEntryCount = 0;

    for (const resolved of resolvedFields) {
      if (resolved.requiresManualEntry) {
        manualEntryCount++;
      } else if (resolved.confidence === 'low' || resolved.value === null) {
        uncertainCount++;
      }
    }

    return {
      fields: resolvedFields,
      uncertainCount,
      manualEntryCount,
    };
  }
}
