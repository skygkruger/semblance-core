export interface SettingsAlterEgoProps {
  dollarThreshold: number;
  confirmationDisabledCategories: string[];
  onChange: (field: string, value: unknown) => void;
  onBack: () => void;
}
