/**
 * FormFillFlow — Desktop form fill UI.
 * Drag/drop PDF or file picker, field preview with auto-filled values
 * (color-coded by confidence), edit fields, save filled PDF.
 * Free tier: "Activate your Digital Representative" prompt.
 * Bureaucracy tracking: submission list with status indicators.
 */

import React from 'react';
import type { ResolvedField, FormSubmission, FormTemplate } from '@semblance/core/forms/index';

// ─── Props Types ────────────────────────────────────────────────────────────

export interface FormFieldView {
  name: string;
  label: string;
  type: string;
  value: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  requiresManualEntry: boolean;
}

export interface FormFillFlowProps {
  isPremium: boolean;
  fields: FormFieldView[];
  submissions: FormSubmission[];
  templates: Array<{ id: string; name: string; description: string; category: string }>;
  hasXFA: boolean;
  onDropFile: (filePath: string) => void;
  onFillField: (fieldName: string, value: string) => void;
  onSaveFilledPdf: () => void;
  onSubmitForm: (formName: string) => void;
  onResolveSubmission: (submissionId: string) => void;
}

// ─── Confidence Color ───────────────────────────────────────────────────────

function getConfidenceColor(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high': return '#4ade80';    // green
    case 'medium': return '#facc15';  // yellow
    case 'low': return '#fb923c';     // orange
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'filled': return 'Filled';
    case 'submitted': return 'Submitted';
    case 'follow-up-sent': return 'Follow-up Sent';
    case 'resolved': return 'Resolved';
    case 'needs-attention': return 'Needs Attention';
    default: return status;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export const FormFillFlow: React.FC<FormFillFlowProps> = (props) => {
  if (!props.isPremium) {
    return (
      <div className="form-fill-free-tier">
        <h2>Digital Representative</h2>
        <p>Activate your Digital Representative to auto-fill forms, track submissions, and manage bureaucracy.</p>
      </div>
    );
  }

  return (
    <div className="form-fill-flow">
      <section className="form-fill-header">
        <h2>Form Automation</h2>
        <p>Drop a PDF form to detect fillable fields and auto-fill from your data.</p>
      </section>

      {props.hasXFA && (
        <div className="form-fill-xfa-warning">
          This PDF uses XFA form fields, which require manual entry. Standard AcroForm PDFs are fully supported.
        </div>
      )}

      {props.fields.length > 0 && (
        <section className="form-fill-fields">
          <h3>Detected Fields</h3>
          <ul>
            {props.fields.map((field) => (
              <li key={field.name} className="form-field-item">
                <span className="field-label">{field.label}</span>
                {field.requiresManualEntry ? (
                  <span className="field-manual">Manual entry required</span>
                ) : (
                  <span
                    className="field-value"
                    style={{ borderLeftColor: getConfidenceColor(field.confidence) }}
                  >
                    {field.value ?? 'Not resolved'}
                  </span>
                )}
                <span className="field-source">{field.source}</span>
              </li>
            ))}
          </ul>
          <button onClick={props.onSaveFilledPdf}>Save Filled PDF</button>
        </section>
      )}

      {props.submissions.length > 0 && (
        <section className="form-submissions">
          <h3>Submission Tracking</h3>
          <ul>
            {props.submissions.map((sub) => (
              <li key={sub.id} className="submission-item">
                <span className="submission-name">{sub.formName}</span>
                <span className="submission-status">{getStatusLabel(sub.status)}</span>
                {sub.status !== 'resolved' && (
                  <button onClick={() => props.onResolveSubmission(sub.id)}>
                    Mark Resolved
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
