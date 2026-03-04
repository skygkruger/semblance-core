// HealthDashboard types — pure presentation, all data passed in as props.

export interface HealthEntry {
  id: string;
  date: string;
  timestamp: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  symptoms: string[];
  medications: string[];
  notes: string | null;
}

export interface HealthTrendPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  sleepHours: number | null;
  steps: number | null;
  heartRateAvg: number | null;
}

export interface HealthInsight {
  id: string;
  type: 'correlation' | 'trend' | 'streak';
  title: string;
  description: string;
  confidence: number;
  dataSources: string[];
  detectedAt: string;
}

export interface HealthDashboardProps {
  todayEntry: HealthEntry | null;
  trends: HealthTrendPoint[];
  insights: HealthInsight[];
  symptomsHistory: string[];
  medicationsHistory: string[];
  hasHealthKit: boolean;
  onSaveEntry: (entry: Partial<HealthEntry> & { date: string }) => void;
  onDismissInsight?: (id: string) => void;
  loading?: boolean;
}
