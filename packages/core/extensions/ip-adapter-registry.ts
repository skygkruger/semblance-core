// IP Adapter Registry — Runtime registration point for proprietary implementations.
// When @semblance/dr loads, it registers real implementations here.
// Without DR, all getters return null — features degrade gracefully.

import type { IStatementParser, IMerchantNormalizer, IRecurringDetector } from '../finance/interfaces.js';
import type { IDarkPatternDetector } from '../defense/interfaces.js';
import type { StyleAdapter } from '../style/style-adapter.js';
import type { IWeeklyDigestGenerator } from '../digest/interfaces.js';
import type { IAlterEgoWeekEngine } from '../agent/alter-ego-week-types.js';
import type {
  FollowUpTrackerPort,
  RepresentativeEmailDrafterPort,
} from '../agent/representative-email-workflow.js';
import type {
  DomainVerticalResultsLister,
  DomainVerticalRunner,
} from '../agent/agency/domain-vertical-port.js';
import type { OutcomeLinker } from '../agent/proactive/outcome-linker.js';

class IPAdapterRegistry {
  private _statementParser: IStatementParser | null = null;
  private _merchantNormalizer: IMerchantNormalizer | null = null;
  private _recurringDetector: IRecurringDetector | null = null;
  private _darkPatternDetector: IDarkPatternDetector | null = null;
  private _styleAdapter: StyleAdapter | null = null;
  private _weeklyDigestGenerator: IWeeklyDigestGenerator | null = null;
  private _alterEgoWeekEngine: IAlterEgoWeekEngine | null = null;
  private _emailDrafter: RepresentativeEmailDrafterPort | null = null;
  private _followUpTracker: FollowUpTrackerPort | null = null;
  private _runDomainVertical: DomainVerticalRunner | null = null;
  private _listDomainVerticalResults: DomainVerticalResultsLister | null = null;
  private _outcomeLinker: OutcomeLinker | null = null;

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

  registerRepresentativeWorkflow(deps: {
    emailDrafter: RepresentativeEmailDrafterPort;
    followUpTracker: FollowUpTrackerPort;
  }): void {
    this._emailDrafter = deps.emailDrafter;
    this._followUpTracker = deps.followUpTracker;
  }

  registerAgencyVerticals(deps: {
    runDomainVertical: DomainVerticalRunner;
    listRecentResults: DomainVerticalResultsLister;
  }): void {
    this._runDomainVertical = deps.runDomainVertical;
    this._listDomainVerticalResults = deps.listRecentResults;
  }

  registerOutcomeLinker(linker: OutcomeLinker): void {
    this._outcomeLinker = linker;
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

  get emailDrafter(): RepresentativeEmailDrafterPort | null {
    return this._emailDrafter;
  }

  get followUpTracker(): FollowUpTrackerPort | null {
    return this._followUpTracker;
  }

  get runDomainVertical(): DomainVerticalRunner | null {
    return this._runDomainVertical;
  }

  get listDomainVerticalResults(): DomainVerticalResultsLister | null {
    return this._listDomainVerticalResults;
  }

  get outcomeLinker(): OutcomeLinker | null {
    return this._outcomeLinker;
  }

  get isDRLoaded(): boolean {
    return this._styleAdapter !== null || this._statementParser !== null;
  }
}

export const ipAdapters = new IPAdapterRegistry();
