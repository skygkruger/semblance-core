// KnowledgeGraphScreen — Desktop wrapper for the Knowledge Graph visualization.
// Fetches graph data via IPC and renders KnowledgeGraph component.
// Full wiring in Phase 5.

import { useTranslation } from 'react-i18next';
import { WireframeSpinner } from '@semblance/ui';

export function KnowledgeGraphScreen() {
  const { t } = useTranslation();
  // TODO: Wire to getKnowledgeGraphData IPC in Phase 5
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <WireframeSpinner size={48} />
      <p className="mt-4 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
        {t('screen.knowledge_graph.loading')}
      </p>
    </div>
  );
}
