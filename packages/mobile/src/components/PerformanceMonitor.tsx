// PerformanceMonitor — Dev-only overlay showing performance metrics.
// Hidden in production. Shows cold start, memory, battery, feature load times.
// CRITICAL: No networking imports. No telemetry. Dev-only visual debugging tool.

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import type { PerformanceReport } from '@semblance/core/performance/types';

export interface PerformanceMonitorProps {
  report: PerformanceReport | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Dev-only performance overlay.
 * Displays current performance metrics as a floating panel.
 * Must be wrapped in __DEV__ check in the app root.
 */
export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  report,
  visible,
  onClose,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!visible || !report) return null;

  const formatMs = (ms: number): string => `${ms.toFixed(0)}ms`;
  const formatMB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.title}>[PERF]</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>[x]</Text>
          </TouchableOpacity>
        </View>

        {/* Compact View */}
        {!expanded && report.coldStart && (
          <Text style={styles.compactLine}>
            CS: {formatMs(report.coldStart.totalMs)} | MEM: {formatMB(report.memory?.usedBytes ?? 0)}
          </Text>
        )}

        {/* Expanded View */}
        {expanded && (
          <>
            {report.coldStart && (
              <View style={styles.metricGroup}>
                <Text style={styles.metricLabel}>Cold Start</Text>
                <Text style={styles.metricValue}>
                  Total: {formatMs(report.coldStart.totalMs)}
                </Text>
                <Text style={styles.metricDetail}>
                  Critical: {formatMs(report.coldStart.criticalPhaseMs)} |
                  Important: {formatMs(report.coldStart.importantPhaseMs)} |
                  Deferred: {formatMs(report.coldStart.deferredPhaseMs)}
                </Text>
              </View>
            )}

            {report.memory && (
              <View style={styles.metricGroup}>
                <Text style={styles.metricLabel}>Memory</Text>
                <Text style={styles.metricValue}>
                  {formatMB(report.memory.usedBytes)} / {formatMB(report.memory.totalBytes)}
                </Text>
              </View>
            )}

            {report.battery && (
              <View style={styles.metricGroup}>
                <Text style={styles.metricLabel}>Battery</Text>
                <Text style={styles.metricValue}>
                  {report.battery.levelPercent ?? '?'}%
                  {report.battery.isCharging ? ' [charging]' : ''}
                  {report.battery.isLowPowerMode ? ' [low power]' : ''}
                </Text>
              </View>
            )}

            {Object.keys(report.featureLoadTimes).length > 0 && (
              <View style={styles.metricGroup}>
                <Text style={styles.metricLabel}>Feature Load Times</Text>
                {Object.entries(report.featureLoadTimes).map(([name, ms]) => (
                  <Text key={name} style={styles.metricDetail}>
                    {name}: {formatMs(ms)}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.tierLabel}>
              Tier: {report.deviceTier} | Platform: {report.platform}
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 50,
    right: 8,
    zIndex: 9999,
  },
  panel: {
    backgroundColor: 'rgba(26, 29, 46, 0.92)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.sm,
    maxWidth: 280,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.accent,
    fontWeight: typography.weight.bold,
  },
  closeButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  compactLine: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textSecondaryDark,
  },
  metricGroup: {
    marginBottom: spacing.xs,
  },
  metricLabel: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
  },
  metricValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textPrimaryDark,
  },
  metricDetail: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 1,
  },
  tierLabel: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
});
