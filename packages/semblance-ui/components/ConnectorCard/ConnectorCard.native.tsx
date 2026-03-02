import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ConnectorCardProps } from './ConnectorCard.types';
import { statusConfig, formatLastSynced } from './ConnectorCard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function ConnectorCard({
  id,
  displayName,
  description,
  status,
  isPremium,
  userEmail,
  lastSyncedAt,
  icon,
  onConnect,
  onDisconnect,
  onSync,
}: ConnectorCardProps) {
  const { t } = useTranslation('connections');
  const { dotColor, textColor } = statusConfig[status];
  const isConnected = status === 'connected';
  const isPending = status === 'pending';

  return (
    <View
      style={[styles.container, isConnected && styles.containerConnected]}
      accessibilityLabel={`${displayName} connector`}
    >
      <View style={styles.top}>
        <View style={styles.info}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <View style={styles.text}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{displayName}</Text>
              {isPremium && (
                <View style={styles.drBadge}>
                  <Text style={styles.drBadgeText}>{t('card.dr_badge')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.description}>{description}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {!isConnected && !isPending && (
            <Pressable
              style={styles.btnConnect}
              onPress={() => onConnect(id)}
              hitSlop={8}
            >
              <Text style={styles.btnConnectText}>{t('card.btn_connect')}</Text>
            </Pressable>
          )}
          {isConnected && (
            <>
              <Pressable
                style={styles.btnSync}
                onPress={() => onSync(id)}
                hitSlop={8}
              >
                <Text style={styles.btnSyncText}>{t('card.btn_sync')}</Text>
              </Pressable>
              <Pressable
                style={styles.btnDisconnect}
                onPress={() => onDisconnect(id)}
                hitSlop={8}
              >
                <Text style={styles.btnDisconnectText}>{t('card.btn_disconnect')}</Text>
              </Pressable>
            </>
          )}
          {isPending && (
            <Text style={styles.pendingText}>{t('card.pending_text')}</Text>
          )}
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusLabel, { color: textColor }]}>{t(`status.${status}`)}</Text>
          {isConnected && userEmail && (
            <Text style={styles.statusEmail}>{userEmail}</Text>
          )}
        </View>
        {isConnected && lastSyncedAt && (
          <Text style={styles.syncTime}>{t('card.synced_prefix', { time: formatLastSynced(lastSyncedAt) })}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s3,
  },
  containerConnected: {
    borderLeftWidth: 3,
    borderLeftColor: brandColors.veridian,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: nativeSpacing.s3,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    flex: 1,
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  name: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
  },
  drBadge: {
    backgroundColor: 'rgba(110, 207, 163, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: nativeRadius.sm,
  },
  drBadgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 9,
    color: brandColors.veridian,
    letterSpacing: 0.5,
  },
  description: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  actions: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    alignItems: 'center',
  },
  btnConnect: {
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.sm,
    borderWidth: 1,
    borderColor: brandColors.veridian,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnConnectText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  btnSync: {
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.sm,
    borderWidth: 1,
    borderColor: brandColors.b3,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnSyncText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  btnDisconnect: {
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnDisconnectText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
  pendingText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.amber,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: brandColors.b1,
    paddingTop: nativeSpacing.s3,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
  },
  statusEmail: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  syncTime: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
});
