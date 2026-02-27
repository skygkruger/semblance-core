import type { KnowledgeNode } from './graph-types';

interface CategoryLegendItem {
  id: string;
  label: string;
  color: string;
  nodeCount: number;
}

interface CategoryLegendProps {
  categories: CategoryLegendItem[];
  leftOffset?: number;
  onCategoryClick?: (categoryId: string) => void;
}

export function deriveLegendCategories(nodes: KnowledgeNode[]): CategoryLegendItem[] {
  return nodes
    .filter(n => n.type === 'category')
    .map(n => ({
      id: n.id,
      label: n.label,
      color: (n.metadata?.color as string) ?? '#6ECFA3',
      nodeCount: (n.metadata?.nodeCount as number) ?? 0,
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}

export function CategoryLegend({ categories, leftOffset, onCategoryClick }: CategoryLegendProps) {
  if (categories.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: (leftOffset ?? 0) + 16,
      width: 180,
      background: '#111518',
      border: '1px solid rgba(255, 255, 255, 0.09)',
      borderRadius: 8,
      padding: '16px 20px',
      zIndex: 10,
      pointerEvents: 'auto',
    }}>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        color: '#525A64',
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 12,
      }}>
        Your Life Data
      </div>
      {categories.map(cat => {
        const isLocked = cat.nodeCount === 0;
        return (
          <div
            key={cat.id}
            onClick={onCategoryClick && !isLocked ? (e) => {
              // Click flash: 200ms highlight
              const el = e.currentTarget as HTMLDivElement;
              el.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 200);
              onCategoryClick(cat.id);
            } : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 24,
              padding: '0 4px',
              borderRadius: 4,
              cursor: onCategoryClick && !isLocked ? 'pointer' : 'default',
              opacity: isLocked ? 0.4 : 1,
              transition: 'background-color 150ms',
            }}
            onMouseEnter={e => {
              if (isLocked) return;
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
              const label = e.currentTarget.querySelector<HTMLDivElement>('[data-legend-label]');
              if (label) label.style.color = '#CDD4DB';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              const label = e.currentTarget.querySelector<HTMLDivElement>('[data-legend-label]');
              if (label) label.style.color = '#A8B4C0';
            }}
          >
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: cat.color,
              flexShrink: 0,
              opacity: isLocked ? 0.5 : 1,
            }} />
            <div
              data-legend-label
              style={{
                flex: 1,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontWeight: 300,
                fontSize: 12,
                color: '#A8B4C0',
                transition: 'color 150ms',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
            </div>
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#5E6B7C',
              textAlign: 'right',
              flexShrink: 0,
            }}>
              {isLocked ? '0 \u00B7' : cat.nodeCount}
            </div>
          </div>
        );
      })}
    </div>
  );
}
