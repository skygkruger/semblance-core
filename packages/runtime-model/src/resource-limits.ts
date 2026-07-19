export interface ResourceLimitConfig {
  maxMemoryBytes: number;
  maxConcurrency: number;
}

export class ResourceLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceLimitExceededError';
  }
}

export class ResourceLimitGuard {
  private activeSlots = 0;

  constructor(private readonly config: ResourceLimitConfig) {}

  get activeConcurrency(): number {
    return this.activeSlots;
  }

  get limits(): ResourceLimitConfig {
    return this.config;
  }

  assertWithinBudget(): void {
    if (this.activeSlots >= this.config.maxConcurrency) {
      throw new ResourceLimitExceededError(
        `Model concurrency limit exceeded (${this.config.maxConcurrency})`,
      );
    }

    const rss = process.memoryUsage().rss;
    if (rss > this.config.maxMemoryBytes) {
      throw new ResourceLimitExceededError(
        `Model memory limit exceeded (${rss} bytes > ${this.config.maxMemoryBytes} bytes)`,
      );
    }
  }

  acquireSlot(): void {
    this.assertWithinBudget();
    this.activeSlots += 1;
  }

  releaseSlot(): void {
    if (this.activeSlots > 0) {
      this.activeSlots -= 1;
    }
  }
}

export function parseResourceLimitConfig(env: NodeJS.ProcessEnv = process.env): ResourceLimitConfig {
  const maxMemoryMb = Number.parseInt(env.SEMBLANCE_MODEL_MAX_MEMORY_MB ?? '4096', 10);
  const maxConcurrency = Number.parseInt(env.SEMBLANCE_MODEL_MAX_CONCURRENCY ?? '2', 10);

  if (!Number.isFinite(maxMemoryMb) || maxMemoryMb <= 0) {
    throw new Error(`Invalid SEMBLANCE_MODEL_MAX_MEMORY_MB: ${env.SEMBLANCE_MODEL_MAX_MEMORY_MB ?? '(empty)'}`);
  }

  if (!Number.isFinite(maxConcurrency) || maxConcurrency <= 0) {
    throw new Error(
      `Invalid SEMBLANCE_MODEL_MAX_CONCURRENCY: ${env.SEMBLANCE_MODEL_MAX_CONCURRENCY ?? '(empty)'}`,
    );
  }

  return {
    maxMemoryBytes: maxMemoryMb * 1024 * 1024,
    maxConcurrency,
  };
}
