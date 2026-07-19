/**
 * Mobile shared-space client — thin peer surface over local workflow state.
 * Desktop uses sidecar IPC; mobile reads workflow summaries from runtime state
 * until full kernel/vault peer sync is exposed on-device.
 */

import { getRuntimeState } from '../runtime/mobile-runtime.js';

export interface MobileSharedSpaceSummary {
  sharedSpaceId: string;
  title: string;
  memberCount: number;
  itemCount: number;
  pendingApprovals: number;
}

export interface MobileSharedSpaceItemSummary {
  itemId: string;
  kind: string;
  title: string;
  status: string;
  ownerMemberId: string;
  updatedAt: string;
}

export async function listMobileSharedSpaces(): Promise<MobileSharedSpaceSummary[]> {
  const runtime = getRuntimeState();
  const summaries = runtime.sharedSpaceSummaries ?? [];
  return summaries;
}

export async function listMobileSharedSpaceItems(
  sharedSpaceId: string,
): Promise<MobileSharedSpaceItemSummary[]> {
  const runtime = getRuntimeState();
  const items = runtime.sharedSpaceItems ?? [];
  return items.filter((item) => item.sharedSpaceId === sharedSpaceId);
}
