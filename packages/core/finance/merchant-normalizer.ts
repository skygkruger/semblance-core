/**
 * Merchant Normalizer — Clean merchant names from raw transaction descriptions.
 *
 * Rule-based first pass strips noise. Known merchant dictionary handles common names.
 * LLM fallback for unrecognized merchants.
 */

import type { Transaction } from './statement-parser.js';
import type { LLMProvider } from '../llm/types.js';

// ─── Known Merchant Dictionary ──────────────────────────────────────────────

/**
 * AUTONOMOUS DECISION: Merchant dictionary covers top ~60 common US subscription services.
 * Reasoning: Rule-based matching is deterministic and avoids LLM calls for known merchants.
 * Escalation check: Build prompt grants autonomy for merchant normalization rules.
 */
const KNOWN_MERCHANTS: Array<{ patterns: RegExp[]; name: string; category: string }> = [
  { patterns: [/NETFLIX/i], name: 'Netflix', category: 'Entertainment' },
  { patterns: [/SPOTIFY/i], name: 'Spotify', category: 'Entertainment' },
  { patterns: [/AMAZON PRIME/i, /AMZN PRIME/i], name: 'Amazon Prime', category: 'Shopping' },
  { patterns: [/AMAZON/i, /AMZN/i, /AMZ\*/i], name: 'Amazon', category: 'Shopping' },
  { patterns: [/APPLE\.COM/i, /APPLE MUSIC/i, /APPLE STORAGE/i, /ITUNES/i], name: 'Apple', category: 'Technology' },
  { patterns: [/GOOGLE \*?STORAGE/i, /GOOGLE ONE/i, /GOOGLE \*?CLOUD/i], name: 'Google Storage', category: 'Technology' },
  { patterns: [/GOOGLE/i], name: 'Google', category: 'Technology' },
  { patterns: [/HULU/i], name: 'Hulu', category: 'Entertainment' },
  { patterns: [/DISNEY\+/i, /DISNEY PLUS/i, /DISNEYPLUS/i], name: 'Disney+', category: 'Entertainment' },
  { patterns: [/HBO\s*MAX/i, /MAX\.COM/i], name: 'Max (HBO)', category: 'Entertainment' },
  { patterns: [/ADOBE/i, /ADOBE CREATIVE/i], name: 'Adobe Creative Cloud', category: 'Software' },
  { patterns: [/DROPBOX/i], name: 'Dropbox', category: 'Software' },
  { patterns: [/SLACK/i], name: 'Slack', category: 'Software' },
  { patterns: [/ZOOM\.US/i, /ZOOM VIDEO/i], name: 'Zoom', category: 'Software' },
  { patterns: [/MICROSOFT/i, /MSFT/i], name: 'Microsoft', category: 'Software' },
  { patterns: [/LINKEDIN/i], name: 'LinkedIn Premium', category: 'Software' },
  { patterns: [/HEADSPACE/i], name: 'Headspace', category: 'Health & Wellness' },
  { patterns: [/CALM\.COM/i, /CALM APP/i], name: 'Calm', category: 'Health & Wellness' },
  { patterns: [/PELOTON/i], name: 'Peloton', category: 'Fitness' },
  { patterns: [/PLANET FITNESS/i], name: 'Planet Fitness', category: 'Fitness' },
  { patterns: [/GYM/i, /FITNESS/i], name: '', category: 'Fitness' }, // empty name = keep cleaned
  { patterns: [/YOUTUBE/i, /YTPREMIUM/i], name: 'YouTube Premium', category: 'Entertainment' },
  { patterns: [/PARAMOUNT/i], name: 'Paramount+', category: 'Entertainment' },
  { patterns: [/CRUNCHYROLL/i], name: 'Crunchyroll', category: 'Entertainment' },
  { patterns: [/NORDVPN/i], name: 'NordVPN', category: 'Software' },
  { patterns: [/EXPRESSVPN/i], name: 'ExpressVPN', category: 'Software' },
  { patterns: [/1PASSWORD/i], name: '1Password', category: 'Software' },
  { patterns: [/LASTPASS/i], name: 'LastPass', category: 'Software' },
  { patterns: [/GRAMMARLY/i], name: 'Grammarly', category: 'Software' },
  { patterns: [/NOTION/i], name: 'Notion', category: 'Software' },
  { patterns: [/GITHUB/i], name: 'GitHub', category: 'Software' },
  { patterns: [/AWS/i, /AMAZON WEB/i], name: 'AWS', category: 'Technology' },
  { patterns: [/DOORDASH/i], name: 'DoorDash', category: 'Food & Drink' },
  { patterns: [/UBER EATS/i, /UBEREATS/i], name: 'Uber Eats', category: 'Food & Drink' },
  { patterns: [/UBER/i], name: 'Uber', category: 'Transportation' },
  { patterns: [/LYFT/i], name: 'Lyft', category: 'Transportation' },
  { patterns: [/CHATGPT/i, /OPENAI/i], name: 'ChatGPT Plus', category: 'Software' },
  { patterns: [/CLAUDE/i, /ANTHROPIC/i], name: 'Claude Pro', category: 'Software' },
  { patterns: [/NEW YORK TIMES/i, /NYTIMES/i, /NYT /i], name: 'New York Times', category: 'News' },
  { patterns: [/WASH.*POST/i], name: 'Washington Post', category: 'News' },
  { patterns: [/WHOLEFDS/i, /WHOLE FOODS/i], name: 'Whole Foods', category: 'Groceries' },
  { patterns: [/TRADER JOE/i], name: "Trader Joe's", category: 'Groceries' },
  { patterns: [/COSTCO/i], name: 'Costco', category: 'Shopping' },
  { patterns: [/WALMART/i], name: 'Walmart', category: 'Shopping' },
  { patterns: [/TARGET/i], name: 'Target', category: 'Shopping' },
  { patterns: [/STARBUCKS/i, /SBUX/i], name: 'Starbucks', category: 'Food & Drink' },
  { patterns: [/SHELL\s*OIL/i, /SHELL\s+\d/i], name: 'Shell', category: 'Gas' },
  { patterns: [/CHEVRON/i], name: 'Chevron', category: 'Gas' },
  { patterns: [/HOME DEPOT/i], name: 'Home Depot', category: 'Shopping' },
  { patterns: [/BEST BUY/i], name: 'Best Buy', category: 'Shopping' },
];

// ─── Noise Stripping Rules ──────────────────────────────────────────────────

const NOISE_PATTERNS: RegExp[] = [
  /\d{3}[-.]?\d{3}[-.]?\d{4}/g,          // Phone numbers
  /\b\d{4,5}\b(?!\d)/g,                    // Store/location numbers (4-5 digits)
  /\b[A-Z]{2}\b$/,                          // State abbreviations at end
  /POS PURCHASE\s*/i,
  /POS DEBIT\s*/i,
  /ACH\s+/i,
  /RECURRING\s+/i,
  /PREAUTHORIZED\s+/i,
  /SQ\s*\*/i,                               // Square prefix
  /STRIPE\s*\*/i,                           // Stripe prefix
  /PP\s*\*/i,                               // PayPal prefix
  /CKC[D]?\s*/i,                            // Check card prefix
  /PURCHASE\s*/i,
  /\*{2,}\d{4}/,                            // Card last 4 digits (****1234)
  /\b(#|NO\.?)\s*\d+/gi,                   // Store numbers (#123)
  /\s{2,}/g,                                // Multiple spaces → single space
];

function stripNoise(description: string): string {
  let cleaned = description;
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  return cleaned.trim().replace(/\s+/g, ' ');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class MerchantNormalizer {
  private llm?: LLMProvider;
  private model: string;
  private userCorrections: Map<string, string> = new Map();

  constructor(config?: { llm?: LLMProvider; model?: string }) {
    this.llm = config?.llm;
    this.model = config?.model ?? 'llama3.2:8b';
  }

  /**
   * Normalize a raw transaction description to a clean merchant name.
   */
  normalize(description: string): { name: string; category: string } {
    // Check user corrections first
    const corrected = this.userCorrections.get(description.toLowerCase());
    if (corrected) return { name: corrected, category: '' };

    // Check known merchant dictionary
    for (const merchant of KNOWN_MERCHANTS) {
      if (merchant.patterns.some(p => p.test(description))) {
        return {
          name: merchant.name || stripNoise(description),
          category: merchant.category,
        };
      }
    }

    // Rule-based cleanup
    const cleaned = stripNoise(description);
    // Title case the cleaned name
    const titleCased = cleaned
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    return { name: titleCased, category: '' };
  }

  /**
   * Normalize all transactions in a batch, setting normalizedMerchant and category.
   */
  normalizeAll(transactions: Transaction[]): Transaction[] {
    return transactions.map(t => {
      const { name, category } = this.normalize(t.description);
      return {
        ...t,
        normalizedMerchant: name,
        category: category || t.category,
      };
    });
  }

  /**
   * Group transactions by normalized merchant name.
   */
  groupByMerchant(transactions: Transaction[]): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = t.normalizedMerchant || t.description;
      const group = groups.get(key) || [];
      group.push(t);
      groups.set(key, group);
    }
    return groups;
  }

  /**
   * Record a user correction for a merchant name.
   */
  addCorrection(rawDescription: string, correctedName: string): void {
    this.userCorrections.set(rawDescription.toLowerCase(), correctedName);
  }

  /**
   * Use the local LLM to identify unrecognized merchants.
   * Local call only — no network.
   */
  async llmNormalize(descriptions: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (!this.llm || descriptions.length === 0) return results;

    try {
      const available = await this.llm.isAvailable();
      if (!available) return results;

      const response = await this.llm.chat({
        model: this.model,
        messages: [{
          role: 'user',
          content: `For each transaction description, return ONLY the company name. Respond with JSON array.

Descriptions:
${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Respond with ONLY valid JSON array of company names: ["Company1", "Company2", ...]`,
        }],
        temperature: 0,
      });

      const parsed = JSON.parse(response.message.content) as string[];
      descriptions.forEach((desc, i) => {
        if (parsed[i]) results.set(desc, parsed[i]!);
      });
    } catch {
      // LLM unavailable or bad response — return empty
    }

    return results;
  }
}
