import type {
  ConfidentialGatewayRequest,
  ConfidentialGatewayResponse,
  GatewayOpaqueTransport,
} from '../types.js';

export async function executeConfidentialDestination(
  transport: GatewayOpaqueTransport,
  request: ConfidentialGatewayRequest,
): Promise<ConfidentialGatewayResponse> {
  if (request.destination !== 'confidential') {
    throw new Error(`Confidential adapter requires destination confidential, got ${request.destination}`);
  }
  return transport.executeConfidential({ ...request, destination: 'confidential' });
}

export function createConfidentialDestinationAdapter(
  transport: GatewayOpaqueTransport,
): Pick<GatewayOpaqueTransport, 'executeConfidential'> {
  return {
    executeConfidential: (request) => executeConfidentialDestination(transport, request),
  };
}
