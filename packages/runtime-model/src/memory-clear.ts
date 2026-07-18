const modelBuffers = new Map<string, Buffer>();

export function registerModelBuffer(modelId: string, buffer: Buffer): void {
  modelBuffers.set(modelId, buffer);
}

export function getLoadedBufferCount(): number {
  return modelBuffers.size;
}

export function clearModelBuffers(): void {
  for (const [modelId, buffer] of modelBuffers.entries()) {
    buffer.fill(0);
    modelBuffers.delete(modelId);
  }
}

export function clearModelBuffer(modelId: string): boolean {
  const buffer = modelBuffers.get(modelId);
  if (!buffer) {
    return false;
  }
  buffer.fill(0);
  modelBuffers.delete(modelId);
  return true;
}
