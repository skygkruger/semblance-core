// PDF Field Detector — Detects fillable fields in PDF forms using pdf-lib.
// Supports AcroForm fields. XFA forms are detected and flagged (not parsed).
// CRITICAL: This file is in packages/core/. No network imports.

import { PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFName, PDFDict } from 'pdf-lib';
import type { PDFFormField, PDFFormAnalysis, PDFFieldType } from './types.js';

export class PDFFieldDetector {
  /**
   * Analyze a PDF buffer for fillable form fields.
   * Returns field metadata for AcroForm PDFs. XFA forms are flagged but not parsed.
   */
  async analyzeForm(pdfBuffer: Buffer, filePath: string, fileName: string): Promise<PDFFormAnalysis> {
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    } catch {
      return {
        filePath,
        fileName,
        fieldCount: 0,
        fields: [],
        hasXFA: false,
        isAcroForm: false,
      };
    }

    // Check for XFA
    const hasXFA = this.detectXFA(pdfDoc);

    // Extract AcroForm fields
    const form = pdfDoc.getForm();
    const rawFields = form.getFields();

    if (rawFields.length === 0) {
      return {
        filePath,
        fileName,
        fieldCount: 0,
        fields: [],
        hasXFA,
        isAcroForm: false,
      };
    }

    const fields: PDFFormField[] = [];

    for (const rawField of rawFields) {
      const name = rawField.getName();
      const fieldType = this.getFieldType(rawField);

      const field: PDFFormField = {
        name,
        type: fieldType,
        label: this.extractLabel(name),
        page: 0,
        required: rawField.isRequired(),
      };

      // Extract type-specific data
      if (rawField instanceof PDFTextField) {
        const text = rawField.getText();
        if (text) field.currentValue = text;
        const maxLen = rawField.getMaxLength();
        if (maxLen !== undefined) field.maxLength = maxLen;
      } else if (rawField instanceof PDFCheckBox) {
        field.currentValue = rawField.isChecked() ? 'true' : 'false';
      } else if (rawField instanceof PDFDropdown) {
        field.options = rawField.getOptions();
        const selected = rawField.getSelected();
        if (selected.length > 0) field.currentValue = selected[0];
      } else if (rawField instanceof PDFRadioGroup) {
        field.options = rawField.getOptions();
        const selected = rawField.getSelected();
        if (selected) field.currentValue = selected;
      }

      fields.push(field);
    }

    return {
      filePath,
      fileName,
      fieldCount: fields.length,
      fields,
      hasXFA,
      isAcroForm: true,
    };
  }

  /**
   * Detect XFA presence in a PDF document.
   */
  private detectXFA(pdfDoc: PDFDocument): boolean {
    try {
      const catalog = pdfDoc.catalog;
      const acroFormRef = catalog.get(PDFName.of('AcroForm'));
      if (!acroFormRef) return false;
      const acroForm = catalog.lookup(acroFormRef as PDFName) as unknown;
      if (acroForm && typeof acroForm === 'object' && 'has' in acroForm) {
        return (acroForm as PDFDict).has(PDFName.of('XFA'));
      }
    } catch {
      // If we can't check, assume no XFA
    }
    return false;
  }

  /**
   * Map pdf-lib field type to our field type enum.
   */
  private getFieldType(field: unknown): PDFFieldType {
    if (field instanceof PDFTextField) return 'text';
    if (field instanceof PDFCheckBox) return 'checkbox';
    if (field instanceof PDFRadioGroup) return 'radio';
    if (field instanceof PDFDropdown) return 'dropdown';
    return 'text';
  }

  /**
   * Extract a human-readable label from a field name.
   * Handles common naming patterns: camelCase, snake_case, dot.notation.
   */
  private extractLabel(name: string): string {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }
}
