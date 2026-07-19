export type CheckoutPlan = 'monthly' | 'founding' | 'lifetime';

const PAYMENT_LINKS: Record<CheckoutPlan, string> = {
  monthly: 'https://buy.stripe.com/7sYcN6dS98Ob7TYc4a1VK03',
  founding: 'https://buy.stripe.com/5kQ8wQ8xP2pN1vA0ls1VK04',
  lifetime: 'https://buy.stripe.com/8x23cw6pH7K71vAfgm1VK05',
};

export type ExternalOpener = (url: string) => void | Promise<void>;

export function openCheckout(
  plan: CheckoutPlan,
  newSalesEnabled: boolean,
  opener: ExternalOpener,
): boolean {
  if (!newSalesEnabled) return false;
  void Promise.resolve(opener(PAYMENT_LINKS[plan])).catch(() => {});
  return true;
}

/** Pure URL validation — network fetch happens in Gateway commerce transport only. */
export function approvedPortalUrl(input: string): string | null {
  const APPROVED_PORTAL_HOSTS = new Set(['billing.stripe.com']);
  try {
    const parsed = new URL(input);
    if (
      parsed.protocol !== 'https:'
      || !APPROVED_PORTAL_HOSTS.has(parsed.hostname)
      || parsed.port
      || parsed.username
      || parsed.password
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
