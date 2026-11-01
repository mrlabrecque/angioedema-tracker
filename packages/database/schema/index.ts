import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const episodeStatus = pgEnum("episode_status", ["active", "resolved", "unknown"]);
export const suspectedRelationship = pgEnum("suspected_relationship", [
  "unknown",
  "possible",
  "suspected",
  "confirmed_by_clinician",
]);
export const treatmentResponse = pgEnum("treatment_response", [
  "none",
  "partial",
  "significant",
  "complete",
  "unknown",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const flareEpisodes = pgTable(
  "flare_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Client-generated idempotency key; prevents duplicate episodes on double-submit.
    clientRequestId: uuid("client_request_id").unique(),
    onsetAt: timestamp("onset_at", { withTimezone: true }).notNull(),
    resolutionAt: timestamp("resolution_at", { withTimezone: true }),
    status: episodeStatus("status").notNull().default("active"),
    overallSeverity: integer("overall_severity"),
    generalNotes: text("general_notes"),
    // Soft delete: historical records are preserved.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("flare_episodes_onset_at_idx").on(t.onsetAt.desc()),
    index("flare_episodes_status_idx").on(t.status),
    check(
      "flare_episodes_severity_chk",
      sql`${t.overallSeverity} IS NULL OR ${t.overallSeverity} BETWEEN 1 AND 10`,
    ),
    check(
      "flare_episodes_resolution_chk",
      sql`${t.resolutionAt} IS NULL OR ${t.resolutionAt} >= ${t.onsetAt}`,
    ),
  ],
);

export const episodeSymptoms = pgTable(
  "episode_symptoms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => flareEpisodes.id, { onDelete: "restrict" }),
    symptomType: text("symptom_type").notNull(),
    bodyLocation: text("body_location"),
    severity: integer("severity").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("episode_symptoms_episode_idx").on(t.episodeId),
    check("episode_symptoms_severity_chk", sql`${t.severity} BETWEEN 1 AND 10`),
  ],
);

export const episodeExposures = pgTable(
  "episode_exposures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => flareEpisodes.id, { onDelete: "restrict" }),
    exposureCategory: text("exposure_category").notNull(),
    exposureDescription: text("exposure_description"),
    exposureTime: timestamp("exposure_time", { withTimezone: true }),
    // Never auto-classified as a confirmed trigger.
    suspectedRelationship: suspectedRelationship("suspected_relationship")
      .notNull()
      .default("unknown"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("episode_exposures_episode_idx").on(t.episodeId)],
);

export const episodeTreatments = pgTable(
  "episode_treatments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => flareEpisodes.id, { onDelete: "restrict" }),
    medicationName: text("medication_name").notNull(),
    dosage: text("dosage"),
    administrationTime: timestamp("administration_time", { withTimezone: true }).notNull(),
    response: treatmentResponse("response").notNull().default("unknown"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("episode_treatments_episode_idx").on(t.episodeId)],
);

export const medications = pgTable("medications", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicationName: text("medication_name").notNull(),
  dosageDescription: text("dosage_description"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const symptomCatalog = pgTable("symptom_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const exposureCatalog = pgTable("exposure_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const EXPECTED_TABLES = [
  "flare_episodes",
  "episode_symptoms",
  "episode_exposures",
  "episode_treatments",
  "medications",
  "symptom_catalog",
  "exposure_catalog",
] as const;
