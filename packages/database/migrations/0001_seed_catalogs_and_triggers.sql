-- Catalog seed data (idempotent) and updated_at trigger.
INSERT INTO symptom_catalog (name, sort_order) VALUES
  ('Lip swelling', 1), ('Tongue swelling', 2), ('Facial swelling', 3), ('Eyelid swelling', 4),
  ('Throat swelling', 5), ('Hand swelling', 6), ('Foot swelling', 7), ('Abdominal symptoms', 8),
  ('Itching', 9), ('Hives', 10), ('Skin redness', 11), ('Pain', 12), ('Other', 13)
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO exposure_catalog (name, sort_order) VALUES
  ('Food', 1), ('Beverage', 2), ('Medication', 3), ('Supplement', 4), ('Exercise', 5),
  ('Physical activity', 6), ('Stress', 7), ('Sleep disruption', 8), ('Illness or infection', 9),
  ('Temperature', 10), ('Environmental exposure', 11), ('Insect bite or sting', 12),
  ('Menstrual or hormonal context', 13), ('Unknown', 14), ('Other', 15)
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER flare_episodes_set_updated_at
  BEFORE UPDATE ON flare_episodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
