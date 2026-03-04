import { useState } from 'react';
import { Button, Card } from '@semblance/ui';
import { importStatement } from '../ipc/commands';
import type { ImportStatementResult } from '../ipc/types';
import './StatementImportDialog.css';

interface StatementImportDialogProps {
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportPhase = 'select' | 'parsing' | 'results' | 'error';

export function StatementImportDialog({ onClose, onImportComplete }: StatementImportDialogProps) {
  const [phase, setPhase] = useState<ImportPhase>('select');
  const [result, setResult] = useState<ImportStatementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectFile = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Bank Statements', extensions: ['csv', 'ofx', 'qfx'] },
        ],
      });

      if (!selected || typeof selected !== 'string') return;

      setPhase('parsing');

      const importResult = await importStatement(selected);
      setResult(importResult);
      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  return (
    <div className="statement-import__overlay">
      <Card className="statement-import__card">
        {/* Select Phase */}
        {phase === 'select' && (
          <div>
            <h2 className="statement-import__title">Import Bank Statement</h2>

            <div className="statement-import__dropzone">
              <p className="statement-import__dropzone-text">
                Select a CSV or OFX file from your bank.
              </p>
              <Button onClick={handleSelectFile}>Browse Files</Button>
            </div>

            <div className="statement-import__privacy-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Your financial data stays on this device. It is never sent anywhere.</span>
            </div>

            <p className="statement-import__hint">
              Supported: CSV, OFX, QFX. Most banks let you export statements in CSV format.
            </p>

            <button type="button" onClick={onClose} className="statement-import__cancel">
              Cancel
            </button>
          </div>
        )}

        {/* Parsing Phase */}
        {phase === 'parsing' && (
          <div style={{ padding: 'var(--sp-8) 0', textAlign: 'center' }}>
            <div className="statement-import__spinner" />
            <p className="statement-import__status">Analyzing transactions...</p>
            <p className="statement-import__substatus">
              Detecting merchants, recurring charges, and subscription patterns.
            </p>
          </div>
        )}

        {/* Results Phase */}
        {phase === 'results' && result && (
          <div>
            <h2 className="statement-import__title" style={{ textAlign: 'left' }}>Import Complete</h2>

            <div className="statement-import__grid">
              <div className="statement-import__stat">
                <p className="statement-import__stat-value">{result.transactionCount}</p>
                <p className="statement-import__stat-label">Transactions</p>
              </div>
              <div className="statement-import__stat">
                <p className="statement-import__stat-value">{result.merchantCount}</p>
                <p className="statement-import__stat-label">Merchants</p>
              </div>
              <div className="statement-import__stat">
                <p className="statement-import__stat-value">{result.recurringCount}</p>
                <p className="statement-import__stat-label">Recurring</p>
              </div>
              {result.forgottenCount > 0 && (
                <div className="statement-import__stat statement-import__stat--attention">
                  <p className="statement-import__stat-value">{result.forgottenCount}</p>
                  <p className="statement-import__stat-label">Likely Forgotten</p>
                </div>
              )}
            </div>

            {result.potentialSavings > 0 && (
              <div className="statement-import__savings">
                <p className="statement-import__savings-text">
                  Potential savings: ${result.potentialSavings.toFixed(2)}/year
                </p>
              </div>
            )}

            <p className="statement-import__date-range">
              Date range: {result.dateRange.start} to {result.dateRange.end}
            </p>

            <div className="statement-import__result-actions">
              <Button onClick={() => { onImportComplete(); onClose(); }}>View Subscriptions</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {/* Error Phase */}
        {phase === 'error' && (
          <div style={{ padding: 'var(--sp-4) 0', textAlign: 'center' }}>
            <p className="statement-import__error-title">Import failed</p>
            <p className="statement-import__error-message">
              {error ?? 'Could not parse the statement file.'}
            </p>
            <div className="statement-import__error-actions">
              <Button variant="ghost" onClick={() => setPhase('select')}>Try Again</Button>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
