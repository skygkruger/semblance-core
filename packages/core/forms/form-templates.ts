// Form Templates — Built-in field mapping definitions for common forms.
// Templates are NOT pre-filled PDFs — they are field mapping rules that tell
// the auto-filler how to map a form's fields to knowledge graph data.
// CRITICAL: This file is in packages/core/. No network imports.

import type { FormTemplate } from './types.js';

// ─── Built-in Templates ─────────────────────────────────────────────────────

const BUILT_IN_TEMPLATES: FormTemplate[] = [
  {
    id: 'expense-report',
    name: 'Expense Report',
    description: 'Employee expense report for reimbursement.',
    category: 'employment',
    expectedProcessingDays: 14,
    followUpMessage: 'Your expense report was submitted {days} days ago. Expected processing: 14 days.',
    fieldMappings: [
      { fieldPattern: 'employee.*name|name', dataSource: 'name' },
      { fieldPattern: 'department|dept', dataSource: 'department' },
      { fieldPattern: 'date|today|submission', dataSource: 'current_date' },
      { fieldPattern: 'manager|supervisor', dataSource: 'manager' },
      { fieldPattern: 'amount|total|sum', dataSource: 'amount' },
      { fieldPattern: 'description|purpose|reason', dataSource: 'description' },
      { fieldPattern: 'email', dataSource: 'email' },
    ],
  },
  {
    id: 'pto-request',
    name: 'PTO Request',
    description: 'Paid time off or vacation request.',
    category: 'employment',
    expectedProcessingDays: 3,
    followUpMessage: 'Your PTO request was submitted {days} days ago. Expected processing: 3 days.',
    fieldMappings: [
      { fieldPattern: 'employee.*name|name', dataSource: 'name' },
      { fieldPattern: 'start.*date|from.*date|begin', dataSource: 'start_date' },
      { fieldPattern: 'end.*date|to.*date|return', dataSource: 'end_date' },
      { fieldPattern: 'hours|total.*hours', dataSource: 'hours' },
      { fieldPattern: 'reason|type|category', dataSource: 'pto_reason' },
      { fieldPattern: 'department|dept', dataSource: 'department' },
      { fieldPattern: 'manager|supervisor|approver', dataSource: 'manager' },
    ],
  },
  {
    id: 'w4',
    name: 'W-4 (Employee Withholding)',
    description: "Employee's Withholding Certificate for federal income tax.",
    category: 'government',
    expectedProcessingDays: 1,
    followUpMessage: 'Your W-4 was submitted. Your employer should process it within the next pay period.',
    fieldMappings: [
      { fieldPattern: 'name|first.*name.*last|full.*name', dataSource: 'name' },
      { fieldPattern: 'address|street', dataSource: 'address' },
      { fieldPattern: 'city|town', dataSource: 'city' },
      { fieldPattern: 'state', dataSource: 'state' },
      { fieldPattern: 'zip|postal', dataSource: 'zip' },
      { fieldPattern: 'filing.*status|marital', dataSource: 'filing_status' },
      // SSN is deliberately NOT mapped — safety invariant
    ],
  },
  {
    id: 'insurance-claim',
    name: 'Insurance Claim',
    description: 'File an insurance claim for damages, medical expenses, or losses.',
    category: 'insurance',
    expectedProcessingDays: 30,
    followUpMessage: 'Your insurance claim was submitted {days} days ago. Expected processing: 30 days.',
    fieldMappings: [
      { fieldPattern: 'policy.*number|policy.*id|policy.*#', dataSource: 'policy_number' },
      { fieldPattern: 'claimant|insured|name', dataSource: 'name' },
      { fieldPattern: 'date.*incident|date.*loss|incident.*date', dataSource: 'incident_date' },
      { fieldPattern: 'description|details|incident', dataSource: 'incident_description' },
      { fieldPattern: 'amount|claim.*amount|total', dataSource: 'claim_amount' },
      { fieldPattern: 'phone|contact', dataSource: 'phone' },
      { fieldPattern: 'email', dataSource: 'email' },
      { fieldPattern: 'address', dataSource: 'address' },
    ],
  },
];

// ─── Template Engine ────────────────────────────────────────────────────────

export class FormTemplateEngine {
  /**
   * Get all available templates.
   */
  getTemplates(): FormTemplate[] {
    return [...BUILT_IN_TEMPLATES];
  }

  /**
   * Get a template by ID.
   */
  getTemplate(id: string): FormTemplate | null {
    return BUILT_IN_TEMPLATES.find(t => t.id === id) ?? null;
  }

  /**
   * Match a set of field names against known templates.
   * Returns the best match, or null if no template matches.
   */
  matchTemplate(fieldNames: string[]): FormTemplate | null {
    const normalizedNames = fieldNames.map(n => n.toLowerCase());
    let bestMatch: FormTemplate | null = null;
    let bestScore = 0;

    for (const template of BUILT_IN_TEMPLATES) {
      let matchCount = 0;
      for (const mapping of template.fieldMappings) {
        const pattern = new RegExp(mapping.fieldPattern, 'i');
        if (normalizedNames.some(name => pattern.test(name))) {
          matchCount++;
        }
      }

      const score = matchCount / template.fieldMappings.length;
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = template;
      }
    }

    return bestMatch;
  }
}
