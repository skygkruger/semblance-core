// Form & Bureaucracy Automation Types — Shared types for PDF field detection,
// auto-fill from knowledge graph, LLM smart field mapping, form templates,
// and bureaucracy tracking with follow-up reminders.
// CRITICAL: This file is in packages/core/. No network imports.

// ─── PDF Form Field Types ───────────────────────────────────────────────────

export type PDFFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'date' | 'signature';

export interface PDFFormField {
  name: string;
  type: PDFFieldType;
  label: string;
  page: number;
  required: boolean;
  currentValue?: string;
  options?: string[];
  maxLength?: number;
}

export interface PDFFormAnalysis {
  filePath: string;
  fileName: string;
  fieldCount: number;
  fields: PDFFormField[];
  hasXFA: boolean;
  isAcroForm: boolean;
}

// ─── Auto-Fill Types ────────────────────────────────────────────────────────

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface ResolvedField {
  field: PDFFormField;
  value: string | null;
  confidence: FieldConfidence;
  source: string;
  requiresManualEntry?: boolean;
}

// ─── Form Template Types ────────────────────────────────────────────────────

export type FormCategory = 'employment' | 'financial' | 'insurance' | 'government';

export interface FormFieldMapping {
  fieldPattern: string;
  dataSource: string;
  transform?: string;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  category: FormCategory;
  fieldMappings: FormFieldMapping[];
  expectedProcessingDays: number;
  followUpMessage?: string;
}

// ─── Form Fill Types ────────────────────────────────────────────────────────

export interface FormFillRequest {
  filePath: string;
  templateId?: string;
  overrides?: Record<string, string>;
}

export interface FormFillPreview {
  fields: ResolvedField[];
  uncertainCount: number;
  manualEntryCount: number;
  templateMatch?: string;
}

export interface FormFillResult {
  id: string;
  filePath: string;
  fileName: string;
  resolvedFields: ResolvedField[];
  filledPdfBuffer: Buffer | null;
  preview: FormFillPreview;
  templateId?: string;
  createdAt: string;
}

// ─── Bureaucracy Tracking Types ─────────────────────────────────────────────

export type FormSubmissionStatus =
  | 'filled'
  | 'submitted'
  | 'follow-up-sent'
  | 'resolved'
  | 'needs-attention';

export interface FormSubmission {
  id: string;
  formName: string;
  templateId?: string;
  filledAt: string;
  submittedAt?: string;
  expectedResponseDays: number;
  status: FormSubmissionStatus;
  notes?: string;
}
