/**
 * RepresentativeScreen — Mobile Digital Representative dashboard.
 * Combines action summary, cancellation list, and template picker.
 * Free tier shows activation prompt.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MobileActionSummary {
  id: string;
  subject: string;
  status: 'pending' | 'approved' | 'sent' | 'rejected' | 'failed';
  classification: 'routine' | 'standard' | 'high-stakes';
  createdAt: string;
}

export interface MobileCancellableSub {
  chargeId: string;
  merchantName: string;
  amount: number;
  frequency: string;
  supportEmail: string | null;
  cancellationStatus: string;
}

export interface MobileTemplate {
  name: string;
  label: string;
  description: string;
}

export interface RepresentativeScreenProps {
  isPremium: boolean;
  actions: MobileActionSummary[];
  pendingCount: number;
  subscriptions: MobileCancellableSub[];
  templates: MobileTemplate[];
  totalTimeSavedMinutes: number;
  onApproveAction: (id: string) => void;
  onRejectAction: (id: string) => void;
  onCancelSubscription: (chargeId: string) => void;
  onSelectTemplate: (name: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RepresentativeScreen({
  isPremium,
  actions,
  pendingCount,
  subscriptions,
  templates,
  totalTimeSavedMinutes,
  onApproveAction,
  onRejectAction,
  onCancelSubscription,
  onSelectTemplate,
}: RepresentativeScreenProps) {
  if (!isPremium) {
    return (
      <View style={styles.container} testID="representative-free-tier">
        <Text style={styles.title}>Activate your Digital Representative</Text>
        <Text style={styles.subtitle}>
          Your Digital Representative drafts emails in your voice, cancels
          subscriptions, handles customer service, and follows up automatically.
        </Text>
        <Text style={styles.tierNote}>
          Available with the Digital Representative tier.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="representative-dashboard">
      {/* Summary Bar */}
      <View style={styles.summaryBar} testID="action-summary">
        <View>
          <Text style={styles.summaryLabel}>Time Saved</Text>
          <Text style={styles.summaryValue}>{totalTimeSavedMinutes} min</Text>
        </View>
        <View>
          <Text style={styles.summaryLabel}>Actions</Text>
          <Text style={styles.summaryValue}>{actions.filter(a => a.status === 'sent').length}</Text>
        </View>
        {pendingCount > 0 && (
          <View>
            <Text style={styles.summaryLabel}>Pending</Text>
            <Text style={[styles.summaryValue, styles.pendingValue]}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {/* Pending Approvals */}
      {pendingCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Approvals</Text>
          {actions.filter(a => a.status === 'pending').map(action => (
            <View key={action.id} style={styles.actionRow}>
              <View style={styles.actionInfo}>
                <Text style={styles.actionSubject}>{action.subject}</Text>
                <Text style={styles.actionMeta}>{action.classification}</Text>
              </View>
              <TouchableOpacity
                onPress={() => onApproveAction(action.id)}
                style={styles.approveBtn}
                testID={`approve-${action.id}`}
              >
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onRejectAction(action.id)}
                style={styles.rejectBtn}
                testID={`reject-${action.id}`}
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Cancellation List */}
      <View style={styles.section} testID="cancellation-list">
        <Text style={styles.sectionTitle}>Subscriptions</Text>
        {subscriptions.length === 0 ? (
          <Text style={styles.emptyText}>No subscriptions detected yet.</Text>
        ) : (
          subscriptions.map(sub => (
            <View key={sub.chargeId} style={styles.subRow}>
              <View style={styles.subInfo}>
                <Text style={styles.subName}>{sub.merchantName}</Text>
                <Text style={styles.subAmount}>
                  ${Math.abs(sub.amount / 100).toFixed(2)}/{sub.frequency}
                </Text>
              </View>
              {sub.cancellationStatus === 'not-started' && sub.supportEmail && (
                <TouchableOpacity
                  onPress={() => onCancelSubscription(sub.chargeId)}
                  style={styles.cancelBtn}
                  testID={`cancel-${sub.chargeId}`}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {/* Template Picker */}
      <View style={styles.section} testID="template-picker">
        <Text style={styles.sectionTitle}>Email Templates</Text>
        {templates.map(t => (
          <TouchableOpacity
            key={t.name}
            onPress={() => onSelectTemplate(t.name)}
            style={styles.templateCard}
            testID={`template-${t.name}`}
          >
            <Text style={styles.templateLabel}>{t.label}</Text>
            <Text style={styles.templateDesc}>{t.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  tierNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  pendingValue: {
    color: '#d97706',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    marginBottom: 8,
  },
  actionInfo: {
    flex: 1,
  },
  actionSubject: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  approveBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  rejectBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 4,
  },
  rejectBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    marginBottom: 8,
  },
  subInfo: {
    flex: 1,
  },
  subName: {
    fontSize: 14,
    fontWeight: '500',
  },
  subAmount: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cancelBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  templateCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    marginBottom: 8,
  },
  templateLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  templateDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
});
