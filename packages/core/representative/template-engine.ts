// Template Engine — 6 built-in customer service email templates.
// Templates define required/optional fields. Filling a template delegates
// to RepresentativeEmailDrafter for style-matched output.
// CRITICAL: This file is in packages/core/. No network imports.

import type { RepresentativeEmailDrafter } from './email-drafter.js';
import type { EmailTemplate, TemplateField, RepresentativeDraft, DraftType } from './types.js';

// ─── Built-in Templates ──────────────────────────────────────────────────────

const TEMPLATES: EmailTemplate[] = [
  {
    name: 'refund',
    label: 'Request Refund',
    description: 'Request a refund for a product or service.',
    draftType: 'refund',
    fields: [
      { name: 'companyName', label: 'Company', required: true, placeholder: 'e.g. Acme Corp' },
      { name: 'supportEmail', label: 'Support Email', required: true, placeholder: 'support@company.com' },
      { name: 'orderNumber', label: 'Order Number', required: false, placeholder: 'Optional' },
      { name: 'amount', label: 'Amount', required: false, placeholder: 'e.g. $49.99' },
      { name: 'reason', label: 'Reason', required: true, placeholder: 'Why are you requesting a refund?' },
    ],
  },
  {
    name: 'billing',
    label: 'Billing Inquiry',
    description: 'Dispute or ask about a charge on your account.',
    draftType: 'billing',
    fields: [
      { name: 'companyName', label: 'Company', required: true },
      { name: 'supportEmail', label: 'Support Email', required: true },
      { name: 'chargeDate', label: 'Charge Date', required: false, placeholder: 'When the charge appeared' },
      { name: 'amount', label: 'Amount', required: false },
      { name: 'question', label: 'Question', required: true, placeholder: 'What do you need to know?' },
    ],
  },
  {
    name: 'cancellation',
    label: 'Cancel Subscription',
    description: 'Cancel a subscription or recurring service.',
    draftType: 'cancellation',
    fields: [
      { name: 'companyName', label: 'Company', required: true },
      { name: 'supportEmail', label: 'Support Email', required: true },
      { name: 'accountEmail', label: 'Your Account Email', required: false },
      { name: 'reason', label: 'Reason', required: false, placeholder: 'Optional reason for cancellation' },
    ],
  },
  {
    name: 'inquiry',
    label: 'General Inquiry',
    description: 'Ask a general question to a company or service.',
    draftType: 'inquiry',
    fields: [
      { name: 'companyName', label: 'Company', required: true },
      { name: 'supportEmail', label: 'Support Email', required: true },
      { name: 'topic', label: 'Topic', required: true, placeholder: 'What is your question about?' },
      { name: 'details', label: 'Details', required: true, placeholder: 'Provide details for your question' },
    ],
  },
  {
    name: 'escalation',
    label: 'Escalate Issue',
    description: 'Escalate an unresolved issue to a supervisor or manager.',
    draftType: 'escalation',
    fields: [
      { name: 'companyName', label: 'Company', required: true },
      { name: 'supportEmail', label: 'Support Email', required: true },
      { name: 'caseNumber', label: 'Case/Ticket Number', required: false },
      { name: 'previousContact', label: 'Previous Contact', required: true, placeholder: 'When/who did you last contact?' },
      { name: 'issue', label: 'Issue', required: true, placeholder: 'Describe the unresolved issue' },
    ],
  },
  {
    name: 'warranty',
    label: 'Warranty Claim',
    description: 'File a warranty or product replacement claim.',
    draftType: 'warranty',
    fields: [
      { name: 'companyName', label: 'Company', required: true },
      { name: 'supportEmail', label: 'Support Email', required: true },
      { name: 'productName', label: 'Product Name', required: true },
      { name: 'purchaseDate', label: 'Purchase Date', required: false },
      { name: 'issue', label: 'Issue', required: true, placeholder: 'What is wrong with the product?' },
    ],
  },
];

// ─── Template Engine ─────────────────────────────────────────────────────────

export class TemplateEngine {
  private emailDrafter: RepresentativeEmailDrafter;
  private templates: Map<string, EmailTemplate>;

  constructor(emailDrafter: RepresentativeEmailDrafter) {
    this.emailDrafter = emailDrafter;
    this.templates = new Map();
    for (const t of TEMPLATES) {
      this.templates.set(t.name, t);
    }
  }

  /**
   * Get all available templates.
   */
  getTemplates(): EmailTemplate[] {
    return [...this.templates.values()];
  }

  /**
   * Get a specific template by name.
   */
  getTemplate(name: string): EmailTemplate | null {
    return this.templates.get(name) ?? null;
  }

  /**
   * Validate that all required fields are provided.
   */
  validateFields(name: string, fields: Record<string, string>): { valid: boolean; missing: string[] } {
    const template = this.templates.get(name);
    if (!template) return { valid: false, missing: ['template not found'] };

    const missing = template.fields
      .filter(f => f.required && (!fields[f.name] || fields[f.name]!.trim() === ''))
      .map(f => f.name);

    return { valid: missing.length === 0, missing };
  }

  /**
   * Fill a template with the provided fields and generate a style-matched draft.
   */
  async fillTemplate(
    name: string,
    fields: Record<string, string>,
    to: string,
  ): Promise<RepresentativeDraft | null> {
    const template = this.templates.get(name);
    if (!template) return null;

    const validation = this.validateFields(name, fields);
    if (!validation.valid) return null;

    // Build intent from template fields
    const intentParts: string[] = [];
    for (const field of template.fields) {
      const value = fields[field.name];
      if (value && value.trim()) {
        intentParts.push(`${field.label}: ${value}`);
      }
    }

    const subject = buildSubject(template, fields);

    return this.emailDrafter.draftEmail({
      to,
      subject,
      intent: intentParts.join('. '),
      draftType: template.draftType,
      additionalContext: `This is a ${template.label.toLowerCase()} email.`,
    });
  }
}

function buildSubject(template: EmailTemplate, fields: Record<string, string>): string {
  const company = fields['companyName'] ?? 'Your Company';

  switch (template.name) {
    case 'refund':
      return `Refund Request — ${company}`;
    case 'billing':
      return `Billing Inquiry — ${company}`;
    case 'cancellation':
      return `Cancel Subscription — ${company}`;
    case 'inquiry':
      return `Inquiry — ${company}`;
    case 'escalation':
      return `Issue Escalation — ${company}`;
    case 'warranty':
      return `Warranty Claim — ${company}`;
    default:
      return `${template.label} — ${company}`;
  }
}
