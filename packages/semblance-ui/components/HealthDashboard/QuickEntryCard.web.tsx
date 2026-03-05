import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import type { HealthEntry } from './HealthDashboard.types';
import './QuickEntryCard.css';

interface QuickEntryCardProps {
  todayEntry: HealthEntry | null;
  symptomsHistory: string[];
  medicationsHistory: string[];
  onSave: (entry: Partial<HealthEntry> & { date: string }) => void;
}

const SCALE_POINTS = [1, 2, 3, 4, 5] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QuickEntryCard({ todayEntry, symptomsHistory, medicationsHistory, onSave }: QuickEntryCardProps) {
  const [mood, setMood] = useState<number | null>(todayEntry?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(todayEntry?.energy ?? null);
  const [water, setWater] = useState<number>(todayEntry?.waterGlasses ?? 0);
  const [symptoms, setSymptoms] = useState<string[]>(todayEntry?.symptoms ?? []);
  const [medications, setMedications] = useState<string[]>(todayEntry?.medications ?? []);
  const [symptomInput, setSymptomInput] = useState('');
  const [symptomDropdownOpen, setSymptomDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const symptomWrapRef = useRef<HTMLDivElement>(null);

  const hasData = mood !== null || energy !== null || water > 0 || symptoms.length > 0 || medications.length > 0;

  const handleSave = useCallback(() => {
    if (!hasData || saving) return;
    setSaving(true);
    onSave({
      date: todayISO(),
      mood,
      energy,
      waterGlasses: water,
      symptoms,
      medications,
    });
    setSaving(false);
  }, [hasData, saving, mood, energy, water, symptoms, medications, onSave]);

  const handleSymptomKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && symptomInput.trim()) {
      e.preventDefault();
      const trimmed = symptomInput.trim();
      if (!symptoms.includes(trimmed)) {
        setSymptoms((prev) => [...prev, trimmed]);
      }
      setSymptomInput('');
    }
  }, [symptomInput, symptoms]);

  const removeSymptom = useCallback((s: string) => {
    setSymptoms((prev) => prev.filter((x) => x !== s));
  }, []);

  const toggleMedication = useCallback((med: string) => {
    setMedications((prev) =>
      prev.includes(med) ? prev.filter((m) => m !== med) : [...prev, med],
    );
  }, []);

  const addSymptom = useCallback((s: string) => {
    const trimmed = s.trim();
    if (trimmed && !symptoms.includes(trimmed)) {
      setSymptoms((prev) => [...prev, trimmed]);
    }
    setSymptomInput('');
    setSymptomDropdownOpen(false);
  }, [symptoms]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (symptomWrapRef.current && !symptomWrapRef.current.contains(e.target as Node)) {
        setSymptomDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuggestions = symptomsHistory.filter(
    (s) => !symptoms.includes(s) && (!symptomInput || s.toLowerCase().includes(symptomInput.toLowerCase())),
  );

  return (
    <div className="quick-entry">
      <h3 className="quick-entry__title">
        {todayEntry ? 'Today\u2019s Check-In (Updated)' : 'Daily Check-In'}
      </h3>

      <div className="quick-entry__row">
        <span className="quick-entry__label">Mood</span>
        <div className="quick-entry__scale" role="radiogroup" aria-label="Mood scale">
          {SCALE_POINTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`quick-entry__scale-dot ${mood === n ? `quick-entry__scale-dot--active quick-entry__scale-dot--v${n}` : ''}`}
              onClick={() => setMood(n)}
              aria-label={`Mood ${n}`}
              aria-pressed={mood === n}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-entry__row">
        <span className="quick-entry__label">Energy</span>
        <div className="quick-entry__scale" role="radiogroup" aria-label="Energy scale">
          {SCALE_POINTS.map((n) => (
            <button
              key={n}
              type="button"
              className={`quick-entry__scale-dot ${energy === n ? `quick-entry__scale-dot--active quick-entry__scale-dot--v${n}` : ''}`}
              onClick={() => setEnergy(n)}
              aria-label={`Energy ${n}`}
              aria-pressed={energy === n}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-entry__row">
        <span className="quick-entry__label">Water</span>
        <div className="quick-entry__water">
          <button
            type="button"
            className="quick-entry__water-btn"
            onClick={() => setWater((w) => Math.max(0, w - 1))}
            aria-label="Decrease water"
          >
            -
          </button>
          <span className="quick-entry__water-count">{water}</span>
          <button
            type="button"
            className="quick-entry__water-btn"
            onClick={() => setWater((w) => w + 1)}
            aria-label="Increase water"
          >
            +
          </button>
          <span className="quick-entry__water-unit">glasses</span>
        </div>
      </div>

      <div className="quick-entry__row">
        <span className="quick-entry__label">Symptoms</span>
        <div className="quick-entry__symptom-wrap" ref={symptomWrapRef}>
          <div className="quick-entry__tags">
            {symptoms.map((s) => (
              <span key={s} className="quick-entry__tag">
                {s}
                <button
                  type="button"
                  className="quick-entry__tag-remove"
                  onClick={() => removeSymptom(s)}
                  aria-label={`Remove ${s}`}
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              className="quick-entry__tag-input"
              placeholder="Add symptom..."
              value={symptomInput}
              onChange={(e) => { setSymptomInput(e.target.value); setSymptomDropdownOpen(true); }}
              onKeyDown={handleSymptomKeyDown}
              onFocus={() => setSymptomDropdownOpen(true)}
            />
          </div>
          {symptomDropdownOpen && filteredSuggestions.length > 0 && (
            <div className="quick-entry__dropdown" role="listbox">
              {filteredSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="quick-entry__dropdown-item"
                  role="option"
                  onClick={() => addSymptom(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="quick-entry__row">
        <span className="quick-entry__label">Medications</span>
        <div className="quick-entry__meds">
          {medicationsHistory.map((med) => (
            <label key={med} className="quick-entry__med-row">
              <input
                type="checkbox"
                className="quick-entry__med-checkbox"
                checked={medications.includes(med)}
                onChange={() => toggleMedication(med)}
              />
              <span className="quick-entry__med-label">{med}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn btn--opal btn--sm quick-entry__save"
        onClick={handleSave}
        disabled={!hasData || saving}
      >
        <span className="btn__text">{saving ? 'Saving...' : todayEntry ? 'Update' : 'Save'}</span>
      </button>
    </div>
  );
}
