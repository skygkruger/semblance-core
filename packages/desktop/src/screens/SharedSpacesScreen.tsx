/* SharedSpacesScreen — family/team/org collaboration surface (Slice 13). */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { SkeletonCard } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import {
  sharedSpaceApprove,
  sharedSpaceListPending,
  sharedSpaceListShared,
  sharedSpacePublish,
  sharedSpaceStatus,
} from '../ipc/commands';
import type {
  SharedSpaceMemberIPC,
  SharedSpacePendingApprovalIPC,
  SharedSpaceProjectedEventIPC,
  SharedSpaceStatusIPC,
} from '../ipc/commands';

const COLORS = {
  background: '#0B0E11',
  surface: '#111518',
  surfaceElevated: '#171B1F',
  veridian: '#6ECFA3',
  caution: '#B09A8A',
  critical: '#B07A8A',
  silver: '#8593A4',
  text: '#A8B4C0',
  muted: '#5E6B7C',
  border: 'rgba(255,255,255,0.09)',
} as const;

const LOCAL_MEMBER_ID = 'member-local-viewer-001';
const LOCAL_PERSONAL_ROOT_ID = 'root-personal-local-viewer-001';
const LOCAL_ROLE = 'member' as const;

function parsePayloadPreview(payloadPlaintext: string): string {
  try {
    const parsed = JSON.parse(payloadPlaintext) as { title?: string; summary?: string; kind?: string };
    if (parsed.title) {
      return parsed.title;
    }
    if (parsed.summary) {
      return parsed.summary;
    }
  } catch {
    // fall through
  }
  return payloadPlaintext.slice(0, 120);
}

export function SharedSpacesScreen() {
  const [spaces, setSpaces] = useState<SharedSpaceStatusIPC[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<SharedSpaceMemberIPC[]>([]);
  const [sharedEvents, setSharedEvents] = useState<SharedSpaceProjectedEventIPC[]>([]);
  const [pending, setPending] = useState<SharedSpacePendingApprovalIPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const selectedSpace = useMemo(
    () => spaces.find((space) => space.sharedSpaceId === selectedSpaceId) ?? null,
    [spaces, selectedSpaceId],
  );

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sharedSpaceStatus();
      const nextSpaces = result.spaces ?? [];
      setSpaces(nextSpaces);
      if (!selectedSpaceId && nextSpaces.length > 0) {
        setSelectedSpaceId(nextSpaces[0]!.sharedSpaceId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedSpaceId]);

  const loadSpaceDetails = useCallback(async (sharedSpaceId: string) => {
    setError(null);
    try {
      const [statusResult, sharedResult, pendingResult] = await Promise.all([
        sharedSpaceStatus({ sharedSpaceId }),
        sharedSpaceListShared({ sharedSpaceId, viewerMemberId: LOCAL_MEMBER_ID }),
        sharedSpaceListPending({ sharedSpaceId }),
      ]);
      setMembers(statusResult.members ?? []);
      setSharedEvents(sharedResult.events ?? []);
      setPending(pendingResult.pending ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    if (selectedSpaceId) {
      void loadSpaceDetails(selectedSpaceId);
    }
  }, [selectedSpaceId, loadSpaceDetails]);

  const handleApprove = useCallback(async (actionId: string) => {
    if (!selectedSpaceId) {
      return;
    }
    setBusyActionId(actionId);
    setActionMessage(null);
    try {
      await sharedSpaceApprove({
        actionId,
        approverMemberId: LOCAL_MEMBER_ID,
        actorMemberId: LOCAL_MEMBER_ID,
        actorPersonalRootId: LOCAL_PERSONAL_ROOT_ID,
        actorRole: LOCAL_ROLE,
      });
      setActionMessage(`Approved ${actionId}`);
      await loadSpaceDetails(selectedSpaceId);
    } catch (err) {
      setActionMessage((err as Error).message);
    } finally {
      setBusyActionId(null);
    }
  }, [loadSpaceDetails, selectedSpaceId]);

  const handlePublishDemo = useCallback(async () => {
    if (!selectedSpaceId) {
      return;
    }
    setActionMessage(null);
    try {
      const result = await sharedSpacePublish({
        sharedSpaceId: selectedSpaceId,
        actorMemberId: LOCAL_MEMBER_ID,
        actorPersonalRootId: LOCAL_PERSONAL_ROOT_ID,
        actorRole: LOCAL_ROLE,
        personalRecord: {
          recordId: `personal-record-${Date.now()}`,
          recordHash: `hash-${Date.now()}`,
          payloadPlaintext: JSON.stringify({
            title: 'Shared coordination note',
            kind: 'commitment',
            summary: 'Explicit publication from personal vault selection',
          }),
        },
        consent: {
          schemaVersion: 1,
          protocolVersion: 'shared-space/v1',
          consentRecordId: `consent-${LOCAL_MEMBER_ID}`,
          sharedSpaceId: selectedSpaceId,
          memberId: LOCAL_MEMBER_ID,
          personalRootId: LOCAL_PERSONAL_ROOT_ID,
          requestedRole: LOCAL_ROLE,
          consentTextHash: 'consent-hash-local-viewer-v1',
          grantedAt: new Date().toISOString(),
          memberSignature: 'sig-local-viewer',
        },
      });
      const publishStatus = result.result?.status ?? result.status;
      const publishReason = result.result?.reason ?? result.reason;
      setActionMessage(
        publishStatus === 'published'
          ? 'Publication completed'
          : publishStatus === 'needs_approval'
            ? 'Publication queued for dual approval'
            : `Publication denied: ${publishReason ?? 'policy'}`,
      );
      await loadSpaceDetails(selectedSpaceId);
    } catch (err) {
      setActionMessage((err as Error).message);
    }
  }, [loadSpaceDetails, selectedSpaceId]);

  return (
    <ContentBracket
      title="Shared Spaces"
      subtitle="Collaborate on explicitly published shared records. Personal vaults stay separate."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: COLORS.text }}>
        {loading ? (
          <SkeletonCard lines={4} />
        ) : spaces.length === 0 ? (
          <EmptyFeatureState
            title="No shared spaces yet"
            description="Create a shared space from onboarding or invite flow to coordinate commitments, plans, and delegated actions."
          />
        ) : (
          <>
            <section
              style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, color: COLORS.text, fontSize: 16 }}>Spaces</h3>
                  <p style={{ margin: '6px 0 0', color: COLORS.muted, fontSize: 13 }}>
                    {spaces.length} active shared space{spaces.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSpaces()}
                  style={{
                    background: COLORS.surfaceElevated,
                    color: COLORS.veridian,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {spaces.map((space) => {
                  const active = space.sharedSpaceId === selectedSpaceId;
                  return (
                    <button
                      key={space.sharedSpaceId}
                      type="button"
                      onClick={() => setSelectedSpaceId(space.sharedSpaceId)}
                      style={{
                        background: active ? 'rgba(110, 207, 163, 0.12)' : COLORS.surfaceElevated,
                        color: active ? COLORS.veridian : COLORS.text,
                        border: `1px solid ${active ? 'rgba(110, 207, 163, 0.35)' : COLORS.border}`,
                        borderRadius: 999,
                        padding: '8px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      {space.sharedSpaceId}
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedSpace && (
              <>
                <section
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  <MetricCard label="Members" value={String(selectedSpace.activeMemberCount)} />
                  <MetricCard label="Membership epoch" value={String(selectedSpace.membershipEpoch)} />
                  <MetricCard label="Shared items" value={String(sharedEvents.length)} />
                  <MetricCard label="Pending approvals" value={String(pending.length)} accent={pending.length > 0 ? COLORS.caution : COLORS.veridian} />
                </section>

                <Panel title="Members">
                  {members.length === 0 ? (
                    <p style={{ margin: 0, color: COLORS.muted }}>No members loaded.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                      {members.map((member) => (
                        <li
                          key={member.memberId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: COLORS.surfaceElevated,
                          }}
                        >
                          <span>{member.memberId}</span>
                          <span style={{ color: COLORS.silver }}>{member.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel
                  title="Pending approvals"
                  action={(
                    <button
                      type="button"
                      onClick={() => void handlePublishDemo()}
                      style={actionButtonStyle(COLORS.veridian)}
                    >
                      Publish selected record
                    </button>
                  )}
                >
                  {pending.length === 0 ? (
                    <p style={{ margin: 0, color: COLORS.muted }}>No pending shared-space approvals.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                      {pending.map((entry) => (
                        <li
                          key={entry.actionId}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            background: COLORS.surfaceElevated,
                            border: `1px solid ${COLORS.border}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                              <div style={{ color: COLORS.text, fontWeight: 600 }}>{entry.actionType}</div>
                              <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
                                {entry.actionId} · actor {entry.actorMemberId}
                              </div>
                              <div style={{ color: COLORS.silver, fontSize: 12, marginTop: 4 }}>
                                Approvals: {entry.approvals.length}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busyActionId === entry.actionId}
                              onClick={() => void handleApprove(entry.actionId)}
                              style={actionButtonStyle(COLORS.caution)}
                            >
                              Approve
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="Shared items">
                  {sharedEvents.length === 0 ? (
                    <p style={{ margin: 0, color: COLORS.muted }}>No shared events visible for this member.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                      {sharedEvents.map((event) => (
                        <li
                          key={event.eventId}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            background: COLORS.surfaceElevated,
                            border: `1px solid ${COLORS.border}`,
                          }}
                        >
                          <div style={{ color: COLORS.text, fontWeight: 600 }}>
                            {parsePayloadPreview(event.payloadPlaintext)}
                          </div>
                          <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
                            {event.eventType} · {event.publisherMemberId} · epoch {event.membershipEpoch}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </>
            )}
          </>
        )}

        {error && (
          <p style={{ color: COLORS.critical, margin: 0 }}>{error}</p>
        )}
        {actionMessage && (
          <p style={{ color: COLORS.silver, margin: 0 }}>{actionMessage}</p>
        )}
      </div>
    </ContentBracket>
  );
}

function MetricCard(props: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ color: '#5E6B7C', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {props.label}
      </div>
      <div style={{ color: props.accent ?? '#6ECFA3', fontSize: 24, marginTop: 8, fontWeight: 600 }}>
        {props.value}
      </div>
    </div>
  );
}

function Panel(props: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section
      style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#A8B4C0', fontSize: 16 }}>{props.title}</h3>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

function actionButtonStyle(color: string): CSSProperties {
  return {
    background: 'rgba(255,255,255,0.04)',
    color,
    border: `1px solid ${color}`,
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}
