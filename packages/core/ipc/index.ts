// IPC Transport Abstraction — packages/core/ipc/
// Provides platform-independent transport layer for Core <-> Gateway communication.

export type { IPCTransport, IPCHandler } from './transport.js';
export { SocketTransport, type SocketTransportConfig } from './socket-transport.js';
export { InProcessTransport } from './in-process-transport.js';
export { TunnelTransport, TunnelTransportError, type TunnelTransportConfig } from './tunnel-transport.js';
