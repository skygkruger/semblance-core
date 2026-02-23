/**
 * FormScreen — Mobile-adapted form fill + bureaucracy tracking.
 * File picker (no drag/drop on mobile), field list view, save filled PDF.
 */

import React from 'react';
import type { FormSubmission } from '@semblance/core/forms/index';

// ─── Props Types ────────────────────────────────────────────────────────────

export interface MobileFormField {
  name: string;
  label: string;
  type: string;
  value: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  requiresManualEntry: boolean;
}

export interface MobileFormTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface FormScreenProps {
  isPremium: boolean;
  fields: MobileFormField[];
  submissions: FormSubmission[];
  templates: MobileFormTemplate[];
  hasXFA: boolean;
  onPickFile: () => void;
  onFillField: (fieldName: string, value: string) => void;
  onSaveFilledPdf: () => void;
  onSubmitForm: (formName: string) => void;
  onResolveSubmission: (submissionId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const FormScreen: React.FC<FormScreenProps> = (props) => {
  if (!props.isPremium) {
    return (
      <div className="form-screen-free-tier">
        <h2>Digital Representative</h2>
        <p>Activate your Digital Representative to auto-fill forms and track submissions.</p>
      </div>
    );
  }

  return (
    <div className="form-screen">
      <section className="form-screen-header">
        <h2>Form Automation</h2>
        <button onClick={props.onPickFile}>Select PDF</button>
      </section>

      {props.hasXFA && (
        <div className="form-xfa-notice">
          This PDF uses XFA fields. Manual entry required.
        </div>
      )}

      {props.fields.length > 0 && (
        <section className="form-field-list">
          <h3>Fields</h3>
          {props.fields.map((field) => (
            <div key={field.name} className="form-field-row">
              <span className="field-label">{field.label}</span>
              {field.requiresManualEntry ? (
                <span className="field-manual">Manual entry required</span>
              ) : (
                <span className={`field-value confidence-${field.confidence}`}>
                  {field.value ?? '—'}
                </span>
              )}
            </div>
          ))}
          <button onClick={props.onSaveFilledPdf}>Save Filled PDF</button>
        </section>
      )}

      {props.submissions.length > 0 && (
        <section className="form-submissions-list">
          <h3>Submissions</h3>
          {props.submissions.map((sub) => (
            <div key={sub.id} className="submission-row">
              <span>{sub.formName}</span>
              <span>{sub.status}</span>
              {sub.status !== 'resolved' && (
                <button onClick={() => props.onResolveSubmission(sub.id)}>
                  Resolve
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
