export type Status = "active" | "resolved" | "unknown";
export type Relationship = "unknown" | "possible" | "suspected" | "confirmed_by_clinician";
export type Response = "none" | "partial" | "significant" | "complete" | "unknown";

export interface Symptom {
  id: string;
  symptomType: string;
  bodyLocation: string | null;
  severity: number;
  notes: string | null;
}
export interface Exposure {
  id: string;
  exposureCategory: string;
  exposureDescription: string | null;
  exposureTime: string | null;
  suspectedRelationship: Relationship;
  notes: string | null;
}
export interface Treatment {
  id: string;
  medicationName: string;
  dosage: string | null;
  administrationTime: string;
  response: Response;
  notes: string | null;
}
export interface EpisodeDetail {
  id: string;
  onsetAt: string;
  resolutionAt: string | null;
  status: Status;
  overallSeverity: number | null;
  generalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  symptoms: Symptom[];
  exposures: Exposure[];
  treatments: Treatment[];
}
export interface EpisodeSummary {
  id: string;
  onsetAt: string;
  resolutionAt: string | null;
  status: Status;
  overallSeverity: number | null;
  symptoms: { symptomType: string; bodyLocation: string | null; severity: number }[];
}
export interface CatalogItem {
  id: string;
  name: string;
}

export interface Summary {
  total: number;
  active: number;
  last30Days: number;
  averageDurationMinutes: number | null;
  episodesWithDuration: number;
  mostRecent: { id: string; onsetAt: string } | null;
}
export interface Trends {
  timeZone: string;
  episodesByMonth: { month: string; episodes: number }[];
  symptomFrequency: { name: string; episodes: number }[];
  exposureReports: { category: string; episodes: number; clinicianConfirmed: number }[];
}

export interface Analytics {
  range: { from: string; to: string; unit: "week" | "month" | "year"; timeZone: string };
  totals: {
    episodes: number;
    episodesWithDuration: number;
    averageDurationMinutes: number | null;
    medianDurationMinutes: number | null;
    longestDurationMinutes: number | null;
    averageSeverity: number | null;
    episodesWithSeverity: number;
  };
  frequency: { start: string; episodes: number; averageSeverity: number | null; averageDurationMinutes: number | null }[];
  severityDistribution: { severity: number; episodes: number }[];
  symptoms: { name: string; episodes: number; averageSeverity: number }[];
  locations: { name: string; episodes: number }[];
  exposures: { category: string; episodes: number; possible: number; suspected: number; clinicianConfirmed: number }[];
  exposureDetails: { category: string; description: string; episodes: number }[];
  gaps: {
    count: number;
    averageDays: number | null;
    medianDays: number | null;
    shortestDays: number | null;
    longestDays: number | null;
    recent: { date: string; days: number }[];
  };
}
