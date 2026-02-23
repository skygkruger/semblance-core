/**
 * TemplatePicker — Customer service email template selection and field form.
 * Shows 6 template cards, field form for selected template, and draft preview.
 */

import React, { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateCard {
  name: string;
  label: string;
  description: string;
  fieldCount: number;
}

export interface TemplateFieldDef {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface TemplatePickerProps {
  templates: TemplateCard[];
  selectedTemplate: string | null;
  fields: TemplateFieldDef[];
  fieldValues: Record<string, string>;
  onSelectTemplate: (name: string) => void;
  onFieldChange: (name: string, value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TemplatePicker({
  templates,
  selectedTemplate,
  fields,
  fieldValues,
  onSelectTemplate,
  onFieldChange,
  onSubmit,
  isSubmitting,
}: TemplatePickerProps) {
  return (
    <div data-testid="template-picker" className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">
        Customer Service Templates
      </h2>
      <p className="text-sm text-muted-foreground">
        Your Digital Representative will draft the email in your writing style.
      </p>

      {/* Template Cards */}
      <div data-testid="template-cards" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {templates.map(t => (
          <button
            key={t.name}
            onClick={() => onSelectTemplate(t.name)}
            className={`p-4 border rounded-lg text-left transition-colors ${
              selectedTemplate === t.name
                ? 'border-accent bg-accent/10'
                : 'hover:border-accent/50'
            }`}
            data-testid={`template-${t.name}`}
          >
            <p className="font-medium text-foreground">{t.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Field Form */}
      {selectedTemplate && fields.length > 0 && (
        <div data-testid="template-form" className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">
            {templates.find(t => t.name === selectedTemplate)?.label ?? selectedTemplate}
          </h3>
          {fields.map(field => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-foreground mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              <input
                type="text"
                value={fieldValues[field.name] ?? ''}
                onChange={(e) => onFieldChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-background text-foreground"
                data-testid={`field-${field.name}`}
              />
            </div>
          ))}
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
            data-testid="template-submit"
          >
            {isSubmitting ? 'Drafting...' : 'Draft Email'}
          </button>
        </div>
      )}
    </div>
  );
}
