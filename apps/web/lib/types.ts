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
