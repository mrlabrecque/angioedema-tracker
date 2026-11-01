CREATE TYPE "public"."episode_status" AS ENUM('active', 'resolved', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."suspected_relationship" AS ENUM('unknown', 'possible', 'suspected', 'confirmed_by_clinician');--> statement-breakpoint
CREATE TYPE "public"."treatment_response" AS ENUM('none', 'partial', 'significant', 'complete', 'unknown');--> statement-breakpoint
CREATE TABLE "episode_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"exposure_category" text NOT NULL,
	"exposure_description" text,
	"exposure_time" timestamp with time zone,
	"suspected_relationship" "suspected_relationship" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"symptom_type" text NOT NULL,
	"body_location" text,
	"severity" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_symptoms_severity_chk" CHECK ("episode_symptoms"."severity" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "episode_treatments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"medication_name" text NOT NULL,
	"dosage" text,
	"administration_time" timestamp with time zone NOT NULL,
	"response" "treatment_response" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exposure_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exposure_catalog_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "flare_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_request_id" uuid,
	"onset_at" timestamp with time zone NOT NULL,
	"resolution_at" timestamp with time zone,
	"status" "episode_status" DEFAULT 'active' NOT NULL,
	"overall_severity" integer,
	"general_notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flare_episodes_client_request_id_unique" UNIQUE("client_request_id"),
	CONSTRAINT "flare_episodes_severity_chk" CHECK ("flare_episodes"."overall_severity" IS NULL OR "flare_episodes"."overall_severity" BETWEEN 1 AND 10),
	CONSTRAINT "flare_episodes_resolution_chk" CHECK ("flare_episodes"."resolution_at" IS NULL OR "flare_episodes"."resolution_at" >= "flare_episodes"."onset_at")
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_name" text NOT NULL,
	"dosage_description" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "symptom_catalog_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "episode_exposures" ADD CONSTRAINT "episode_exposures_episode_id_flare_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."flare_episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_symptoms" ADD CONSTRAINT "episode_symptoms_episode_id_flare_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."flare_episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_treatments" ADD CONSTRAINT "episode_treatments_episode_id_flare_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."flare_episodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_exposures_episode_idx" ON "episode_exposures" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_symptoms_episode_idx" ON "episode_symptoms" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "episode_treatments_episode_idx" ON "episode_treatments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "flare_episodes_onset_at_idx" ON "flare_episodes" USING btree ("onset_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "flare_episodes_status_idx" ON "flare_episodes" USING btree ("status");