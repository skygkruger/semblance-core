/* CapabilitiesScreen — extension permission and install center (Slice 12). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SkeletonCard } from '@semblance/ui';
import {
  extensionInspect,
  extensionInstall,
  extensionListInstalled,
  extensionRevoke,
  extensionSetPermissions,
  extensionUninstall,
} from '../ipc/commands';
import type {
  AvailableExtensionIPC,
  ExtensionPermissionBundleIPC,
  InstalledExtensionIPC,
} from '../ipc/commands';
import { ContentBracket } from '../components/ContentBracket';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import './CapabilitiesScreen.css';

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
};

type PermissionCategory = keyof ExtensionPermissionBundleIPC;

const PERMISSION_CATEGORIES: Array<{ key: PermissionCategory; label: string }> = [
  { key: 'dataCapabilities', label: 'Data access' },
  { key: 'actionCapabilities', label: 'Actions' },
  { key: 'networkDestinations', label: 'Network destinations' },
  { key: 'tools', label: 'Tools' },
  { key: 'insightTypes', label: 'Insight types' },
  { key: 'uiSlots', label: 'UI slots' },
  { key: 'schedules', label: 'Schedules' },
  { key: 'entitlement', label: 'Paid terms' },
];

function emptyGrant(): ExtensionPermissionBundleIPC {
  return {
    dataCapabilities: [],
    actionCapabilities: [],
    networkDestinations: [],
    tools: [],
    insightTypes: [],
    uiSlots: [],
    schedules: [],
    entitlement: null,
  };
}

function cloneGrant(source: ExtensionPermissionBundleIPC): ExtensionPermissionBundleIPC {
  return {
    dataCapabilities: [...source.dataCapabilities],
    actionCapabilities: [...source.actionCapabilities],
    networkDestinations: [...source.networkDestinations],
    tools: [...source.tools],
    insightTypes: [...source.insightTypes],
    uiSlots: [...source.uiSlots],
    schedules: [...source.schedules],
    entitlement: source.entitlement,
  };
}

function formatPermissionValues(
  key: PermissionCategory,
  bundle: ExtensionPermissionBundleIPC,
): string[] {
  if (key === 'entitlement') {
    return bundle.entitlement ? [bundle.entitlement] : [];
  }
  return [...(bundle[key] as string[])];
}

function PermissionSection(props: {
  label: string;
  requested: string[];
  granted: string[];
  selectable?: boolean;
  selected: string[];
  onToggle?: (value: string) => void;
}) {
  const { label, requested, granted, selectable, selected, onToggle } = props;
  if (requested.length === 0) {
    return null;
  }
  return (
    <div className="capabilities-permission-section">
      <div className="capabilities-permission-section__header">
        <span className="capabilities-permission-section__label">{label}</span>
        <span className="capabilities-permission-section__count">
          {granted.length}/{requested.length} granted
        </span>
      </div>
      <ul className="capabilities-permission-list">
        {requested.map((item) => {
          const isGranted = granted.includes(item);
          const isSelected = selected.includes(item);
          return (
            <li key={item} className="capabilities-permission-item">
              {selectable ? (
                <label className="capabilities-permission-item__select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle?.(item)}
                  />
                  <span>{item}</span>
                </label>
              ) : (
                <span className={isGranted ? 'capabilities-permission-item--granted' : 'capabilities-permission-item--denied'}>
                  {item}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CapabilitiesScreen() {
  const [installed, setInstalled] = useState<InstalledExtensionIPC[]>([]);
  const [available, setAvailable] = useState<AvailableExtensionIPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectTarget, setInspectTarget] = useState<InstalledExtensionIPC | AvailableExtensionIPC | null>(null);
  const [pendingGrant, setPendingGrant] = useState<ExtensionPermissionBundleIPC>(emptyGrant());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await extensionListInstalled();
      setInstalled(result.installed);
      setAvailable(result.available);
      if (!selectedId && result.installed.length > 0) {
        setSelectedId(result.installed[0]!.manifestId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load extensions');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedInstalled = useMemo(
    () => installed.find((entry) => entry.manifestId === selectedId) ?? null,
    [installed, selectedId],
  );

  const selectedAvailable = useMemo(
    () => available.find((entry) => entry.manifestId === selectedId) ?? null,
    [available, selectedId],
  );

  useEffect(() => {
    if (selectedAvailable) {
      setPendingGrant(emptyGrant());
    } else if (selectedInstalled) {
      setPendingGrant(cloneGrant(selectedInstalled.grantedPermissions));
    }
  }, [selectedAvailable, selectedInstalled]);

  const handleInspect = async (manifestId: string) => {
    setBusy(true);
    setActionMessage(null);
    try {
      const result = await extensionInspect(manifestId);
      setInspectTarget(result.extension);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Inspect failed');
    } finally {
      setBusy(false);
    }
  };

  const togglePendingPermission = (category: PermissionCategory, value: string) => {
    setPendingGrant((current) => {
      if (category === 'entitlement') {
        return { ...current, entitlement: current.entitlement ? null : value };
      }
      const list = current[category] as string[];
      const next = list.includes(value)
        ? list.filter((entry) => entry !== value)
        : [...list, value];
      return { ...current, [category]: next };
    });
  };

  const handleInstall = async () => {
    if (!selectedAvailable) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const result = await extensionInstall({
        manifestPath: selectedAvailable.manifestPath,
        artifactPath: selectedAvailable.artifactPath,
        grantedPermissions: pendingGrant,
      });
      setActionMessage(
        result.runtimeLoaded
          ? `Installed ${result.extension.manifestId}`
          : `Installed ${result.extension.manifestId} (runtime: ${result.runtimeError ?? 'not loaded'})`,
      );
      await loadData();
      setSelectedId(result.extension.manifestId);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setBusy(false);
    }
  };

  const handleNarrow = async () => {
    if (!selectedInstalled) return;
    setBusy(true);
    setActionMessage(null);
    try {
      await extensionSetPermissions(selectedInstalled.manifestId, pendingGrant);
      setActionMessage(`Narrowed permissions for ${selectedInstalled.manifestId}`);
      await loadData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Permission update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!selectedInstalled) return;
    setBusy(true);
    setActionMessage(null);
    try {
      await extensionRevoke(selectedInstalled.manifestId);
      setActionMessage(`Revoked ${selectedInstalled.manifestId}`);
      await loadData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    if (!selectedInstalled) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const retain = selectedInstalled.migrationUninstall === 'retain_user_data';
      await extensionUninstall(selectedInstalled.manifestId, retain);
      setActionMessage(`Uninstalled ${selectedInstalled.manifestId}`);
      setSelectedId(null);
      await loadData();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Uninstall failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="capabilities-screen" style={{ backgroundColor: COLORS.background }}>
        <ContentBracket>
          <h1 className="capabilities-screen__title">Capabilities</h1>
          <SkeletonCard variant="generic" message="Loading extensions" subMessage="Reading permission store" showSpinner />
        </ContentBracket>
      </div>
    );
  }

  const detail = selectedInstalled ?? selectedAvailable;
  const requested = detail?.requestedPermissions ?? emptyGrant();
  const granted = selectedInstalled?.grantedPermissions ?? emptyGrant();

  return (
    <div className="capabilities-screen" style={{ backgroundColor: COLORS.background }}>
      <ContentBracket>
        <header className="capabilities-screen__header">
          <div>
            <h1 className="capabilities-screen__title" style={{ color: COLORS.text }}>Capabilities</h1>
            <p className="capabilities-screen__subtitle" style={{ color: COLORS.muted }}>
              Installed extensions, requested permissions, and explicit grants. Nothing runs beyond what you approve.
            </p>
          </div>
        </header>

        {error && (
          <div className="capabilities-banner capabilities-banner--critical">{error}</div>
        )}
        {actionMessage && (
          <div className="capabilities-banner capabilities-banner--info">{actionMessage}</div>
        )}

        <div className="capabilities-layout">
          <aside className="capabilities-list-panel" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
            <h2 className="capabilities-panel-title">Installed</h2>
            {installed.length === 0 ? (
              <EmptyFeatureState message="No extensions installed. Signed extensions you install will appear here with their granted permissions." />
            ) : (
              <ul className="capabilities-extension-list">
                {installed.map((entry) => (
                  <li key={entry.manifestId}>
                    <button
                      type="button"
                      className={`capabilities-extension-item${selectedId === entry.manifestId ? ' capabilities-extension-item--active' : ''}${entry.revoked ? ' capabilities-extension-item--revoked' : ''}`}
                      onClick={() => setSelectedId(entry.manifestId)}
                    >
                      <span className="capabilities-extension-item__name">{entry.manifestId}</span>
                      <span className="capabilities-extension-item__meta">
                        v{entry.version} · {entry.publisher}
                      </span>
                      {entry.revoked && <span className="capabilities-extension-item__badge">Revoked</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="capabilities-panel-title">Available</h2>
            {available.length === 0 ? (
              <EmptyFeatureState message="No catalog extensions. Place signed manifests in ~/.semblance/data/extensions/catalog/ to offer installable packages locally." />
            ) : (
              <ul className="capabilities-extension-list">
                {available.map((entry) => (
                  <li key={entry.manifestId}>
                    <button
                      type="button"
                      className={`capabilities-extension-item${selectedId === entry.manifestId ? ' capabilities-extension-item--active' : ''}`}
                      onClick={() => setSelectedId(entry.manifestId)}
                    >
                      <span className="capabilities-extension-item__name">{entry.manifestId}</span>
                      <span className="capabilities-extension-item__meta">
                        v{entry.version} · {entry.publisher}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="capabilities-detail-panel" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border }}>
            {!detail ? (
              <EmptyFeatureState message="Select an installed or available extension to review permissions and take action." />
            ) : (
              <>
                <div className="capabilities-detail-header">
                  <div>
                    <h2 style={{ color: COLORS.text }}>{detail.manifestId}</h2>
                    <p style={{ color: COLORS.muted }}>
                      {detail.publisher} · v{detail.version}
                    </p>
                  </div>
                  <div className="capabilities-detail-actions">
                    <button type="button" className="capabilities-btn capabilities-btn--ghost" disabled={busy} onClick={() => void handleInspect(detail.manifestId)}>
                      Inspect
                    </button>
                    {selectedInstalled && !selectedInstalled.revoked && (
                      <>
                        <button type="button" className="capabilities-btn capabilities-btn--ghost" disabled={busy} onClick={() => void handleNarrow()}>
                          Narrow
                        </button>
                        <button type="button" className="capabilities-btn capabilities-btn--caution" disabled={busy} onClick={() => void handleRevoke()}>
                          Revoke
                        </button>
                        <button type="button" className="capabilities-btn capabilities-btn--critical" disabled={busy} onClick={() => void handleUninstall()}>
                          Uninstall
                        </button>
                      </>
                    )}
                    {selectedAvailable && (
                      <button type="button" className="capabilities-btn capabilities-btn--primary" disabled={busy} onClick={() => void handleInstall()}>
                        Install with grant
                      </button>
                    )}
                  </div>
                </div>

                {PERMISSION_CATEGORIES.map(({ key, label }) => (
                  <PermissionSection
                    key={key}
                    label={label}
                    requested={formatPermissionValues(key, requested)}
                    granted={formatPermissionValues(key, granted)}
                    selectable={Boolean(selectedAvailable || (selectedInstalled && !selectedInstalled.revoked))}
                    selected={formatPermissionValues(key, pendingGrant)}
                    onToggle={(value) => togglePendingPermission(key, value)}
                  />
                ))}

                {inspectTarget && (
                  <div className="capabilities-inspect-panel" style={{ borderColor: COLORS.border }}>
                    <h3 style={{ color: COLORS.silver }}>Inspect payload</h3>
                    <pre>{JSON.stringify(inspectTarget, null, 2)}</pre>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </ContentBracket>
    </div>
  );
}
