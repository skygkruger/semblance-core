/**
 * OnboardingAmbientGlow — Radial gradient glow behind onboarding content.
 * Breathes slowly (8s cycle). Grows brighter with each step completed.
 * Veridian-tinted — the system warming up.
 */

interface OnboardingAmbientGlowProps {
  /** 0-1 progress through onboarding */
  progress: number;
}

export function OnboardingAmbientGlow({ progress }: OnboardingAmbientGlowProps) {
  // Base opacity grows from 0.02 → 0.08 as progress increases
  const baseOpacity = 0.02 + progress * 0.06;

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80vmax',
        height: '80vmax',
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(110, 207, 163, ${baseOpacity}) 0%, rgba(110, 207, 163, ${baseOpacity * 0.3}) 40%, transparent 70%)`,
        pointerEvents: 'none',
        zIndex: 0,
        animation: 'onboarding-glow-breathe 8s ease-in-out infinite',
        transition: 'background 1s ease',
      }}
    />
  );
}
