// IP Adapter Registry — Runtime registration point for proprietary implementations.
// When @semblance/dr loads, it registers real implementations here.
// Without DR, all getters return null — features degrade gracefully.

import type { IStatementParser, IMerchantNormalizer, IRecurringDetector } from '../finance/interfaces.js';
import type { IDarkPatternDetector } from '../defense/interfaces.js';
import type { StyleAdapter } from '../style/style-adapter.js';
import type { IWeeklyDigestGenerator } from '../digest/interfaces.js';
import type { IAlterEgoWeekEngine } from '../agent/alter-ego-week-types.js';

class IPAdapterRegistry {
  private _statementParser: IStatementParser | null = null;
  private _merchantNormalizer: IMerchantNormalizer | null = null;
  private _recurringDetector: IRecurringDetector | null = null;
  private _darkPatternDetector: IDarkPatternDetector | null = null;
  private _styleAdapter: StyleAdapter | null = null;
  private _weeklyDigestGenerator: IWeeklyDigestGenerator | null = null;
  private _alterEgoWeekEngine: IAlterEgoWeekEngine | null = null;

  // ─── Registration ─────────────────────────────────────────────────────

  registerFinance(
    statementParser: IStatementParser,
    merchantNormalizer: IMerchantNormalizer,
    recurringDetector: IRecurringDetector,
  ): void {
    this._statementParser = statementParser;
    this._merchantNormalizer = merchantNormalizer;
    this._recurringDetector = recurringDetector;
  }

  registerDefense(darkPatternDetector: IDarkPatternDetector): void {
    this._darkPatternDetector = darkPatternDetector;
  }

  registerStyleAdapter(styleAdapter: StyleAdapter): void {
    this._styleAdapter = styleAdapter;
  }

  registerDigest(weeklyDigestGenerator: IWeeklyDigestGenerator): void {
    this._weeklyDigestGenerator = weeklyDigestGenerator;
  }

  registerAlterEgoWeek(alterEgoWeekEngine: IAlterEgoWeekEngine): void {
    this._alterEgoWeekEngine = alterEgoWeekEngine;
  }

  // ─── Getters ──────────────────────────────────────────────────────────

  get statementParser(): IStatementParser | null {
    return this._statementParser;
  }

  get merchantNormalizer(): IMerchantNormalizer | null {
    return this._merchantNormalizer;
  }

  get recurringDetector(): IRecurringDetector | null {
    return this._recurringDetector;
  }

  get darkPatternDetector(): IDarkPatternDetector | null {
    return this._darkPatternDetector;
  }

  get styleAdapter(): StyleAdapter | null {
    return this._styleAdapter;
  }

  get weeklyDigestGenerator(): IWeeklyDigestGenerator | null {
    return this._weeklyDigestGenerator;
  }

  get alterEgoWeekEngine(): IAlterEgoWeekEngine | null {
    return this._alterEgoWeekEngine;
  }

  get isDRLoaded(): boolean {
    return this._styleAdapter !== null || this._statementParser !== null;
  }
}

export const ipAdapters = new IPAdapterRegistry();
