// Storybook mock for packages/core/knowledge/connector-category-map

export type VisualizationCategory =
  | 'communication'
  | 'scheduling'
  | 'documents'
  | 'finance'
  | 'health'
  | 'location'
  | 'social'
  | 'media';

export const CATEGORY_META: Record<VisualizationCategory, { label: string; color: string; icon: string }> = {
  communication: { label: 'Communication', color: '#4A7FBA', icon: 'mail' },
  scheduling: { label: 'Scheduling', color: '#3DB87A', icon: 'calendar' },
  documents: { label: 'Documents', color: '#8B93A7', icon: 'file' },
  finance: { label: 'Finance', color: '#E8A838', icon: 'dollar' },
  health: { label: 'Health', color: '#E85D5D', icon: 'heart' },
  location: { label: 'Location', color: '#5BA3A3', icon: 'map' },
  social: { label: 'Social', color: '#B87FD4', icon: 'users' },
  media: { label: 'Media', color: '#D4A76A', icon: 'image' },
};

export function getAllCategories(): VisualizationCategory[] {
  return Object.keys(CATEGORY_META) as VisualizationCategory[];
}
