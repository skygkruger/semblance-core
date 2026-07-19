import type { PremiumFeature } from '../FeatureGate/FeatureGate.types';

export interface CapabilityPreviewCopy {
  headline: string;
  preview: string;
  bullets: string[];
}

export interface CapabilityPreviewProps {
  feature: PremiumFeature;
  newSalesEnabled: boolean;
  onFoundingCheckout: () => void;
  onRedeem: () => void;
  onDismiss?: () => void;
}

export const CAPABILITY_PREVIEW_COPY: Record<PremiumFeature, CapabilityPreviewCopy> = {
  'witness-attestation': {
    headline: 'Semblance Witness',
    preview: 'Cryptographic proof of every action taken on your behalf.',
    bullets: ['Sign autonomous actions locally', 'Export attestations you control', 'Verify integrity without cloud trust'],
  },
  'living-will': {
    headline: 'Living Will',
    preview: 'Export an encrypted digital twin of your agency graph.',
    bullets: ['Encrypted sovereign export', 'You hold the keys', 'Recoverable on your terms'],
  },
  'inheritance-protocol': {
    headline: 'Inheritance Protocol',
    preview: 'Pre-authorize trusted posthumous actions with cryptographic guardrails.',
    bullets: ['Scoped successor permissions', 'Audit-ready authorization chain', 'Revocable while you are able'],
  },
  'semblance-network': {
    headline: 'Semblance Network',
    preview: 'Peer devices that share inference without surrendering your data.',
    bullets: ['Local discovery only', 'Mutual authentication', 'Hand off heavy work to desktop'],
  },
  'import-digital-life': {
    headline: 'Import Everything',
    preview: 'Bring browser history, notes, photos, and messaging into one local graph.',
    bullets: ['One-time local ingest', 'No vendor cloud canonical store', 'Compounding personal context'],
  },
  'dark-pattern-detection': {
    headline: 'Adversarial Shield',
    preview: 'Detect manipulation, dark patterns, and unfair billing on your behalf.',
    bullets: ['Local pattern analysis', 'Actionable advocacy drafts', 'Financial self-defense'],
  },
  'financial-advocacy': {
    headline: 'Financial Advocacy',
    preview: 'Challenge unfair charges and subscriptions with representative drafts.',
    bullets: ['Subscription intelligence', 'Dispute-ready correspondence', 'Time saved on bureaucracy'],
  },
  'financial-dashboard': {
    headline: 'Financial Dashboard',
    preview: 'See spending, anomalies, and opportunities from your local financial index.',
    bullets: ['Local transaction categorization', 'Anomaly surfacing', 'No bank credentials in the cloud'],
  },
  'transaction-categorization': {
    headline: 'Transaction Intelligence',
    preview: 'Automatic categorization from locally indexed financial records.',
    bullets: ['Private categorization models', 'Editable local labels', 'Feeds representative actions'],
  },
  'spending-insights': {
    headline: 'Spending Insights',
    preview: 'Trends and alerts derived entirely from data on your device.',
    bullets: ['Weekly digest ready summaries', 'Merchant-level rollups', 'No third-party analytics'],
  },
  'anomaly-detection': {
    headline: 'Spending Anomalies',
    preview: 'Catch unusual charges before they become problems.',
    bullets: ['Local baseline modeling', 'Guardian-tier approval by default', 'Full audit trail'],
  },
  'plaid-integration': {
    headline: 'Financial Connections',
    preview: 'Connect accounts through Gateway-only transport with explicit allowlisting.',
    bullets: ['Gateway-isolated credentials', 'Local canonical index', 'Revocable connectors'],
  },
  'representative-drafting': {
    headline: 'Representative Drafting',
    preview: 'Your Digital Representative drafts email and correspondence in your voice.',
    bullets: ['Grounded on your local graph', 'Approval flows by autonomy tier', 'Every send is logged'],
  },
  'subscription-cancellation': {
    headline: 'Subscription Cancellation',
    preview: 'Detect recurring charges and cancel on your behalf when you approve.',
    bullets: ['Merchant follow-up tracking', 'Estimated time saved in audit log', 'Undo where possible'],
  },
  'representative-dashboard': {
    headline: 'Representative Dashboard',
    preview: 'Weekly digest of actions taken and time saved on your behalf.',
    bullets: ['Universal action log', 'Autonomy tier visibility', 'Proof-of-work receipts'],
  },
  'form-automation': {
    headline: 'Form Automation',
    preview: 'Fill bureaucratic forms from verified local identity and history.',
    bullets: ['Pre-filled from your graph', 'Guardian preview by default', 'No silent submission'],
  },
  'bureaucracy-tracking': {
    headline: 'Bureaucracy Tracking',
    preview: 'Track open loops, deadlines, and follow-ups across your digital life.',
    bullets: ['Cross-source task fusion', 'Representative reminders', 'Local-only storage'],
  },
  'health-tracking': {
    headline: 'Health Tracking',
    preview: 'Integrate health records into your local agency graph.',
    bullets: ['Connector-gated ingest', 'Private health index', 'Never uploaded as canonical'],
  },
  'health-insights': {
    headline: 'Health Insights',
    preview: 'Patterns and summaries from locally stored health documents.',
    bullets: ['On-device analysis', 'Share only what you choose', 'Representative-aware context'],
  },
  'proof-of-privacy': {
    headline: 'Proof of Privacy',
    preview: 'Cryptographic evidence that your data stayed on your device.',
    bullets: ['Privacy dashboard attestations', 'Network egress visibility', 'Tamper-evident audit chain'],
  },
  'alter-ego-week': {
    headline: 'Alter Ego Week',
    preview: 'A guided trust-building sequence toward higher autonomy.',
    bullets: ['Daily autonomy milestones', 'Transparent action previews', 'Revocable escalation'],
  },
};
