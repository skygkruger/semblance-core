/**
 * Model downloads are NEVER initiated from the model runtime.
 * All external model artifact fetches must use Gateway typed capabilities:
 *   - model.download
 *   - model.download_cancel
 *   - model.verify
 *
 * The Gateway is the sole supervised process with network entitlement.
 */
export const MODEL_DOWNLOAD_CAPABILITY = 'model.download' as const;
export const MODEL_DOWNLOAD_CANCEL_CAPABILITY = 'model.download_cancel' as const;
export const MODEL_VERIFY_CAPABILITY = 'model.verify' as const;

export const GATEWAY_TYPED_MODEL_CAPABILITIES = [
  MODEL_DOWNLOAD_CAPABILITY,
  MODEL_DOWNLOAD_CANCEL_CAPABILITY,
  MODEL_VERIFY_CAPABILITY,
] as const;
