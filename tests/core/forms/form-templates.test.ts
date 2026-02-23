/**
 * Step 21 — FormTemplateEngine tests.
 * Tests template retrieval, matching, and completeness.
 */

import { describe, it, expect } from 'vitest';
import { FormTemplateEngine } from '@semblance/core/forms/form-templates';

describe('FormTemplateEngine (Step 21)', () => {
  const engine = new FormTemplateEngine();

  it('all 4 templates defined and retrievable', () => {
    const templates = engine.getTemplates();
    expect(templates).toHaveLength(4);

    const ids = templates.map(t => t.id);
    expect(ids).toContain('expense-report');
    expect(ids).toContain('pto-request');
    expect(ids).toContain('w4');
    expect(ids).toContain('insurance-claim');
  });

  it('getTemplate returns correct template by ID', () => {
    const template = engine.getTemplate('expense-report');
    expect(template).not.toBeNull();
    expect(template!.name).toBe('Expense Report');
    expect(template!.category).toBe('employment');
  });

  it('matchTemplate identifies expense report by field patterns', () => {
    const fieldNames = ['employee_name', 'department', 'date', 'amount', 'description'];
    const match = engine.matchTemplate(fieldNames);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('expense-report');
  });

  it('matchTemplate returns null for unknown form', () => {
    const fieldNames = ['xyzzy', 'foobar', 'bazquux'];
    const match = engine.matchTemplate(fieldNames);
    expect(match).toBeNull();
  });

  it('each template has expectedProcessingDays', () => {
    const templates = engine.getTemplates();
    for (const t of templates) {
      expect(t.expectedProcessingDays).toBeGreaterThan(0);
    }
  });
});
