/**
 * PageContainer — Outer wireframe card that anchors all page content.
 * Provides a defined boundary for the content region.
 * Lives INSIDE brackets, not around them.
 */

import type { ReactNode } from 'react';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div
      className={`surface-opal opal-surface ${className}`.trim()}
      style={{
        padding: 24,
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {children}
    </div>
  );
}
