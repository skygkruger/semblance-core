import type { ProcessType } from '@semblance/protocol';

export interface RuntimeLogger {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createRuntimeLogger(processType: ProcessType): RuntimeLogger {
  const prefix = `[runtime-${processType}]`;

  const write = (level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void => {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.error(`${prefix} ${level.toUpperCase()}: ${message}${suffix}`);
  };

  return {
    info: (message, extra) => write('info', message, extra),
    warn: (message, extra) => write('warn', message, extra),
    error: (message, extra) => write('error', message, extra),
  };
}
