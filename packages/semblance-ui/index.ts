// @semblance/ui — Shared component library entry point
// Re-exports all design tokens and components.

// CSS Tokens
import './tokens/opal.css';

// Design Tokens
export { colors, colorTokens } from './tokens/colors.js';
export { fontFamily, fontSize, fontWeight, lineHeight, typographyTokens } from './tokens/typography.js';
export { spacing, containerWidth, spacingTokens } from './tokens/spacing.js';
export { shadows, shadowsDark, borderRadius, shadowTokens } from './tokens/shadows.js';
export { duration, easing, motionPresets, motionTokens } from './tokens/motion.js';
export { breakpoints, layoutGrid, breakpointTokens, mediaQuery } from './tokens/breakpoints.js';

// Components
export { Button } from './components/Button/index.js';
export { Input } from './components/Input/index.js';
export { Card } from './components/Card/index.js';
export { ActionCard } from './components/ActionCard/index.js';
export { StatusIndicator } from './components/StatusIndicator/index.js';
export { PrivacyBadge } from './components/PrivacyBadge/index.js';
export { ToastContainer } from './components/Toast/index.js';
export type { ToastItem, ToastVariant } from './components/Toast/index.js';
export { Navigation } from './components/Navigation/index.js';
export type { NavItem } from './components/Navigation/index.js';
export { ChatBubble } from './components/ChatBubble/index.js';
export { ChatInput } from './components/ChatInput/index.js';
export { ProgressBar } from './components/ProgressBar/index.js';
export { DirectoryPicker } from './components/DirectoryPicker/index.js';
export type { DirectoryEntry } from './components/DirectoryPicker/index.js';
export { AutonomySelector } from './components/AutonomySelector/index.js';
export type { AutonomyTier } from './components/AutonomySelector/index.js';
export { ThemeToggle } from './components/ThemeToggle/index.js';
export type { ThemeMode } from './components/ThemeToggle/index.js';
export { CredentialForm } from './components/CredentialForm/index.js';
export type { CredentialFormData, ProviderPreset as CredentialProviderPreset } from './components/CredentialForm/index.js';

// v3 Components
export { Wordmark } from './components/Wordmark/index.js';
export { LogoMark } from './components/LogoMark/index.js';
export { DotMatrix } from './components/DotMatrix/index.js';
export { ApprovalCard } from './components/ApprovalCard/index.js';
export { BriefingCard } from './components/BriefingCard/index.js';
export { ActionLogItem } from './components/ActionLogItem/index.js';
export { AgentInput } from './components/AgentInput/index.js';
export { DesktopSidebar } from './components/Nav/DesktopSidebar.js';
export { MobileTabBar } from './components/Nav/MobileTabBar.js';
export { KnowledgeGraph } from './components/KnowledgeGraph/index.js';
export { PrivacyDashboard } from './components/PrivacyDashboard/index.js';
export { WireframeSpinner } from './components/WireframeSpinner/index.js';

// License / Premium
export { FeatureGate } from './components/FeatureGate/index.js';
export { UpgradeScreen } from './components/UpgradeScreen/index.js';
export { LicenseActivation } from './components/LicenseActivation/index.js';
export { FoundingMemberBadge } from './components/FoundingMemberBadge/index.js';
