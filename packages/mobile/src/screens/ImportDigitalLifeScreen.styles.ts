import { StyleSheet } from 'react-native';

const colors = {
  bgDark: '#0A0A0F',
  textPrimary: '#F0EDE8',
  textSecondary: '#A8A4B0',
  textMuted: '#6B6777',
  surface1: '#14141F',
  surface2: '#1C1C2A',
  accent: '#7EB8DA',
  border: '#2A2A3A',
};

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  progressCard: {
    backgroundColor: colors.surface1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressPhase: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  progressCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  sourceCard: {
    backgroundColor: colors.surface1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceCardDisabled: {
    opacity: 0.6,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sourceDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  sourceFormats: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  sourceConsent: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  importButton: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.bgDark,
  },
  premiumGateText: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
