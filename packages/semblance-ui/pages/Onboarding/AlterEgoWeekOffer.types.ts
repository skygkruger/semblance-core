export interface AlterEgoWeekOfferProps {
  /** Called when user accepts the Alter Ego Week offer */
  onAccept?: () => void;
  /** Called when user skips the offer */
  onSkip?: () => void;
  /** Called to go back to previous step */
  onBack?: () => void;
}
