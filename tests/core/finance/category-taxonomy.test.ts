/**
 * Step 19 — Category Taxonomy tests.
 */

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_TAXONOMY,
  getValidCategories,
  getSubcategories,
  isValidCategory,
} from '@semblance/core/finance/category-taxonomy';

describe('CategoryTaxonomy (Step 19)', () => {
  it('all 11 categories have at least one subcategory', () => {
    expect(CATEGORY_TAXONOMY).toHaveLength(11);
    for (const cat of CATEGORY_TAXONOMY) {
      expect(cat.subcategories.length, `${cat.name} should have subcategories`).toBeGreaterThan(0);
    }
  });

  it('isValidCategory validates categories and subcategories correctly', () => {
    expect(isValidCategory('Food & Dining')).toBe(true);
    expect(isValidCategory('Food & Dining', 'Groceries')).toBe(true);
    expect(isValidCategory('Food & Dining', 'NonExistent')).toBe(false);
    expect(isValidCategory('FakeCategory')).toBe(false);
  });

  it('getValidCategories returns all 11 category names', () => {
    const names = getValidCategories();
    expect(names).toHaveLength(11);
    expect(names).toContain('Housing');
    expect(names).toContain('Entertainment');
    expect(names).toContain('Other');
  });
});
