/**
 * OnboardingParticleField — Atmospheric floating particles for onboarding.
 * Dust motes in a beam of light. Respond gently to mouse movement.
 * On the final step, particles coalesce toward center (convergence).
 *
 * Canvas 2D, full viewport, no interaction.
 */

import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  baseOpacity: number;
  speed: number;
}

interface OnboardingParticleFieldProps {
  /** 0-1 progress through onboarding — controls convergence and density */
  progress: number;
  /** True on the final "Initialize" step — triggers convergence */
  converging?: boolean;
}

const PARTICLE_COUNT = 60;

export function OnboardingParticleField({ progress, converging = false }: OnboardingParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef(0);
  const initRef = useRef(false);

  // Track mouse position
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Initialize particles
  const initParticles = useCallback((w: number, h: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const speed = 0.15 + Math.random() * 0.3;
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 0.8 + Math.random() * 1.5,
        opacity: 0,
        baseOpacity: 0.15 + Math.random() * 0.25,
        speed,
      });
    }
    particlesRef.current = particles;
    initRef.current = true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      if (!initRef.current) initParticles(window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const centerX = () => w() / 2;
    const centerY = () => h() / 2;

    const animate = () => {
      ctx.clearRect(0, 0, w(), h());
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      for (const p of particles) {
        // Fade in on first render
        if (p.opacity < p.baseOpacity) {
          p.opacity = Math.min(p.baseOpacity, p.opacity + 0.002);
        }

        if (converging) {
          // Pull toward center
          const dx = centerX() - p.x;
          const dy = centerY() - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const pullStrength = 0.003;
          p.vx += (dx / dist) * pullStrength;
          p.vy += (dy / dist) * pullStrength;
          // Dampen
          p.vx *= 0.995;
          p.vy *= 0.995;
          // Brighten as they converge
          p.opacity = Math.min(0.6, p.opacity + 0.001);
        } else {
          // Gentle mouse drift — particles push away slightly
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200 && dist > 0) {
            const force = (200 - dist) / 200 * 0.02;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }

          // Slow return to base velocity
          p.vx *= 0.998;
          p.vy *= 0.998;

          // Add base drift if velocity is too low
          const vel = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (vel < p.speed * 0.3) {
            const angle = Math.random() * Math.PI * 2;
            p.vx += Math.cos(angle) * 0.02;
            p.vy += Math.sin(angle) * 0.02;
          }
        }

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -10) p.x = w() + 10;
        if (p.x > w() + 10) p.x = -10;
        if (p.y < -10) p.y = h() + 10;
        if (p.y > h() + 10) p.y = -10;

        // Draw — Veridian-tinted based on progress
        const r = 110;
        const g = Math.round(180 + progress * 27); // 180→207 as progress increases
        const b = Math.round(140 + progress * 23); // 140→163
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [converging, progress, initParticles]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
