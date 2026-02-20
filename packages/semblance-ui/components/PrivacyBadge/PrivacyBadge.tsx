/**
 * PrivacyBadge — Always visible. Never hidden. Non-negotiable.
 * This is a trust mechanism, not a feature.
 * Per DESIGN_SYSTEM.md: Fixed position in sidebar. Lock icon + "Local Only" text.
 */

interface PrivacyBadgeProps {
  actionsToday?: number;
  className?: string;
}

export function PrivacyBadge({ actionsToday, className = '' }: PrivacyBadgeProps) {
  const label = actionsToday !== undefined && actionsToday > 0
    ? `${actionsToday} action${actionsToday === 1 ? '' : 's'} today`
    : 'Local Only';

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2
        bg-semblance-success-subtle dark:bg-semblance-success/10
        text-semblance-success
        text-xs font-medium
        rounded-md
        ${className}
      `.trim()}
      role="status"
      aria-label="Privacy status: All data stored locally"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
