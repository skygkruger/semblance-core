// Certificate Pinning — Pin registry for known service endpoints.
// Pins are SHA-256 fingerprints of the server's leaf certificate.
// Enforced: false by default for rollout — log mismatches, don't block.

export interface CertificatePin {
  domain: string;
  fingerprints: string[];
  enforced: boolean;
  description: string;
}

const DEFAULT_PINS: CertificatePin[] = [
  {
    domain: 'imap.gmail.com',
    fingerprints: [],
    enforced: false,
    description: 'Gmail IMAP — pins populated at first successful connection',
  },
  {
    domain: 'smtp.gmail.com',
    fingerprints: [],
    enforced: false,
    description: 'Gmail SMTP — pins populated at first successful connection',
  },
  {
    domain: 'outlook.office365.com',
    fingerprints: [],
    enforced: false,
    description: 'Outlook — pins populated at first successful connection',
  },
  {
    domain: 'www.googleapis.com',
    fingerprints: [],
    enforced: false,
    description: 'Google Calendar API — pins populated at first successful connection',
  },
  {
    domain: 'production.plaid.com',
    fingerprints: [],
    enforced: false,
    description: 'Plaid API — pins populated at first successful connection',
  },
];

/**
 * Certificate pin registry for known service endpoints.
 * Supports trust-on-first-use (TOFU) pattern: empty fingerprints
 * are populated on first successful connection, then enforced.
 */
export class CertificatePinRegistry {
  private pins: Map<string, CertificatePin>;

  constructor() {
    this.pins = new Map();
  }

  /**
   * Load default pins for known services.
   */
  loadDefaults(): void {
    for (const pin of DEFAULT_PINS) {
      this.pins.set(pin.domain, { ...pin });
    }
  }

  /**
   * Add or update a pin for a domain.
   */
  addPin(pin: CertificatePin): void {
    this.pins.set(pin.domain, { ...pin });
  }

  /**
   * Check if a domain has pins registered.
   */
  isPinned(domain: string): boolean {
    const pin = this.pins.get(domain);
    return pin !== undefined && pin.fingerprints.length > 0;
  }

  /**
   * Verify a certificate fingerprint against pinned values.
   * Returns true if the fingerprint matches any pinned value,
   * or if no pins are registered for the domain.
   */
  verifyPin(domain: string, fingerprint256: string): boolean {
    const pin = this.pins.get(domain);
    if (!pin) return true; // No pin registered — allow
    if (pin.fingerprints.length === 0) return true; // TOFU — not yet pinned
    return pin.fingerprints.includes(fingerprint256);
  }

  /**
   * Record a certificate fingerprint on first connection (TOFU).
   * Only records if the domain is registered but has no fingerprints yet.
   */
  recordFirstUse(domain: string, fingerprint256: string): void {
    const pin = this.pins.get(domain);
    if (pin && pin.fingerprints.length === 0) {
      pin.fingerprints.push(fingerprint256);
    }
  }

  /**
   * Get the pin entry for a domain.
   */
  getPin(domain: string): CertificatePin | undefined {
    return this.pins.get(domain);
  }

  /**
   * Get all registered domains.
   */
  getDomains(): string[] {
    return Array.from(this.pins.keys());
  }
}
