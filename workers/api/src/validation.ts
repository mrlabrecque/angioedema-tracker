import { z } from "zod";

const iso = z.string().datetime({ offset: true });
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullish().transform((v) => (v ? v : null));
const severity = z.number().int().min(1).max(10);

export const symptomInput = z.object({
  symptomType: text(80).min(1),
  bodyLocation: optText(80),
  severity,
  notes: optText(2000),
});

export const exposureInput = z.object({
  exposureCategory: text(80).min(1),
  exposureDescription: optText(500),
  exposureTime: iso.nullish().transform((v) => v ?? null),
  suspectedRelationship: z
    .enum(["unknown", "possible", "suspected", "confirmed_by_clinician"])
    .default("unknown"),
  notes: optText(2000),
});

export const treatmentInput = z.object({
  medicationName: text(120).min(1),
  dosage: optText(120),
  administrationTime: iso,
  response: z.enum(["none", "partial", "significant", "complete", "unknown"]).default("unknown"),
  notes: optText(2000),
});

export const createEpisodeInput = z
  .object({
    clientRequestId: z.string().uuid(),
    onsetAt: iso,
    resolutionAt: iso.nullish().transform((v) => v ?? null),
    status: z.enum(["active", "resolved", "unknown"]).optional(),
    overallSeverity: severity.nullish().transform((v) => v ?? null),
    generalNotes: optText(5000),
    symptoms: z.array(symptomInput).max(30).default([]),
    exposures: z.array(exposureInput).max(30).default([]),
    treatments: z.array(treatmentInput).max(30).default([]),
  })
  .strict();

export const updateEpisodeInput = z
  .object({
    onsetAt: iso.optional(),
    resolutionAt: iso.nullable().optional(),
    status: z.enum(["active", "resolved", "unknown"]).optional(),
    overallSeverity: severity.nullable().optional(),
    generalNotes: text(5000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const uuid = z.string().uuid();
