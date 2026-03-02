export interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  type?: string;
  autoFocus?: boolean;
  className?: string;
}
