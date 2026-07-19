/**
 * UI slot contract — extensions register React components only for manifest-declared slots.
 */

export interface ExtensionUiSlotComponentV1 {
  /** React component or lazy factory (opaque to the runner). */
  component: unknown;
  /** Lower numbers render first when multiple extensions share a slot. */
  priority?: number;
}

export interface ExtensionUiSlotRegistrationV1 {
  /** Must appear in manifest.uiSlots. */
  slotId: string;
  registration: ExtensionUiSlotComponentV1;
}

export interface ExtensionUiSlotClient {
  register(registration: ExtensionUiSlotRegistrationV1): void;
  unregister(slotId: string): void;
  listDeclaredSlots(): readonly string[];
  listRegisteredSlots(): readonly string[];
}

/** Well-known v1 UI slots (extensible; unknown slots require manifest declaration). */
export const EXTENSION_UI_SLOTS_V1 = [
  'settings.digital_representative',
  'settings.capabilities',
  'chat.sidebar',
  'dashboard.widget',
] as const;
export type ExtensionUiSlotIdV1 = (typeof EXTENSION_UI_SLOTS_V1)[number];

export function isKnownExtensionUiSlotV1(slotId: string): slotId is ExtensionUiSlotIdV1 {
  return (EXTENSION_UI_SLOTS_V1 as readonly string[]).includes(slotId);
}
