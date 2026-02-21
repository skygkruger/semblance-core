import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Card } from '@semblance/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImportResult {
  transactionCount: number;
  merchantCount: number;
  dateRange: { start: string; end: string };
  recurringCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

interface StatementImportDialogProps {
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportPhase = 'select' | 'parsing' | 'results' | 'error';

// ─── Component ──────────────────────────────────────────────────────────────

export function StatementImportDialog({ onClose, onImportComplete }: StatementImportDialogProps) {
  const [phase, setPhase] = useState<ImportPhase>('select');
  const [result, setResult] = useState<ImportResult | null>(null);
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

      const importResult = await invoke<ImportResult>('import_statement', { filePath: selected });
      setResult(importResult);
      setPhase('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-lg mx-4 p-6">
        {/* Select Phase */}
        {phase === 'select' && (
          <div className="text-center space-y-4">
            <h2 className="text-lg font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Import Bank Statement
            </h2>

            <div className="p-8 rounded-lg border-2 border-dashed border-semblance-border dark:border-semblance-border-dark">
              <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-4">
                Select a CSV or OFX file from your bank.
              </p>
              <Button onClick={handleSelectFile}>
                Browse Files
              </Button>
            </div>

            <div className="flex items-center gap-2 justify-center text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Your financial data stays on this device. It is never sent anywhere.</span>
            </div>

            <p className="text-[11px] text-semblance-text-tertiary dark:text-semblance-text-tertiary-dark">
              Supported: CSV, OFX, QFX. Most banks let you export statements in CSV format.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Parsing Phase */}
        {phase === 'parsing' && (
          <div className="text-center space-y-4 py-8">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-semblance-primary border-t-transparent animate-spin" />
            <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Analyzing transactions...
            </p>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              Detecting merchants, recurring charges, and subscription patterns.
            </p>
          </div>
        )}

        {/* Results Phase */}
        {phase === 'results' && result && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Import Complete
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
                <p className="text-lg font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
                  {result.transactionCount}
                </p>
                <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  Transactions
                </p>
              </div>
              <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
                <p className="text-lg font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
                  {result.merchantCount}
                </p>
                <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  Merchants
                </p>
              </div>
              <div className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
                <p className="text-lg font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
                  {result.recurringCount}
                </p>
                <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  Recurring
                </p>
              </div>
              {result.forgottenCount > 0 && (
                <div className="p-3 rounded-md bg-semblance-attention/10">
                  <p className="text-lg font-semibold text-semblance-attention">
                    {result.forgottenCount}
                  </p>
                  <p className="text-xs text-semblance-attention">
                    Likely Forgotten
                  </p>
                </div>
              )}
            </div>

            {result.potentialSavings > 0 && (
              <div className="p-3 rounded-md bg-semblance-success/10 text-center">
                <p className="text-sm font-medium text-semblance-success">
                  Potential savings: ${result.potentialSavings.toFixed(2)}/year
                </p>
              </div>
            )}

            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              Date range: {result.dateRange.start} to {result.dateRange.end}
            </p>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => { onImportComplete(); onClose(); }}>
                View Subscriptions
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Error Phase */}
        {phase === 'error' && (
          <div className="text-center space-y-4 py-4">
            <p className="text-sm font-medium text-semblance-error">
              Import failed
            </p>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {error ?? 'Could not parse the statement file.'}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="secondary" onClick={() => setPhase('select')}>
                Try Again
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
