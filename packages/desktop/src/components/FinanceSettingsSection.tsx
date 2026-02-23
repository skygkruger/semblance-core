/**
 * Finance Settings Section — Settings panel for financial data management.
 *
 * - Import CSV/OFX button
 * - Plaid connection card (premium: connect; free: Digital Representative prompt)
 * - Connected accounts list
 * - Auto-sync toggle
 * - Anomaly sensitivity selector
 */

import { useAppState, useAppDispatch } from '../state/AppState';

export interface FinanceSettingsSectionProps {
  isPremium: boolean;
  onImportCSV: () => void;
  onImportOFX: () => void;
  onConnectPlaid: () => void;
  onDisconnectPlaid: () => void;
  onActivateDigitalRepresentative: () => void;
}

export function FinanceSettingsSection(props: FinanceSettingsSectionProps) {
  const {
    isPremium,
    onImportCSV,
    onImportOFX,
    onConnectPlaid,
    onDisconnectPlaid,
    onActivateDigitalRepresentative,
  } = props;

  const state = useAppState();
  const dispatch = useAppDispatch();
  const { financeSettings } = state;

  const updateSettings = (updates: Partial<typeof financeSettings>) => {
    dispatch({
      type: 'SET_FINANCE_SETTINGS',
      settings: { ...financeSettings, ...updates },
    });
  };

  return (
    <div className="space-y-6" data-testid="finance-settings">
      {/* Import Section */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Import Transactions</h3>
        <p className="text-xs text-muted mb-3">Import bank statements from CSV or OFX files.</p>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 border border-muted rounded text-sm font-mono hover:border-text"
            onClick={onImportCSV}
            data-testid="import-csv-button"
          >
            Import CSV
          </button>
          <button
            className="px-3 py-1.5 border border-muted rounded text-sm font-mono hover:border-text"
            onClick={onImportOFX}
            data-testid="import-ofx-button"
          >
            Import OFX
          </button>
        </div>
        {financeSettings.lastImportAt && (
          <p className="text-xs text-muted mt-2">
            Last import: {new Date(financeSettings.lastImportAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Plaid Connection */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Bank Connection</h3>
        {isPremium ? (
          financeSettings.plaidConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm">Connected</span>
              </div>

              {/* Connected Accounts */}
              {financeSettings.connectedAccounts.length > 0 && (
                <div className="space-y-1">
                  {financeSettings.connectedAccounts.map(acc => (
                    <div key={acc.id} className="text-xs text-muted flex gap-2">
                      <span>{acc.institution}</span>
                      <span>{acc.name}</span>
                      <span className="text-muted">({acc.type})</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="text-xs text-muted hover:text-red-400"
                onClick={onDisconnectPlaid}
                data-testid="disconnect-plaid"
              >
                Disconnect bank
              </button>
            </div>
          ) : (
            <button
              className="px-3 py-1.5 border border-accent rounded text-sm font-mono"
              onClick={onConnectPlaid}
              data-testid="connect-plaid"
            >
              Connect bank account
            </button>
          )
        ) : (
          <div className="border border-muted rounded-lg p-4 text-center space-y-2" data-testid="plaid-premium-prompt">
            <p className="text-sm text-muted">
              Real-time bank connection requires your Digital Representative.
            </p>
            <button
              className="px-3 py-1.5 bg-accent text-bg rounded text-sm font-mono"
              onClick={onActivateDigitalRepresentative}
              data-testid="activate-digital-representative-plaid"
            >
              Activate your Digital Representative
            </button>
          </div>
        )}
      </div>

      {/* Auto-Sync Toggle (premium only) */}
      {isPremium && financeSettings.plaidConnected && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Auto-sync transactions</p>
            <p className="text-xs text-muted">Automatically sync new transactions from your bank</p>
          </div>
          <button
            className={`w-10 h-5 rounded-full transition-colors ${
              financeSettings.autoSyncEnabled ? 'bg-accent' : 'bg-muted'
            }`}
            onClick={() => updateSettings({ autoSyncEnabled: !financeSettings.autoSyncEnabled })}
            role="switch"
            aria-checked={financeSettings.autoSyncEnabled}
            data-testid="auto-sync-toggle"
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                financeSettings.autoSyncEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}

      {/* Anomaly Sensitivity */}
      {isPremium && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Anomaly Sensitivity</h3>
          <p className="text-xs text-muted mb-2">How aggressively should unusual transactions be flagged?</p>
          <div className="flex gap-2" data-testid="anomaly-sensitivity">
            {(['low', 'medium', 'high'] as const).map(level => (
              <button
                key={level}
                className={`px-3 py-1 text-xs rounded font-mono ${
                  financeSettings.anomalySensitivity === level
                    ? 'bg-accent text-bg'
                    : 'border border-muted'
                }`}
                onClick={() => updateSettings({ anomalySensitivity: level })}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
