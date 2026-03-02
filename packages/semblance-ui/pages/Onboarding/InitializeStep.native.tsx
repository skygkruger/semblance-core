import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import { WireframeSpinner } from '../../components/WireframeSpinner/WireframeSpinner';
import type { InitializeStepProps, ModelDownload } from './InitializeStep.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}

function DownloadRow({ download, completeLabel }: { download: ModelDownload; completeLabel: string }) {
  const progress = download.totalBytes > 0
    ? (download.downloadedBytes / download.totalBytes) * 100
    : 0;
  const isComplete = download.status === 'complete';

  return (
    <View style={dlStyles.card}>
      <View style={dlStyles.header}>
        <Text style={dlStyles.name}>{download.modelName}</Text>
        <Text style={[dlStyles.status, isComplete && dlStyles.statusDone]}>
          {isComplete ? completeLabel : `${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)}`}
        </Text>
      </View>
      <ProgressBar
        value={isComplete ? 100 : progress}
        indeterminate={download.status === 'pending'}
      />
    </View>
  );
}

const dlStyles = StyleSheet.create({
  card: {
    ...opalSurface,
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
  },
  status: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
  },
  statusDone: {
    color: brandColors.veridian,
  },
});

export function InitializeStep({ downloads, knowledgeMoment, loading, onComplete }: InitializeStepProps) {
  const { t } = useTranslation('onboarding');
  const allComplete = downloads.length > 0 && downloads.every(d => d.status === 'complete');

  return (
    <View style={styles.container}>
      {!allComplete && (
        <>
          <WireframeSpinner size={64} />
          <Text style={styles.headline}>{t('initialize.downloading_headline')}</Text>
          <Text style={styles.subtext}>
            {t('initialize.downloading_subtext')}
          </Text>
          <View style={styles.downloads}>
            {downloads.map((dl) => (
              <DownloadRow key={dl.modelName} download={dl} completeLabel={t('initialize.download_complete_status')} />
            ))}
          </View>
        </>
      )}

      {allComplete && loading && (
        <>
          <WireframeSpinner size={64} />
          <Text style={styles.headline}>{t('initialize.building_headline')}</Text>
          <Text style={styles.subtext}>
            {t('initialize.building_subtext')}
          </Text>
        </>
      )}

      {allComplete && !loading && knowledgeMoment && (
        <>
          <Text style={styles.headline}>{t('initialize.knowledge_moment_headline')}</Text>
          <View style={styles.momentCard}>
            <Text style={styles.momentTitle}>{knowledgeMoment.title}</Text>
            <Text style={styles.momentSummary}>{knowledgeMoment.summary}</Text>
            {knowledgeMoment.connections.length > 0 && (
              <View style={styles.tags}>
                {knowledgeMoment.connections.map((conn) => (
                  <View key={conn} style={styles.tag}>
                    <Text style={styles.tagText}>{conn}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {allComplete && !loading && !knowledgeMoment && (
        <>
          <Text style={styles.headline}>{t('initialize.ready_headline')}</Text>
          <Text style={styles.subtext}>
            {t('initialize.ready_subtext')}
          </Text>
        </>
      )}

      {allComplete && !loading && (
        <View style={styles.btnWrap}>
          <Button variant="approve" size="lg" onPress={onComplete}>
            {t('initialize.start_button')}
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s6,
    paddingHorizontal: nativeSpacing.s5,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  downloads: {
    width: '100%',
    gap: nativeSpacing.s3,
  },
  momentCard: {
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: 'rgba(110,207,163,0.15)',
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s5,
    width: '100%',
    gap: nativeSpacing.s2,
  },
  momentTitle: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
  },
  momentSummary: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s2,
    marginTop: nativeSpacing.s2,
  },
  tag: {
    backgroundColor: 'rgba(110,207,163,0.08)',
    borderRadius: nativeRadius.sm,
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
  },
  tagText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
  btnWrap: {
    marginTop: nativeSpacing.s2,
  },
});
