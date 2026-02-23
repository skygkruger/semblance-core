// NDJSON Callback Protocol — reverse-call mechanism for Node.js → Rust.
//
// LOCKED DECISION: Uses NDJSON callbacks, not Tauri invoke from sidecar.
//
// Protocol:
// 1. Sidecar writes: {"type":"callback","id":"cb-xxx","method":"native_generate","params":{...}}
// 2. Rust reads this from stdout, dispatches to NativeRuntime
// 3. Rust writes back: {"type":"callback_response","id":"cb-xxx","result":{...}}
// 4. Sidecar reads this from stdin and resolves the pending Promise

export type CallbackResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export interface CallbackProtocol {
  sendCallback: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  handleCallbackResponse: (msg: { id: string; result?: unknown; error?: string }) => void;
  pendingCallbacks: Map<string, CallbackResolver>;
}

/**
 * Create an NDJSON callback protocol instance.
 * @param writer — function that writes a serialized NDJSON line (e.g., process.stdout.write)
 * @param timeoutMs — callback timeout in milliseconds (default 120_000)
 */
export function createCallbackProtocol(
  writer: (line: string) => void,
  timeoutMs = 120_000,
): CallbackProtocol {
  const pendingCallbacks = new Map<string, CallbackResolver>();
  let callbackIdCounter = 0;

  function sendCallback(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `cb-${++callbackIdCounter}`;

      const timeout = setTimeout(() => {
        pendingCallbacks.delete(id);
        reject(`Callback ${method} timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      pendingCallbacks.set(id, { resolve, reject, timeout });

      writer(JSON.stringify({ type: 'callback', id, method, params }) + '\n');
    });
  }

  function handleCallbackResponse(msg: { id: string; result?: unknown; error?: string }): void {
    const pending = pendingCallbacks.get(msg.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    pendingCallbacks.delete(msg.id);

    if (msg.error) {
      pending.reject(msg.error);
    } else {
      pending.resolve(msg.result);
    }
  }

  return { sendCallback, handleCallbackResponse, pendingCallbacks };
}
