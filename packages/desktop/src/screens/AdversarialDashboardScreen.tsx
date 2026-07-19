/**
 * AdversarialDashboardScreen — Dark pattern defense dashboard.
 * Shows alerts, manipulation reframes, subscription value-to-cost assessments, opt-out status.
 * Thin IPC wrapper rendering with Design Bible CSS tokens.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getDarkPatternFlags, dismissDarkPatternFlag, getFinancialDashboard, prefGet } from '../ipc/commands';
import { useLicense, LicenseCapabilityGate } from '../contexts/LicenseContext';
import { Card, SkeletonCard } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { PageContainer } from '../components/PageContainer';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { DarkPatternBadge } from '../components/DarkPatternBadge';
import type { DarkPatternFlag } from '../components/DarkPatternBadge';
import './AdversarialDashboardScreen.css';

interface SubscriptionAssessment {
  id: string;
  name: string;
  monthlyCost: number;
  valueScore: number;
  recommendation: string;
}

interface OptOutStatus {
  totalOptOuts: number;
  pendingOptOuts: number;
  successRate: number;
}

const STORAGE_KEY_OPT_OUT = 'semblance.adversarial.opt_out_status';

const DEFAULT_OPT_OUT: OptOutStatus = { totalOptOuts: 0, pendingOptOuts: 0, successRate: 0 };

export function AdversarialDashboardScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<DarkPatternFlag[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionAssessment[]>([]);
  const [optOutStatus, setOptOutStatus] = useState<OptOutStatus>(DEFAULT_OPT_OUT);

  useEffect(() => {
    async function loadData() {
      try {
        // Load opt-out status from SQLite prefs
        try {
          const raw = await prefGet(STORAGE_KEY_OPT_OUT);
          if (raw) setOptOutStatus(JSON.parse(raw) as OptOutStatus);
        } catch { /* ignore */ }

        // Load dark pattern flags from IPC
        const loadedFlags = await getDarkPatternFlags().catch((err) => {
          console.error('[AdversarialDashboard] Failed to load dark pattern flags:', err);
          return [];
        });
        setFlags(loadedFlags ?? []);

        // Load subscription data from financial dashboard for value assessments
        const financialData = await getFinancialDashboard('30d').catch((err) => {
          console.error('[AdversarialDashboard] Failed to load financial data:', err);
          return null;
        });

        if (financialData?.subscriptions?.charges && Array.isArray(financialData.subscriptions.charges)) {
          const mappedSubs: SubscriptionAssessment[] = financialData.subscriptions.charges.map((charge) => ({
            id: charge.id,
            name: charge.merchantName,
            monthlyCost: charge.amount,
            valueScore: Math.min(100, Math.round((charge.estimatedAnnualCost ?? charge.amount * 12) / 10)),
            recommendation: charge.status === 'cancelled'
              ? 'Cancelled'
              : charge.status === 'forgotten'
                ? 'Potentially forgotten — review'
                : 'Active',
          }));
          setSubscriptions(mappedSubs);
        }
      } catch (err) {
        console.error('[AdversarialDashboard] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (!license.isPremium) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
      }}>
        <LicenseCapabilityGate feature="dark-pattern-detection" />
      </div>
    );
  }

  return (
      <div className="page-scroll">
        <div className="page-layout">
          <ContentBracket>
          <GhostSprite insight="No dark patterns detected. Your digital environment is clean.">
          <h1 className="page-title" style={{ fontSize: 28 }}>{t('screen.adversarial.title')}</h1>
          <ShimmerDescription text="Protecting you from dark patterns, manipulation, and unfair practices" />

          {loading && (
            <SkeletonCard
              variant="generic"
              message="Loading Adversarial Shield"
              subMessage="Scanning for dark patterns"
              showSpinner
            />
          )}

          {!loading && (
            <PageContainer>
              {/* Threat Overview */}
              <FeatureStatusBanner title="THREAT OVERVIEW" statusLabel={flags.length > 0 ? `${flags.length} DETECTED` : 'ALL CLEAR'} status={flags.length > 0 ? 'error' : 'active'} />
              <div className="adversarial-dashboard__stats">
                <Card className="adversarial-dashboard__stat surface-void opal-wireframe">
                  <p className="adversarial-dashboard__stat-value">{optOutStatus?.totalOptOuts ?? 0}</p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.total_opt_outs')}</p>
                </Card>
                <Card className="adversarial-dashboard__stat surface-void opal-wireframe">
                  <p className="adversarial-dashboard__stat-value">{optOutStatus?.pendingOptOuts ?? 0}</p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.pending')}</p>
                </Card>
                <Card className="adversarial-dashboard__stat surface-void opal-wireframe">
                  <p className="adversarial-dashboard__stat-value">
                    {(optOutStatus?.successRate ?? 0) > 0 ? `${optOutStatus.successRate}%` : '\u2014'}
                  </p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.success_rate')}</p>
                </Card>
              </div>

              <SectionDivider />

              {/* Dark pattern alerts */}
              <FeatureStatusBanner title="DARK PATTERN ALERTS" statusLabel={flags.length > 0 ? `${flags.length} ALERTS` : 'NONE DETECTED'} status={flags.length > 0 ? 'error' : 'active'} />
              {flags.length === 0 ? (
                <EmptyFeatureState message="No dark patterns detected. Semblance is monitoring your digital interactions." />
              ) : (
                <div className="adversarial-dashboard__alert-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {flags.map((flag) => (
                    <DarkPatternBadge
                      key={flag.contentId}
                      flag={flag}
                      onDismiss={(contentId) => {
                        dismissDarkPatternFlag(contentId).catch((err) =>
                          console.error('[AdversarialDashboard] Failed to dismiss flag:', err)
                        );
                        setFlags((prev) => prev.filter((f) => f.contentId !== contentId));
                      }}
                    />
                  ))}
                </div>
              )}

              <SectionDivider />

              {/* Subscription assessments */}
              <FeatureStatusBanner title="SUBSCRIPTION ASSESSMENT" statusLabel={subscriptions.length > 0 ? `${subscriptions.length} TRACKED` : 'NO DATA'} status={subscriptions.length > 0 ? 'active' : 'error'} />
              {subscriptions.length === 0 ? (
                <EmptyFeatureState message="Connect financial data to assess your subscription value" />
              ) : (
                <div className="adversarial-dashboard__subscription-list">
                  {subscriptions.map((sub) => (
                    <div key={sub.id} className="adversarial-dashboard__subscription-item">
                      <span className="adversarial-dashboard__subscription-name">{sub.name}</span>
                      <span className="adversarial-dashboard__subscription-cost">
                        ${sub.monthlyCost.toFixed(2)}/mo
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </PageContainer>
          )}
          </GhostSprite>
          </ContentBracket>
        </div>
      </div>
  );
}
