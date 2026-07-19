import type { GatewayOpaqueTransport, OpaqueGatewayRequest, OpaqueGatewayResponse } from '../types.js';

export async function executeByoDestination(
  transport: GatewayOpaqueTransport,
  request: OpaqueGatewayRequest,
): Promise<OpaqueGatewayResponse> {
  if (request.destination !== 'byo') {
    throw new Error(`BYO adapter requires destination byo, got ${request.destination}`);
  }
  return transport.execute({ ...request, destination: 'byo' });
}

export function createByoDestinationAdapter(
  transport: GatewayOpaqueTransport,
): Pick<GatewayOpaqueTransport, 'execute'> {
  return {
    execute: (request) => executeByoDestination(transport, request),
  };
}
