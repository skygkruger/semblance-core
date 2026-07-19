import type { LocalExecutionParams, LocalExecutionResponse, LocalExecutionTransport } from '../types.js';

export async function executeLocalDestination(
  transport: LocalExecutionTransport,
  params: LocalExecutionParams,
): Promise<LocalExecutionResponse> {
  return transport.execute(params);
}

export function createLocalDestinationAdapter(
  transport: LocalExecutionTransport,
): LocalExecutionTransport {
  return {
    execute: (params) => executeLocalDestination(transport, params),
  };
}
