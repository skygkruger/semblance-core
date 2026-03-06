// Shared types for DrillDownList — platform-agnostic.

export interface DrillDownItem {
  chunkId: string;
  title: string;
  preview: string;
  source: string;
  category: string;
  indexedAt: string;
  mimeType?: string;
}

export interface DrillDownListProps {
  category: string;
  categoryLabel: string;
  categoryColor: string;
  items: DrillDownItem[];
  total: number;
  loading: boolean;
  onSearch: (query: string) => void;
  onLoadMore: () => void;
  onItemClick: (item: DrillDownItem) => void;
  hasMore: boolean;
}
