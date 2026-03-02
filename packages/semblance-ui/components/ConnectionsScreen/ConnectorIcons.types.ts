/**
 * ConnectorIcons — shared props for category SVG icons.
 * Thin stroke (1.5px), currentColor, 16x16 viewBox.
 */

export interface IconProps {
  size?: number;
  /** Color string override. On web: CSS color. On native: hex/rgba. */
  color?: string;
}
