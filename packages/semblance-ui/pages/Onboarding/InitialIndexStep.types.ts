export interface IndexingSource {
  id: string;
  name: string;
  count: number;
  status: 'pending' | 'indexing' | 'complete';
}

export interface InitialIndexStepProps {
  /** Sources currently being indexed */
  sources: IndexingSource[];
  /** Whether indexing is complete */
  complete: boolean;
  /** Called when user clicks Continue */
  onContinue?: () => void;
  /** Called to go back to previous step */
  onBack?: () => void;
}
