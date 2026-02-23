/**
 * Category Taxonomy — Canonical financial transaction categories.
 *
 * 11 top-level categories with subcategories and keyword hints.
 * Used by LLM categorizer (prompt context) and rule-based fallback.
 */

export interface CategoryDefinition {
  name: string;
  subcategories: string[];
  keywords: string[];
}

export const CATEGORY_TAXONOMY: CategoryDefinition[] = [
  {
    name: 'Housing',
    subcategories: ['Rent', 'Mortgage', 'Utilities', 'Insurance', 'Maintenance', 'Property Tax'],
    keywords: ['rent', 'mortgage', 'electric', 'gas', 'water', 'sewer', 'internet', 'cable', 'hoa', 'property'],
  },
  {
    name: 'Transportation',
    subcategories: ['Gas', 'Public Transit', 'Rideshare', 'Car Payment', 'Insurance', 'Parking', 'Maintenance'],
    keywords: ['uber', 'lyft', 'shell', 'chevron', 'exxon', 'bp', 'parking', 'transit', 'metro', 'bus'],
  },
  {
    name: 'Food & Dining',
    subcategories: ['Groceries', 'Restaurants', 'Coffee', 'Delivery', 'Fast Food'],
    keywords: ['grocery', 'restaurant', 'starbucks', 'doordash', 'uber eats', 'grubhub', 'whole foods', 'trader joe', 'chipotle', 'mcdonald'],
  },
  {
    name: 'Shopping',
    subcategories: ['Clothing', 'Electronics', 'Home', 'General', 'Online'],
    keywords: ['amazon', 'target', 'walmart', 'costco', 'best buy', 'home depot', 'ikea', 'clothing', 'apparel'],
  },
  {
    name: 'Entertainment',
    subcategories: ['Streaming', 'Movies', 'Games', 'Music', 'Events', 'Sports'],
    keywords: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'youtube', 'steam', 'playstation', 'xbox', 'movie', 'theater', 'concert'],
  },
  {
    name: 'Health',
    subcategories: ['Medical', 'Pharmacy', 'Dental', 'Vision', 'Fitness', 'Mental Health'],
    keywords: ['pharmacy', 'cvs', 'walgreens', 'doctor', 'medical', 'dental', 'gym', 'fitness', 'planet fitness', 'peloton', 'headspace', 'calm'],
  },
  {
    name: 'Personal',
    subcategories: ['Clothing', 'Beauty', 'Education', 'Gifts', 'Donations'],
    keywords: ['salon', 'barber', 'education', 'tuition', 'gift', 'donation', 'charity'],
  },
  {
    name: 'Financial',
    subcategories: ['Transfer', 'Fee', 'Interest', 'Investment', 'Tax', 'ATM'],
    keywords: ['transfer', 'fee', 'interest', 'investment', 'atm', 'tax', 'irs', 'venmo', 'zelle', 'paypal'],
  },
  {
    name: 'Subscriptions',
    subcategories: ['Software', 'News', 'Cloud Storage', 'VPN', 'Productivity'],
    keywords: ['adobe', 'microsoft', 'github', 'dropbox', 'notion', 'slack', 'zoom', 'nordvpn', '1password', 'grammarly', 'nytimes'],
  },
  {
    name: 'Income',
    subcategories: ['Salary', 'Freelance', 'Refund', 'Interest', 'Dividend', 'Gift'],
    keywords: ['payroll', 'salary', 'deposit', 'refund', 'dividend', 'interest earned'],
  },
  {
    name: 'Other',
    subcategories: ['Uncategorized', 'Miscellaneous'],
    keywords: [],
  },
];

export function getValidCategories(): string[] {
  return CATEGORY_TAXONOMY.map(c => c.name);
}

export function getSubcategories(category: string): string[] {
  const cat = CATEGORY_TAXONOMY.find(c => c.name === category);
  return cat ? cat.subcategories : [];
}

export function isValidCategory(category: string, subcategory?: string): boolean {
  const cat = CATEGORY_TAXONOMY.find(c => c.name === category);
  if (!cat) return false;
  if (subcategory) {
    return cat.subcategories.includes(subcategory);
  }
  return true;
}
