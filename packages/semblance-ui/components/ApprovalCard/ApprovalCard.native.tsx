import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { ShimmerText } from '../ShimmerText/ShimmerText.native';
import type { ApprovalCardProps } from './ApprovalCard.types';
import { RISK_COLORS } from './ApprovalCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

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
    <OpalBorderView
      style={[styles.container, { borderLeftColor: riskColor }]}
      borderRadius={nativeRadius.lg}
    >
      <View style={styles.innerContainer}>
        <View style={styles.leftBar} />
        <View style={styles.body}>
          <View style={styles.header}>
            <ShimmerText
              fontSize={nativeFontSize.xl}
              fontFamily={nativeFontFamily.display}
              fontWeight="300"
              gradient="shimmer"
              style={styles.actionContainer}
            >
              {action}
            </ShimmerText>
            <View style={[styles.riskBadge, { backgroundColor: riskColor + '1A' }]}>
              <Text style={[styles.riskText, { color: riskColor }]}>{risk}</Text>
            </View>
          </View>

          <Text style={styles.context}>{context}</Text>

          {dataOut.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: riskColor }]} />
              <Text style={[styles.dataLabel, { color: riskColor }]}>{t('screen.approval.data_leaving')}</Text>
              {dataOut.map((item, i) => (
                <View key={i} style={styles.dataRow}>
                  <Text style={[styles.dataBullet, { color: riskColor }]}>{'\u2022'}</Text>
                  <Text style={[styles.dataItem, { color: riskColor }]}>{item}</Text>
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
      </View>
    </OpalBorderView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderLeftWidth: 3,
  },
  innerContainer: {
    flexDirection: 'row',
  },
  leftBar: {
    // Spacer for the risk color border (rendered by borderLeftWidth on container)
  },
  body: {
    flex: 1,
    padding: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionContainer: {
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
    letterSpacing: 1.1,
  },
  context: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv3,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    maxWidth: 72,
    marginVertical: nativeSpacing.s5,
  },
  dataLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: nativeSpacing.s2,
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
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: nativeSpacing.s3,
    marginTop: nativeSpacing.s5,
  },
});
