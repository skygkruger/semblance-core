// MorningBriefScreen — Desktop wrapper for the Morning Brief view.
// Fetches brief data via IPC and renders BriefingCard items.
// Full wiring in Phase 5.

import { useTranslation } from 'react-i18next';
import { WireframeSpinner } from '@semblance/ui';

export function MorningBriefScreen() {
  const { t } = useTranslation('morning-brief');
  // TODO: Wire to getMorningBrief IPC in Phase 5
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <WireframeSpinner size={48} />
      <p className="mt-4 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
        {t('card.loading')}
      </p>
    </div>
  );
}
