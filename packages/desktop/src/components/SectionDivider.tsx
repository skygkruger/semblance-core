/**
 * SectionDivider — Thin horizontal line between logical sections.
 * Creates vertical rhythm inside PageContainer.
 */

export function SectionDivider() {
  return (
    <div style={{
      height: 1,
      background: 'rgba(255, 255, 255, 0.04)',
      margin: '20px 0',
    }} />
  );
}
