import Svg, { Path, Circle, Line } from 'react-native-svg';
import type { IconProps } from './SettingsIcons.types';

export function BackArrow({ size = 20, color = '#A8B4C0', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function ChevronRight({ size = 16, color = '#5E6B7C', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function GuardianIcon({ size = 20, color = '#5E6B7C', strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Circle cx="12" cy="12" r="8" />
    </Svg>
  );
}

export function PartnerIcon({ size = 20, color = '#5E6B7C', strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 12h12" />
      <Path d="M12 6v12" />
      <Circle cx="12" cy="12" r="9" />
    </Svg>
  );
}

export function AlterEgoIcon({ size = 20, color = '#5E6B7C', strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="3" />
      <Line x1="12" y1="2" x2="12" y2="6" />
      <Line x1="12" y1="18" x2="12" y2="22" />
      <Line x1="2" y1="12" x2="6" y2="12" />
      <Line x1="18" y1="12" x2="22" y2="12" />
      <Line x1="5.6" y1="5.6" x2="8.5" y2="8.5" />
      <Line x1="15.5" y1="15.5" x2="18.4" y2="18.4" />
      <Line x1="5.6" y1="18.4" x2="8.5" y2="15.5" />
      <Line x1="15.5" y1="8.5" x2="18.4" y2="5.6" />
    </Svg>
  );
}

export function ShieldCheck({ size = 16, color = '#6ECFA3', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

export function ShieldAlert({ size = 16, color = '#C9A85C', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Path d="M12 8v4" />
      <Path d="M12 16h.01" />
    </Svg>
  );
}
