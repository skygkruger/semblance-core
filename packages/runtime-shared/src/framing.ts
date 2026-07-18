export interface RuntimeRpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RuntimeRpcError {
  code: string;
  message: string;
}

export interface RuntimeRpcResponse {
  id: number | string;
  result?: unknown;
  error?: RuntimeRpcError;
}

function encodeMessage(data: unknown): Buffer {
  const json = JSON.stringify(data);
  const payload = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function encodeRuntimeRpcMessage(data: unknown): Buffer {
  return encodeMessage(data);
}

export function decodeRuntimeRpcMessage(
  buffer: Buffer,
): { message: RuntimeRpcResponse; remainder: Buffer } | null {
  if (buffer.length < 4) {
    return null;
  }

  const messageLength = buffer.readUInt32BE(0);
  if (buffer.length < 4 + messageLength) {
    return null;
  }

  const jsonPayload = buffer.subarray(4, 4 + messageLength).toString('utf-8');
  const remainder = buffer.subarray(4 + messageLength);
  return {
    message: JSON.parse(jsonPayload) as RuntimeRpcResponse,
    remainder,
  };
}
