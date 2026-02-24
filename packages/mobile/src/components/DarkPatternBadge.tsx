/**
 * Dark Pattern Badge (Mobile) — Shield icon + reframe for flagged manipulative content.
 *
 * Displayed next to email subjects or notifications that were flagged by DarkPatternDetector.
 * Shows expandable pattern details and dismiss support.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedPatternDisplay {
  category: string;
  evidence: string;
  confidence: number;
}

export interface DarkPatternFlag {
  contentId: string;
  confidence: number;
  patterns: DetectedPatternDisplay[];
  reframe: string;
}

interface DarkPatternBadgeProps {
  flag: DarkPatternFlag;
  onDismiss?: (contentId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DarkPatternBadge({ flag, onDismiss }: DarkPatternBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      {/* Shield icon + reframe row */}
      <View style={styles.row}>
        <Text style={styles.shieldIcon} accessibilityLabel="shield icon">
          [!]
        </Text>
        <Text style={styles.reframeText}>{flag.reframe}</Text>
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={styles.toggleText}>
            {expanded ? 'Hide' : 'Why flagged?'}
          </Text>
        </TouchableOpacity>
        {onDismiss && (
          <TouchableOpacity
            onPress={() => onDismiss(flag.contentId)}
            accessibilityLabel="dismiss flag"
          >
            <Text style={styles.dismissText}>x</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded pattern details */}
      {expanded && flag.patterns.length > 0 && (
        <View style={styles.patternList}>
          {flag.patterns.map((pattern, idx) => (
            <View key={idx} style={styles.patternRow}>
              <Text style={styles.patternCategory}>{pattern.category}:</Text>
              <Text style={styles.patternEvidence}>"{pattern.evidence}"</Text>
              <Text style={styles.patternConfidence}>
                ({Math.round(pattern.confidence * 100)}%)
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldIcon: {
    color: '#f27a93',
    fontSize: 14,
    fontWeight: '700',
  },
  reframeText: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#6e6a86',
  },
  toggleText: {
    fontSize: 12,
    color: '#6e6a86',
    textDecorationLine: 'underline',
  },
  dismissText: {
    fontSize: 12,
    color: '#6e6a86',
    paddingHorizontal: 6,
  },
  patternList: {
    marginLeft: 24,
    marginTop: 4,
  },
  patternRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  patternCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f27a93',
  },
  patternEvidence: {
    fontSize: 12,
    color: '#6e6a86',
  },
  patternConfidence: {
    fontSize: 12,
    color: '#4a4660',
  },
});
