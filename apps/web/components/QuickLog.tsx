"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CategoryPicker from "@/components/CategoryPicker";
import { Card, Chip, Field, SeverityPicker, btnPrimary, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { CatalogItem, EpisodeDetail, Response } from "@/lib/types";

const isSwelling = (name: string) => /swelling$/i.test(name);
const locationOf = (name: string) => name.replace(/ swelling$/i, "");

export default function QuickLog() {
  const { session, clear } = useAuth();
  const router = useRouter();

  const [symptomCatalog, setSymptomCatalog] = useState<CatalogItem[] | null>(null);
  const [exposureCatalog, setExposureCatalog] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState(false);

  const [onset, setOnset] = useState(() => toLocalInput(new Date()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medTime, setMedTime] = useState(() => toLocalInput(new Date()));
  const [medResponse, setMedResponse] = useState<Response>("unknown");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per form: retries and double taps can never create two episodes.
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const [s, e] = await Promise.all([
          api<{ items: CatalogItem[] }>("/api/symptoms", { token: session.token }),
          api<{ items: CatalogItem[] }>("/api/exposures", { token: session.token }),
        ]);
        setSymptomCatalog(s.items);
        setExposureCatalog(e.items);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return clear();
        setCatalogError(true);
      }
    })();
  }, [session, clear]);

  const toggle = (name: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !session) return;
    if (picked.size > 0 && severity === null) return setError("Pick a severity (1–10) for the symptoms you selected.");
    if (!onset) return setError("Set when it started.");

    setSaving(true);
    setError(null);
    const body = {
      clientRequestId: requestId.current,
      onsetAt: fromLocalInput(onset),
      overallSeverity: severity,
      generalNotes: notes || null,
      symptoms: [...picked].map((name) => ({
        symptomType: name,
        bodyLocation: isSwelling(name) ? locationOf(name) : null,
        severity: severity ?? 1,
      })),
      exposures: expCategory.trim() ? [{ exposureCategory: expCategory.trim(), exposureDescription: expDesc || null }] : [],
      treatments: medName.trim()
        ? [{ medicationName: medName.trim(), dosage: medDose || null, administrationTime: fromLocalInput(medTime), response: medResponse }]
        : [],
    };
    try {
      const saved = await api<EpisodeDetail>("/api/episodes", {
        method: "POST",
        body: JSON.stringify(body),
        token: session.token,
      });
      router.push(`/episode/?id=${saved.id}&saved=1`);
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 401) return clear();
      setError(
        err instanceof ApiError && err.status === 400
          ? "Not saved: some details look invalid. Please check the form."
          : "Not saved. Nothing was recorded — check your connection and tap Save again.",
      );
    }
  }

  const swellings = symptomCatalog?.filter((s) => isSwelling(s.name)) ?? [];
  const others = symptomCatalog?.filter((s) => !isSwelling(s.name)) ?? [];

  return (
    <main>
      <h1 className="text-2xl font-semibold tracking-tight">Log a flare-up</h1>
      <p className="mt-1 text-sm text-muted">Only the start time is required. You can add the rest later.</p>

      <form onSubmit={save} className="mt-5 space-y-5">
        <Field label="Started">
          <input type="datetime-local" value={onset} onChange={(e) => setOnset(e.target.value)} className={inputCls} required />
        </Field>

        {catalogError && <p className="text-sm text-danger">Couldn’t load symptom choices. Reload to try again.</p>}
        {!symptomCatalog && !catalogError && <p className="text-sm text-muted">Loading choices…</p>}

        {symptomCatalog && (
          <>
            <div>
              <p className="text-sm font-medium">Swelling location</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {swellings.map((s) => (
                  <Chip key={s.id} selected={picked.has(s.name)} onClick={() => toggle(s.name)}>
                    {locationOf(s.name)}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Other symptoms</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {others.map((s) => (
                  <Chip key={s.id} selected={picked.has(s.name)} onClick={() => toggle(s.name)}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Severity</p>
          <SeverityPicker value={severity} onChange={setSeverity} />
        </div>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
        </Field>

        <Card title="Possible exposure (optional)">
          <div className="space-y-3">
            <CategoryPicker catalog={exposureCatalog} value={expCategory} onChange={setExpCategory} placeholder="None noted" />
            {expCategory.trim() && (
              <input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="What was it?" maxLength={500} className={inputCls} />
            )}
            <p className="text-xs text-muted">Recorded as “unknown” until you change it. Nothing here is treated as a confirmed cause.</p>
          </div>
        </Card>

        <Card title="Medication taken (optional)">
          <div className="space-y-3">
            <input value={medName} onChange={(e) => setMedName(e.target.value)} placeholder="Medication name" maxLength={120} className={inputCls} />
            {medName.trim() && (
              <>
                <input value={medDose} onChange={(e) => setMedDose(e.target.value)} placeholder="Dose (e.g. 10 mg)" maxLength={120} className={inputCls} />
                <input type="datetime-local" value={medTime} onChange={(e) => setMedTime(e.target.value)} className={inputCls} aria-label="Time taken" />
                <select value={medResponse} onChange={(e) => setMedResponse(e.target.value as Response)} className={inputCls} aria-label="Response">
                  <option value="unknown">Response: not sure yet</option>
                  <option value="none">No response</option>
                  <option value="partial">Partial</option>
                  <option value="significant">Significant</option>
                  <option value="complete">Complete</option>
                </select>
              </>
            )}
          </div>
        </Card>

        <p role="alert" aria-live="polite" className="min-h-5 text-sm text-danger">
          {error}
        </p>
        <button type="submit" disabled={saving} className={`${btnPrimary} h-14 w-full text-lg`}>
          {saving ? "Saving…" : "Save flare-up"}
        </button>
      </form>
    </main>
  );
}
