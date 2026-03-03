// Recategorize Sheet — Shows category suggestions and search.
// Used from KnowledgeItemModal when user clicks "Recategorize".

export interface CategorySuggestion {
  category: string;
  confidence: number;
  reason: string;
}

export interface CategoryInfo {
  category: string;
  count: number;
  color: string;
}

export interface RecategorizeSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Current category of the item being recategorized */
  currentCategory: string;
  /** AI-suggested categories (from suggestCategories) */
  suggestions: CategorySuggestion[];
  /** All available categories */
  allCategories: CategoryInfo[];
  /** Whether AI suggestions are still loading */
  loadingSuggestions: boolean;
  /** Close the sheet */
  onClose: () => void;
  /** Select an existing category */
  onSelectCategory: (category: string) => void;
  /** Create a new category and select it */
  onCreateCategory: (name: string) => void;
}
