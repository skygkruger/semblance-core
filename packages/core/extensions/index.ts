// Extension system — barrel exports.

export type {
  SemblanceExtension,
  ExtensionTool,
  ExtensionInsightTracker,
  ExtensionGatewayAdapter,
  ExtensionServiceAdapter,
  ExtensionInitContext,
  GatewayExtensionContext,
  ToolHandler,
  ToolHandlerResult,
  UISlotComponent,
} from './types.js';

export {
  loadExtensions,
  getLoadedExtensions,
  registerExtension,
  clearExtensions,
} from './loader.js';

export {
  registerSlot,
  getSlot,
  hasSlot,
  getSlotNames,
  clearSlots,
} from './ui-slots.js';
