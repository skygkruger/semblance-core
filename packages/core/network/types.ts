// Semblance Network Types — Local consensual sharing between instances.
// CRITICAL: No networking imports. Pure type definitions only.
// All network operations happen in Gateway via IPC.

/**
 * Categories of context that can be shared between Semblance instances.
 * Each category produces derived summaries, NEVER raw data.
 */
export type SharingCategory =
  | 'calendar-availability'
  | 'communication-style'
  | 'project-context'
  | 'topic-expertise'
  | 'location-context';

/**
 * Status of a sharing relationship between two instances.
 */
export type RelationshipStatus = 'pending' | 'active' | 'revoked';

/**
 * A sharing relationship between the local user and a peer.
 * Bilateral asymmetric: each side independently controls outbound categories.
 */
export interface SharingRelationship {
  id: string;
  localUserId: string;
  peerId: string;
  peerDisplayName: string;
  status: RelationshipStatus;
  /** Categories this instance shares with the peer (outbound) */
  outboundCategories: SharingCategory[];
  /** Categories the peer shares with this instance (inbound) */
  inboundCategories: SharingCategory[];
  /** Who initiated the relationship */
  initiatedBy: 'local' | 'peer';
  consentGrantedAt: string | null;
  lastSyncAt: string | null;
  /** Signed attestation of consent (JSON string) */
  consentAttestationJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * An offer to share context categories with a peer.
 */
export interface SharingOffer {
  id: string;
  fromDeviceId: string;
  fromDisplayName: string;
  /** Categories the offerer is willing to share */
  offeredCategories: SharingCategory[];
  /** Categories the offerer requests from the peer */
  requestedCategories: SharingCategory[];
  expiresAt: string;
  /** HMAC-SHA256 signature of the offer payload */
  signature: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  /** Session key half from the initiator (hex string) */
  initiatorKeyHalf?: string;
  createdAt: string;
}

/**
 * Acceptance of a sharing offer from a peer.
 */
export interface SharingAcceptance {
  offerId: string;
  acceptorDeviceId: string;
  acceptorDisplayName: string;
  /** Categories the acceptor agrees to receive */
  acceptedInboundCategories: SharingCategory[];
  /** Categories the acceptor offers back (bilateral asymmetry) */
  reciprocalOutboundCategories: SharingCategory[];
  /** Session key half from the acceptor (hex string) */
  acceptorKeyHalf: string;
  signature: string;
  createdAt: string;
}

/**
 * A derived context summary shared between instances.
 * NEVER contains raw data (email bodies, GPS coordinates, financial data).
 */
export interface SharedContext {
  id: string;
  peerId: string;
  category: SharingCategory;
  /** Human-readable summary text */
  summaryText: string;
  /** Optional structured data (JSON) */
  structuredData: Record<string, unknown> | null;
  receivedAt: string;
  updatedAt: string;
}

/**
 * Payload for revoking a sharing category or full relationship.
 */
export interface RevocationPayload {
  relationshipId: string;
  fromDeviceId: string;
  /** If null, revokes entire relationship */
  revokedCategory: SharingCategory | null;
  signature: string;
  createdAt: string;
}

/**
 * Global network configuration (singleton row).
 */
export interface NetworkConfig {
  enabled: boolean;
  syncFrequencyHours: number;
  updatedAt: string;
}

/**
 * A peer discovered via mDNS on the local network.
 */
export interface DiscoveredPeer {
  deviceId: string;
  displayName: string;
  platform: string;
  ipAddress: string;
  port: number;
  discoveredAt: string;
}

/**
 * Assembled context summary for a single category.
 * Produced by ContextAssembler from safe stores.
 */
export interface AssembledContext {
  category: SharingCategory;
  summaryText: string;
  structuredData: Record<string, unknown> | null;
  assembledAt: string;
}

/** Default offer expiration: 24 hours */
export const OFFER_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** mDNS service type for Semblance Network (distinct from Step 12 sync) */
export const NETWORK_MDNS_SERVICE_TYPE = '_semblance-network._tcp.local.';

/** Network protocol version */
export const NETWORK_PROTOCOL_VERSION = 1;
