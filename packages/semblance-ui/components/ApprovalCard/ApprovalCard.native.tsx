import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import type { ApprovalCardProps } from './ApprovalCard.types';
import { RISK_COLORS } from './ApprovalCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function ApprovalCard({
  action,
  context,
  dataOut = [],
  risk = 'low',
  state = 'pending',
  onApprove,
  onDismiss,
}: ApprovalCardProps) {
  const { t } = useTranslation();
  const [_animating, setAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setAnimating(false), 1100);
    return () => clearTimeout(timer);
  }, []);

  const riskColor = RISK_COLORS[risk];

  return (
    <View style={[styles.container, { borderLeftColor: riskColor }]}>
      <View style={styles.header}>
        <Text style={styles.action}>{action}</Text>
        <View style={[styles.riskBadge, { backgroundColor: riskColor + '1A' }]}>
          <Text style={[styles.riskText, { color: riskColor }]}>{risk}</Text>
        </View>
      </View>

      <Text style={styles.context}>{context}</Text>

      {dataOut.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.dataLabel}>{t('screen.approval.data_leaving')}</Text>
          {dataOut.map((item, i) => (
            <View key={i} style={styles.dataRow}>
              <Text style={styles.dataBullet}>{'\u2022'}</Text>
              <Text style={styles.dataItem}>{item}</Text>
            </View>
          ))}
        </>
      )}

      {state === 'pending' && (
        <View style={styles.actions}>
          <Button variant="approve" size="md" onPress={onApprove}>
            {t('button.approve')}
          </Button>
          <Button variant="dismiss" size="md" onPress={onDismiss}>
            {t('button.dismiss')}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    borderLeftWidth: 3,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  action: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: nativeRadius.sm,
  },
  riskText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    textTransform: 'uppercase',
  },
  context: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.b2,
  },
  dataLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: nativeSpacing.s2,
    paddingLeft: nativeSpacing.s2,
  },
  dataBullet: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  dataItem: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv3,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s1,
  },
});
