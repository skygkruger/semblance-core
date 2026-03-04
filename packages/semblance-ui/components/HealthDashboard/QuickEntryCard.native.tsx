import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet } from 'react-native';
import { brandColors, nativeSpacing } from '../../tokens/native';
import type { HealthEntry } from './HealthDashboard.types';

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
  const [saving, setSaving] = useState(false);

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

  const addSymptom = useCallback(() => {
    const trimmed = symptomInput.trim();
    if (trimmed && !symptoms.includes(trimmed)) {
      setSymptoms((prev) => [...prev, trimmed]);
    }
    setSymptomInput('');
  }, [symptomInput, symptoms]);

  const toggleMedication = useCallback((med: string) => {
    setMedications((prev) =>
      prev.includes(med) ? prev.filter((m) => m !== med) : [...prev, med],
    );
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {todayEntry ? 'Today\u2019s Check-In (Updated)' : 'Daily Check-In'}
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Mood</Text>
        <View style={styles.scale}>
          {SCALE_POINTS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.scaleDot, mood === n && styles.scaleDotActive]}
              onPress={() => setMood(n)}
              accessibilityLabel={`Mood ${n}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: mood === n }}
            >
              <Text style={[styles.scaleDotText, mood === n && styles.scaleDotTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Energy</Text>
        <View style={styles.scale}>
          {SCALE_POINTS.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.scaleDot, energy === n && styles.scaleDotActive]}
              onPress={() => setEnergy(n)}
              accessibilityLabel={`Energy ${n}`}
            >
              <Text style={[styles.scaleDotText, energy === n && styles.scaleDotTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Water</Text>
        <View style={styles.waterRow}>
          <TouchableOpacity style={styles.waterBtn} onPress={() => setWater((w) => Math.max(0, w - 1))}>
            <Text style={styles.waterBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.waterCount}>{water}</Text>
          <TouchableOpacity style={styles.waterBtn} onPress={() => setWater((w) => w + 1)}>
            <Text style={styles.waterBtnText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.waterUnit}>glasses</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Symptoms</Text>
        <View style={styles.tags}>
          {symptoms.map((s) => (
            <View key={s} style={styles.tag}>
              <Text style={styles.tagText}>{s}</Text>
              <TouchableOpacity onPress={() => setSymptoms((prev) => prev.filter((x) => x !== s))}>
                <Text style={styles.tagRemove}>&times;</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TextInput
            style={styles.tagInput}
            placeholder="Add symptom..."
            placeholderTextColor={brandColors.silver1}
            value={symptomInput}
            onChangeText={setSymptomInput}
            onSubmitEditing={addSymptom}
          />
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Medications</Text>
        {medicationsHistory.map((med) => (
          <TouchableOpacity key={med} style={styles.medRow} onPress={() => toggleMedication(med)}>
            <View style={[styles.checkbox, medications.includes(med) && styles.checkboxActive]} />
            <Text style={styles.medLabel}>{med}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, (!hasData || saving) && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={!hasData || saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving...' : todayEntry ? 'Update' : 'Save'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brandColors.surface1,
    borderRadius: 12,
    padding: nativeSpacing.sp5,
    gap: nativeSpacing.sp4,
  },
  title: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.whiteDim },
  row: { gap: nativeSpacing.sp2 },
  label: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    color: brandColors.silver3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scale: { flexDirection: 'row', gap: nativeSpacing.sp2 },
  scaleDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: brandColors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleDotActive: {
    borderColor: brandColors.veridian,
  },
  scaleDotText: { fontFamily: 'DMMono-Regular', fontSize: 11, color: brandColors.silver2 },
  scaleDotTextActive: { color: brandColors.veridian },
  waterRow: { flexDirection: 'row', alignItems: 'center', gap: nativeSpacing.sp3 },
  waterBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brandColors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterBtnText: { fontSize: 16, color: brandColors.silver2 },
  waterCount: { fontFamily: 'DMMono-Regular', fontSize: 17, color: brandColors.whiteDim, minWidth: 32, textAlign: 'center' },
  waterUnit: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: nativeSpacing.sp2, alignItems: 'center' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.sp1,
    paddingVertical: nativeSpacing.sp1,
    paddingHorizontal: nativeSpacing.sp2,
    backgroundColor: brandColors.surface2,
    borderRadius: 9999,
  },
  tagText: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver3 },
  tagRemove: { fontSize: 14, color: brandColors.silver1 },
  tagInput: {
    fontFamily: 'DMSans-Regular',
    fontSize: 11,
    color: brandColors.whiteDim,
    minWidth: 100,
    padding: 0,
  },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: nativeSpacing.sp2 },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: brandColors.border2,
  },
  checkboxActive: {
    backgroundColor: brandColors.veridian,
    borderColor: brandColors.veridian,
  },
  medLabel: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver3 },
  saveBtn: {
    backgroundColor: brandColors.veridian,
    borderRadius: 8,
    paddingVertical: nativeSpacing.sp2,
    paddingHorizontal: nativeSpacing.sp5,
    alignSelf: 'flex-end',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.background },
});
