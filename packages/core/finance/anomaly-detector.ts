/**
 * Anomaly Detector — Identifies unusual financial transactions.
 *
 * Detection rules:
 * - First-time merchant: no prior transaction with same merchantNormalized
 * - Unusual amount: current > 2.5x median for this merchant (medium), > 5x (high)
 * - Duplicate charge: same merchant + amount within 24 hours
 * - Category spike: current month > 3x previous 3-month average for category
 *
 * Minimum 30 transactions before activation (returns empty otherwise).
 */

import type { TransactionStore, Transaction } from './transaction-store.js';
import { AnomalyStore, type Anomaly, type AnomalyType, type AnomalySeverity } from './anomaly-store.js';

const MIN_TRANSACTIONS_FOR_ACTIVATION = 30;

export class AnomalyDetector {
  private store: TransactionStore;
  private anomalyStore: AnomalyStore;

  constructor(store: TransactionStore, anomalyStore: AnomalyStore) {
    this.store = store;
    this.anomalyStore = anomalyStore;
  }

  /**
   * Detect anomalies in a batch of new transactions.
   * Returns empty array if total transaction count < 30.
   */
  detectAnomalies(transactions: Transaction[]): Anomaly[] {
    const totalCount = this.store.getTransactionCount();
    if (totalCount < MIN_TRANSACTIONS_FOR_ACTIVATION) return [];

    const anomalies: Anomaly[] = [];
    for (const txn of transactions) {
      anomalies.push(...this.checkTransaction(txn));
    }
    return anomalies;
  }

  /**
   * Check a single transaction for anomalies.
   */
  checkTransaction(txn: Transaction): Anomaly[] {
    const totalCount = this.store.getTransactionCount();
    if (totalCount < MIN_TRANSACTIONS_FOR_ACTIVATION) return [];

    const anomalies: Anomaly[] = [];
    if (txn.amount >= 0) return anomalies; // skip income

    // 1. First-time merchant
    const history = this.store.getMerchantHistory(txn.merchantNormalized, 20);
    const priorTxns = history.filter(h => h.id !== txn.id);
    if (priorTxns.length === 0) {
      anomalies.push(this.anomalyStore.saveAnomaly({
        transactionId: txn.id,
        type: 'first-time-merchant',
        severity: 'low',
        title: `First purchase at ${txn.merchantNormalized}`,
        description: `$${(Math.abs(txn.amount) / 100).toFixed(2)} at ${txn.merchantNormalized} — you haven't purchased here before.`,
        detectedAt: new Date().toISOString(),
        dismissed: false,
      }));
    }

    // 2. Unusual amount (only if merchant has prior history)
    if (priorTxns.length >= 2) {
      const priorAmounts = priorTxns.map(h => Math.abs(h.amount)).sort((a, b) => a - b);
      const median = priorAmounts[Math.floor(priorAmounts.length / 2)]!;
      const currentAbs = Math.abs(txn.amount);

      if (median > 0 && currentAbs > median * 5) {
        anomalies.push(this.anomalyStore.saveAnomaly({
          transactionId: txn.id,
          type: 'unusual-amount',
          severity: 'high',
          title: `Unusually large charge at ${txn.merchantNormalized}`,
          description: `$${(currentAbs / 100).toFixed(2)} is ${Math.round(currentAbs / median)}x your usual spend of $${(median / 100).toFixed(2)}.`,
          detectedAt: new Date().toISOString(),
          dismissed: false,
        }));
      } else if (median > 0 && currentAbs > median * 2.5) {
        anomalies.push(this.anomalyStore.saveAnomaly({
          transactionId: txn.id,
          type: 'unusual-amount',
          severity: 'medium',
          title: `Higher than usual charge at ${txn.merchantNormalized}`,
          description: `$${(currentAbs / 100).toFixed(2)} is ${Math.round(currentAbs / median * 10) / 10}x your usual spend of $${(median / 100).toFixed(2)}.`,
          detectedAt: new Date().toISOString(),
          dismissed: false,
        }));
      }
    }

    // 3. Duplicate charge: same merchant + amount within 24 hours
    const recentTxns = this.store.getTransactions({
      startDate: this.subtractDays(txn.date, 1),
      endDate: txn.date,
    });
    const duplicates = recentTxns.filter(r =>
      r.id !== txn.id &&
      r.merchantNormalized === txn.merchantNormalized &&
      r.amount === txn.amount
    );
    if (duplicates.length > 0) {
      anomalies.push(this.anomalyStore.saveAnomaly({
        transactionId: txn.id,
        type: 'duplicate-charge',
        severity: 'medium',
        title: `Possible duplicate charge at ${txn.merchantNormalized}`,
        description: `$${(Math.abs(txn.amount) / 100).toFixed(2)} charged at ${txn.merchantNormalized} — same amount within 24 hours.`,
        detectedAt: new Date().toISOString(),
        dismissed: false,
      }));
    }

    return anomalies;
  }

  /**
   * Check for category spending spikes (current month vs 3-month average).
   */
  checkCategorySpikes(year: number, month: number): Anomaly[] {
    const totalCount = this.store.getTransactionCount();
    if (totalCount < MIN_TRANSACTIONS_FOR_ACTIVATION) return [];

    const anomalies: Anomaly[] = [];
    const currentSpending = this.store.getMonthlySpending(year, month);

    // Calculate 3-month average for each category
    for (const catSpend of currentSpending) {
      let priorTotal = 0;
      let priorMonths = 0;

      for (let i = 1; i <= 3; i++) {
        let pm = month - i;
        let py = year;
        while (pm <= 0) { pm += 12; py--; }

        const prior = this.store.getMonthlySpending(py, pm);
        const match = prior.find(p => p.category === catSpend.category);
        if (match) {
          priorTotal += match.total;
          priorMonths++;
        }
      }

      if (priorMonths > 0) {
        const avgPrior = priorTotal / priorMonths;
        if (avgPrior > 0 && catSpend.total > avgPrior * 3) {
          anomalies.push(this.anomalyStore.saveAnomaly({
            transactionId: '',
            type: 'category-spike',
            severity: 'high',
            title: `${catSpend.category} spending spike`,
            description: `$${(catSpend.total / 100).toFixed(2)} this month vs $${(avgPrior / 100).toFixed(2)} average — ${Math.round(catSpend.total / avgPrior)}x normal.`,
            detectedAt: new Date().toISOString(),
            dismissed: false,
          }));
        }
      }
    }

    return anomalies;
  }

  getActiveAnomalies(): Anomaly[] {
    return this.anomalyStore.getActiveAnomalies();
  }

  dismissAnomaly(id: string): void {
    this.anomalyStore.dismissAnomaly(id);
  }

  private subtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0]!;
  }
}
