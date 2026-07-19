import type { GatewayOpaqueTransport, OpaqueGatewayRequest, OpaqueGatewayResponse } from '../types.js';

export async function executeSelfHostedDestination(
  transport: GatewayOpaqueTransport,
  request: OpaqueGatewayRequest,
): Promise<OpaqueGatewayResponse> {
  if (request.destination !== 'self_hosted') {
    throw new Error(`Self-hosted adapter requires destination self_hosted, got ${request.destination}`);
  }
  if (!request.selfHostedNodeId) {
    throw new Error('Self-hosted execution requires selfHostedNodeId');
  }
  return transport.execute({ ...request, destination: 'self_hosted' });
}

export function createSelfHostedDestinationAdapter(
  transport: GatewayOpaqueTransport,
): Pick<GatewayOpaqueTransport, 'execute'> {
  return {
    execute: (request) => executeSelfHostedDestination(transport, request),
  };
}
