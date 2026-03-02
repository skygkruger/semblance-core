export interface SplashScreenProps {
  onBegin?: () => void;
  /** Auto-advance after this many ms. Pass 0 to disable. */
  autoAdvanceMs?: number;
}
