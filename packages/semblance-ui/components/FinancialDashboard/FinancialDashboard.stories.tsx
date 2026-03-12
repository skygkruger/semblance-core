import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FinancialDashboard } from './FinancialDashboard';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type {
  FinancialDashboardProps,
  FinancialPeriod,
} from './FinancialDashboard.types';

const meta: Meta<typeof FinancialDashboard> = {
  title: 'Components/FinancialDashboard',
  component: FinancialDashboard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center', padding: 24, minHeight: '100vh' }}>
          <div style={{ maxWidth: 720, width: '100%' }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FinancialDashboard>;

// ─── Shared no-op handlers ────────────────────────────────────────────────────

const noop = () => {};

// ─── Default ─────────────────────────────────────────────────────────────────

export const Default: Story = {
  render: function DefaultStory() {
    const [period, setPeriod] = useState<FinancialPeriod>('30d');
    return (
      <FinancialDashboard
        overview={{
          totalSpending: 4237.89,
          previousPeriodSpending: 3981.44,
          transactionCount: 87,
          periodStart: '2026-02-01',
          periodEnd: '2026-03-01',
        }}
        categories={[
          { category: 'Food & Dining',     total: 1124.50, percentage: 27, transactionCount: 32, trend: 'up'     },
          { category: 'Shopping',          total: 843.20,  percentage: 20, transactionCount: 18, trend: 'down'   },
          { category: 'Transportation',    total: 612.00,  percentage: 14, transactionCount: 9,  trend: 'stable' },
          { category: 'Subscriptions',     total: 487.33,  percentage: 11, transactionCount: 12, trend: 'stable' },
          { category: 'Health & Fitness',  total: 380.00,  percentage: 9,  transactionCount: 6,  trend: 'up'     },
          { category: 'Entertainment',     total: 319.44,  percentage: 8,  transactionCount: 7,  trend: 'down'   },
          { category: 'Utilities',         total: 271.42,  percentage: 6,  transactionCount: 2,  trend: 'stable' },
          { category: 'Other',             total: 200.00,  percentage: 5,  transactionCount: 1,  trend: 'stable' },
        ]}
        anomalies={[
          {
            id: 'a1',
            type: 'unusual_amount',
            severity: 'high',
            title: 'Unusually large charge',
            description: 'DoorDash charged $187.50 — 4x your typical order size.',
            amount: 187.50,
            merchantName: 'DoorDash',
            detectedAt: '2026-02-28T14:22:00Z',
          },
          {
            id: 'a2',
            type: 'new_merchant',
            severity: 'low',
            title: 'New merchant',
            description: 'First purchase at Lemonade Insurance — $42.00.',
            amount: 42.00,
            merchantName: 'Lemonade Insurance',
            detectedAt: '2026-02-20T09:10:00Z',
          },
          {
            id: 'a3',
            type: 'frequency_change',
            severity: 'medium',
            title: 'Frequency change',
            description: 'Uber Eats orders jumped from 2/week to 8/week this period.',
            amount: 214.80,
            merchantName: 'Uber Eats',
            detectedAt: '2026-02-25T18:45:00Z',
          },
        ]}
        subscriptions={{
          charges: [
            {
              id: 's1',
              merchantName: 'Netflix',
              amount: 15.49,
              frequency: 'monthly',
              confidence: 0.99,
              lastChargeDate: '2026-02-15',
              chargeCount: 24,
              estimatedAnnualCost: 185.88,
              status: 'user_confirmed',
            },
            {
              id: 's2',
              merchantName: 'Spotify',
              amount: 10.99,
              frequency: 'monthly',
              confidence: 0.98,
              lastChargeDate: '2026-02-10',
              chargeCount: 18,
              estimatedAnnualCost: 131.88,
              status: 'active',
            },
            {
              id: 's3',
              merchantName: 'Adobe Creative Cloud',
              amount: 54.99,
              frequency: 'monthly',
              confidence: 0.97,
              lastChargeDate: '2026-02-01',
              chargeCount: 8,
              estimatedAnnualCost: 659.88,
              status: 'active',
            },
            {
              id: 's4',
              merchantName: 'Notion',
              amount: 16.00,
              frequency: 'monthly',
              confidence: 0.91,
              lastChargeDate: '2026-01-28',
              chargeCount: 14,
              estimatedAnnualCost: 192.00,
              status: 'active',
            },
            {
              id: 's5',
              merchantName: 'Planet Fitness',
              amount: 24.99,
              frequency: 'monthly',
              confidence: 0.88,
              lastChargeDate: '2026-01-05',
              chargeCount: 19,
              estimatedAnnualCost: 299.88,
              status: 'forgotten',
            },
          ],
          summary: {
            totalMonthly: 122.46,
            totalAnnual: 1469.52,
            activeCount: 5,
            forgottenCount: 1,
            potentialSavings: 299.88,
          },
        }}
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        onDismissAnomaly={noop}
        onCancelSubscription={noop}
        onKeepSubscription={noop}
        onImportStatement={noop}
      />
    );
  },
};

// ─── Empty ────────────────────────────────────────────────────────────────────

export const Empty: Story = {
  args: {
    overview: null,
    categories: [],
    anomalies: [],
    subscriptions: {
      charges: [],
      summary: {
        totalMonthly: 0,
        totalAnnual: 0,
        activeCount: 0,
        forgottenCount: 0,
        potentialSavings: 0,
      },
    },
    selectedPeriod: '30d',
    onPeriodChange: noop,
    onDismissAnomaly: noop,
    onCancelSubscription: noop,
    onKeepSubscription: noop,
    onImportStatement: noop,
  },
};

// ─── WithAnomalies ────────────────────────────────────────────────────────────

export const WithAnomalies: Story = {
  render: function WithAnomaliesStory() {
    const [period, setPeriod] = useState<FinancialPeriod>('30d');
    return (
      <FinancialDashboard
        overview={{
          totalSpending: 3102.55,
          previousPeriodSpending: 2890.10,
          transactionCount: 61,
          periodStart: '2026-02-01',
          periodEnd: '2026-03-01',
        }}
        categories={[
          { category: 'Shopping',       total: 1340.00, percentage: 43, transactionCount: 14, trend: 'up'   },
          { category: 'Food & Dining',  total: 890.55,  percentage: 29, transactionCount: 25, trend: 'up'   },
          { category: 'Subscriptions', total: 872.00,  percentage: 28, transactionCount: 22, trend: 'stable'},
        ]}
        anomalies={[
          {
            id: 'b1',
            type: 'unusual_amount',
            severity: 'high',
            title: 'Large one-time purchase',
            description: 'Best Buy charged $649.00 — no prior history with this merchant.',
            amount: 649.00,
            merchantName: 'Best Buy',
            detectedAt: '2026-02-22T11:30:00Z',
          },
          {
            id: 'b2',
            type: 'duplicate',
            severity: 'high',
            title: 'Possible duplicate charge',
            description: 'Starbucks charged $12.75 twice within 3 minutes on Feb 18.',
            amount: 12.75,
            merchantName: 'Starbucks',
            detectedAt: '2026-02-18T08:03:00Z',
          },
          {
            id: 'b3',
            type: 'new_merchant',
            severity: 'medium',
            title: 'New merchant — international',
            description: 'Charge from Booking.com converted from EUR — $218.40.',
            amount: 218.40,
            merchantName: 'Booking.com',
            detectedAt: '2026-02-14T16:20:00Z',
          },
          {
            id: 'b4',
            type: 'frequency_change',
            severity: 'medium',
            title: 'Delivery apps spiking',
            description: 'Combined DoorDash + Instacart up 180% vs prior 30 days.',
            amount: 312.90,
            merchantName: 'DoorDash / Instacart',
            detectedAt: '2026-02-26T20:00:00Z',
          },
          {
            id: 'b5',
            type: 'new_merchant',
            severity: 'low',
            title: 'First visit',
            description: 'Charged $8.50 at Blue Bottle Coffee — new location, consistent amount.',
            amount: 8.50,
            merchantName: 'Blue Bottle Coffee',
            detectedAt: '2026-02-19T07:45:00Z',
          },
        ]}
        subscriptions={{
          charges: [
            {
              id: 'sb1',
              merchantName: 'GitHub Copilot',
              amount: 19.00,
              frequency: 'monthly',
              confidence: 0.96,
              lastChargeDate: '2026-02-05',
              chargeCount: 11,
              estimatedAnnualCost: 228.00,
              status: 'active',
            },
          ],
          summary: {
            totalMonthly: 19.00,
            totalAnnual: 228.00,
            activeCount: 1,
            forgottenCount: 0,
            potentialSavings: 0,
          },
        }}
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        onDismissAnomaly={noop}
        onCancelSubscription={noop}
        onKeepSubscription={noop}
        onImportStatement={noop}
      />
    );
  },
};

// ─── HighSpending ─────────────────────────────────────────────────────────────

export const HighSpending: Story = {
  render: function HighSpendingStory() {
    const [period, setPeriod] = useState<FinancialPeriod>('30d');
    return (
      <FinancialDashboard
        overview={{
          totalSpending: 12500.00,
          previousPeriodSpending: 8200.00,
          transactionCount: 142,
          periodStart: '2026-02-01',
          periodEnd: '2026-03-01',
        }}
        categories={[
          { category: 'Travel',         total: 4800.00, percentage: 38, transactionCount: 11, trend: 'up' },
          { category: 'Shopping',       total: 3200.00, percentage: 26, transactionCount: 38, trend: 'up' },
          { category: 'Food & Dining',  total: 1900.00, percentage: 15, transactionCount: 54, trend: 'up' },
          { category: 'Entertainment',  total: 1100.00, percentage: 9,  transactionCount: 17, trend: 'up' },
          { category: 'Subscriptions',  total: 850.00,  percentage: 7,  transactionCount: 21, trend: 'stable' },
          { category: 'Other',          total: 650.00,  percentage: 5,  transactionCount: 1,  trend: 'stable' },
        ]}
        anomalies={[
          {
            id: 'c1',
            type: 'unusual_amount',
            severity: 'high',
            title: 'Hotel charge 3x average',
            description: 'Four Seasons charged $2,400 — highest single lodging charge on record.',
            amount: 2400.00,
            merchantName: 'Four Seasons Hotels',
            detectedAt: '2026-02-12T12:00:00Z',
          },
          {
            id: 'c2',
            type: 'frequency_change',
            severity: 'medium',
            title: 'Restaurant spending up 240%',
            description: 'Dining out spend jumped significantly — 54 transactions vs usual 16.',
            amount: 1900.00,
            merchantName: 'Multiple restaurants',
            detectedAt: '2026-02-28T23:59:00Z',
          },
        ]}
        subscriptions={{
          charges: [
            {
              id: 'sc1',
              merchantName: 'AWS',
              amount: 340.00,
              frequency: 'monthly',
              confidence: 0.94,
              lastChargeDate: '2026-02-01',
              chargeCount: 30,
              estimatedAnnualCost: 4080.00,
              status: 'active',
            },
            {
              id: 'sc2',
              merchantName: 'Vercel Pro',
              amount: 20.00,
              frequency: 'monthly',
              confidence: 0.99,
              lastChargeDate: '2026-02-15',
              chargeCount: 22,
              estimatedAnnualCost: 240.00,
              status: 'active',
            },
          ],
          summary: {
            totalMonthly: 360.00,
            totalAnnual: 4320.00,
            activeCount: 2,
            forgottenCount: 0,
            potentialSavings: 0,
          },
        }}
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        onDismissAnomaly={noop}
        onCancelSubscription={noop}
        onKeepSubscription={noop}
        onImportStatement={noop}
      />
    );
  },
};

// ─── SubscriptionHeavy ────────────────────────────────────────────────────────

export const SubscriptionHeavy: Story = {
  render: function SubscriptionHeavyStory() {
    const [period, setPeriod] = useState<FinancialPeriod>('30d');
    return (
      <FinancialDashboard
        overview={{
          totalSpending: 2841.22,
          previousPeriodSpending: 2790.00,
          transactionCount: 44,
          periodStart: '2026-02-01',
          periodEnd: '2026-03-01',
        }}
        categories={[
          { category: 'Subscriptions',  total: 1488.44, percentage: 52, transactionCount: 12, trend: 'up'   },
          { category: 'Food & Dining',  total: 712.18,  percentage: 25, transactionCount: 21, trend: 'down' },
          { category: 'Shopping',       total: 400.60,  percentage: 14, transactionCount: 6,  trend: 'stable'},
          { category: 'Utilities',      total: 240.00,  percentage: 9,  transactionCount: 5,  trend: 'stable'},
        ]}
        anomalies={[]}
        subscriptions={{
          charges: [
            {
              id: 'd1',
              merchantName: 'Netflix',
              amount: 15.49,
              frequency: 'monthly',
              confidence: 0.99,
              lastChargeDate: '2026-02-15',
              chargeCount: 30,
              estimatedAnnualCost: 185.88,
              status: 'user_confirmed',
            },
            {
              id: 'd2',
              merchantName: 'Spotify',
              amount: 10.99,
              frequency: 'monthly',
              confidence: 0.98,
              lastChargeDate: '2026-02-10',
              chargeCount: 28,
              estimatedAnnualCost: 131.88,
              status: 'active',
            },
            {
              id: 'd3',
              merchantName: 'Adobe Creative Cloud',
              amount: 54.99,
              frequency: 'monthly',
              confidence: 0.97,
              lastChargeDate: '2026-02-01',
              chargeCount: 14,
              estimatedAnnualCost: 659.88,
              status: 'active',
            },
            {
              id: 'd4',
              merchantName: 'Hulu',
              amount: 17.99,
              frequency: 'monthly',
              confidence: 0.95,
              lastChargeDate: '2026-02-08',
              chargeCount: 9,
              estimatedAnnualCost: 215.88,
              status: 'forgotten',
            },
            {
              id: 'd5',
              merchantName: 'Peacock',
              amount: 5.99,
              frequency: 'monthly',
              confidence: 0.90,
              lastChargeDate: '2026-01-20',
              chargeCount: 7,
              estimatedAnnualCost: 71.88,
              status: 'forgotten',
            },
            {
              id: 'd6',
              merchantName: 'Paramount+',
              amount: 5.99,
              frequency: 'monthly',
              confidence: 0.88,
              lastChargeDate: '2026-01-18',
              chargeCount: 5,
              estimatedAnnualCost: 71.88,
              status: 'forgotten',
            },
            {
              id: 'd7',
              merchantName: 'Apple One',
              amount: 21.95,
              frequency: 'monthly',
              confidence: 0.99,
              lastChargeDate: '2026-02-20',
              chargeCount: 24,
              estimatedAnnualCost: 263.40,
              status: 'active',
            },
            {
              id: 'd8',
              merchantName: 'ChatGPT Plus',
              amount: 20.00,
              frequency: 'monthly',
              confidence: 0.97,
              lastChargeDate: '2026-02-03',
              chargeCount: 14,
              estimatedAnnualCost: 240.00,
              status: 'active',
            },
            {
              id: 'd9',
              merchantName: 'LinkedIn Premium',
              amount: 39.99,
              frequency: 'monthly',
              confidence: 0.93,
              lastChargeDate: '2026-01-10',
              chargeCount: 6,
              estimatedAnnualCost: 479.88,
              status: 'forgotten',
            },
            {
              id: 'd10',
              merchantName: 'Notion',
              amount: 16.00,
              frequency: 'monthly',
              confidence: 0.96,
              lastChargeDate: '2026-02-12',
              chargeCount: 20,
              estimatedAnnualCost: 192.00,
              status: 'active',
            },
            {
              id: 'd11',
              merchantName: 'Figma Professional',
              amount: 45.00,
              frequency: 'monthly',
              confidence: 0.94,
              lastChargeDate: '2026-02-05',
              chargeCount: 18,
              estimatedAnnualCost: 540.00,
              status: 'active',
            },
            {
              id: 'd12',
              merchantName: 'GitHub Copilot',
              amount: 19.00,
              frequency: 'monthly',
              confidence: 0.99,
              lastChargeDate: '2026-02-18',
              chargeCount: 12,
              estimatedAnnualCost: 228.00,
              status: 'active',
            },
          ],
          summary: {
            totalMonthly: 273.38,
            totalAnnual: 3280.56,
            activeCount: 8,
            forgottenCount: 4,
            potentialSavings: 823.64,
          },
        }}
        selectedPeriod={period}
        onPeriodChange={setPeriod}
        onDismissAnomaly={noop}
        onCancelSubscription={noop}
        onKeepSubscription={noop}
        onImportStatement={noop}
      />
    );
  },
};

// ─── Loading ──────────────────────────────────────────────────────────────────

export const Loading: Story = {
  args: {
    overview: null,
    categories: [],
    anomalies: [],
    subscriptions: {
      charges: [],
      summary: {
        totalMonthly: 0,
        totalAnnual: 0,
        activeCount: 0,
        forgottenCount: 0,
        potentialSavings: 0,
      },
    },
    selectedPeriod: '30d',
    loading: true,
    onPeriodChange: noop,
    onDismissAnomaly: noop,
    onCancelSubscription: noop,
    onKeepSubscription: noop,
    onImportStatement: noop,
  },
};

// ─── FreeTierGated ────────────────────────────────────────────────────────────

export const FreeTierGated: Story = {
  render: function FreeTierGatedStory() {
    return (
      <div
        style={{
          position: 'relative',
          borderRadius: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.4 }}>
          <FinancialDashboard
            overview={{
              totalSpending: 4237.89,
              previousPeriodSpending: 3981.44,
              transactionCount: 87,
              periodStart: '2026-02-01',
              periodEnd: '2026-03-01',
            }}
            categories={[
              { category: 'Food & Dining',  total: 1124.50, percentage: 27, transactionCount: 32, trend: 'up'     },
              { category: 'Shopping',       total: 843.20,  percentage: 20, transactionCount: 18, trend: 'down'   },
              { category: 'Transportation', total: 612.00,  percentage: 14, transactionCount: 9,  trend: 'stable' },
              { category: 'Subscriptions',  total: 487.33,  percentage: 11, transactionCount: 12, trend: 'stable' },
            ]}
            anomalies={[]}
            subscriptions={{
              charges: [],
              summary: {
                totalMonthly: 0,
                totalAnnual: 0,
                activeCount: 0,
                forgottenCount: 0,
                potentialSavings: 0,
              },
            }}
            selectedPeriod="30d"
            onPeriodChange={noop}
            onDismissAnomaly={noop}
            onCancelSubscription={noop}
            onKeepSubscription={noop}
            onImportStatement={noop}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(11, 14, 17, 0.72)',
            gap: 16,
            padding: 32,
          }}
        >
          <p
            style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 15,
              color: '#8593A4',
              textAlign: 'center',
              margin: 0,
              maxWidth: 380,
              lineHeight: 1.6,
            }}
          >
            Activate your Digital Representative to unlock financial tracking
          </p>
          <button
            type="button"
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'transparent',
              border: '1px solid #6ECFA3',
              color: '#6ECFA3',
              padding: '10px 20px',
              cursor: 'pointer',
            }}
          >
            Activate
          </button>
        </div>
      </div>
    );
  },
};
