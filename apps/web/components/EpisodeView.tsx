"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CategoryPicker from "@/components/CategoryPicker";
import { Card, Chip, Field, SeverityPicker, StatusBadge, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  RELATIONSHIP_LABEL,
  RESPONSE_LABEL,
  formatDateTime,
  formatDuration,
  fromLocalInput,
  toLocalInput,
} from "@/lib/format";
import type { CatalogItem, EpisodeDetail, Relationship, Response, Status } from "@/lib/types";

type Panel = null | "edit" | "symptom" | "exposure" | "treatment";

export default function EpisodeView() {
  const id = useSearchParams().get("id");
  const justSaved = useSearchParams().get("saved") === "1";
  const { session, clear } = useAuth();
  const router = useRouter();

  const [ep, setEp] = useState<EpisodeDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [symptomCatalog, setSymptomCatalog] = useState<CatalogItem[]>([]);
  const [exposureCatalog, setExposureCatalog] = useState<CatalogItem[]>([]);

  const token = session?.token;

  const load = useCallback(async () => {
    if (!token || !id) return setState("missing");
    try {
      setEp(await api<EpisodeDetail>(`/api/episodes/${id}`, { token }));
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return clear();
      setState(e instanceof ApiError && e.status === 404 ? "missing" : "error");
    }
  }, [token, id, clear]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    api<{ items: CatalogItem[] }>("/api/symptoms", { token }).then((r) => setSymptomCatalog(r.items)).catch(() => {});
    api<{ items: CatalogItem[] }>("/api/exposures", { token }).then((r) => setExposureCatalog(r.items)).catch(() => {});
  }, [token]);

  /** Runs a write; the screen only changes once the server confirms it saved. */
  async function write(path: string, method: string, body: unknown, okMsg: string) {
    if (!token || busy) return false;
    setBusy(true);
    setMessage(null);
    try {
      setEp(await api<EpisodeDetail>(path, { method, body: JSON.stringify(body), token }));
      setPanel(null);
      setMessage(okMsg);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clear();
      setMessage(
        e instanceof ApiError && e.status === 400
          ? "Not saved: some details look invalid."
          : "Not saved. Nothing was changed — please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!token || !ep || !window.confirm("Remove this episode from your history?")) return;
    try {
      await api(`/api/episodes/${ep.id}`, { method: "DELETE", token });
      router.push("/");
    } catch {
      setMessage("Not removed. Please try again.");
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Loading…</p>;
  if (state === "missing" || !ep)
    return (
      <p className="text-sm">
        Episode not found. <Link href="/" className="underline">Back to overview</Link>
      </p>
    );
  if (state === "error")
    return (
      <p className="text-sm text-danger">
        Couldn’t load this episode. <button onClick={load} className="underline">Retry</button>
      </p>
    );

  const sub = `/api/episodes/${ep.id}`;

  return (
    <main className="space-y-4">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-muted">
        ← Overview
      </Link>

      {(justSaved || message) && (
        <p role="status" className={`rounded-xl border border-line bg-surface p-3 text-sm ${message?.startsWith("Not") ? "text-danger" : "text-accent"}`}>
          {message ?? "Saved. This episode is stored."}
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{formatDateTime(ep.onsetAt)}</h1>
          <p className="mt-1 text-sm text-muted">
            {ep.resolutionAt ? `Resolved ${formatDateTime(ep.resolutionAt)} · ` : "Ongoing · "}
            {formatDuration(ep.onsetAt, ep.resolutionAt)}
            {ep.overallSeverity !== null && ` · severity ${ep.overallSeverity}/10`}
          </p>
        </div>
        <StatusBadge status={ep.status} />
      </div>

      <div className="flex gap-3">
        {ep.status !== "resolved" && (
          <button disabled={busy} onClick={() => write(sub, "PUT", { status: "resolved" }, "Marked as resolved.")} className={`${btnPrimary} flex-1`}>
            Mark resolved
          </button>
        )}
        <button onClick={() => setPanel(panel === "edit" ? null : "edit")} className={`${btnSecondary} flex-1`}>
          Edit details
        </button>
      </div>

      {panel === "edit" && <EditForm ep={ep} busy={busy} onSave={(b) => write(sub, "PUT", b, "Changes saved.")} />}

      <Card title="Symptoms" action={<AddButton onClick={() => setPanel(panel === "symptom" ? null : "symptom")} />}>
        {ep.symptoms.length === 0 && <p className="text-sm text-muted">None recorded.</p>}
        <ul className="space-y-2">
          {ep.symptoms.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>
                {s.symptomType}
                {s.bodyLocation && <span className="text-muted"> · {s.bodyLocation}</span>}
                {s.notes && <span className="block text-sm text-muted">{s.notes}</span>}
              </span>
              <span className="text-sm text-muted">{s.severity}/10</span>
            </li>
          ))}
        </ul>
        {panel === "symptom" && (
          <SymptomForm catalog={symptomCatalog} busy={busy} onSave={(b) => write(`${sub}/symptoms`, "POST", b, "Symptom added.")} />
        )}
      </Card>

      <Card title="Possible exposures" action={<AddButton onClick={() => setPanel(panel === "exposure" ? null : "exposure")} />}>
        {ep.exposures.length === 0 && <p className="text-sm text-muted">None noted.</p>}
        <ul className="space-y-2">
          {ep.exposures.map((x) => (
            <li key={x.id} className="flex justify-between gap-3">
              <span>
                {x.exposureCategory}
                {x.exposureDescription && <span className="text-muted"> · {x.exposureDescription}</span>}
              </span>
              <span className="text-sm text-muted">{RELATIONSHIP_LABEL[x.suspectedRelationship]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Things you noted around this episode. They are not confirmed causes.</p>
        {panel === "exposure" && (
          <ExposureForm catalog={exposureCatalog} busy={busy} onSave={async (b) => {
              if (await write(`${sub}/exposures`, "POST", b, "Exposure added.") && token) {
                api<{ items: CatalogItem[] }>("/api/exposures", { token }).then((r) => setExposureCatalog(r.items)).catch(() => {});
              }
            }} />
        )}
      </Card>

      <Card title="Treatments" action={<AddButton onClick={() => setPanel(panel === "treatment" ? null : "treatment")} />}>
        {ep.treatments.length === 0 && <p className="text-sm text-muted">None recorded.</p>}
        <ul className="space-y-2">
          {ep.treatments.map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span>
                {t.medicationName}
                {t.dosage && <span className="text-muted"> · {t.dosage}</span>}
                <span className="block text-sm text-muted">{formatDateTime(t.administrationTime)}</span>
              </span>
              <span className="text-sm text-muted">{RESPONSE_LABEL[t.response]}</span>
            </li>
          ))}
        </ul>
        {panel === "treatment" && (
          <TreatmentForm busy={busy} onSave={(b) => write(`${sub}/treatments`, "POST", b, "Treatment added.")} />
        )}
      </Card>

      {ep.generalNotes && (
        <Card title="Notes">
          <p className="whitespace-pre-wrap">{ep.generalNotes}</p>
        </Card>
      )}

      <p className="text-xs text-muted">
        ID {ep.id}
        <br />
        Created {formatDateTime(ep.createdAt)} · Updated {formatDateTime(ep.updatedAt)}
      </p>

      <button onClick={remove} className="min-h-11 text-sm text-danger">
        Remove episode
      </button>
    </main>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-11 px-2 text-sm font-medium text-accent">
      + Add
    </button>
  );
}

function EditForm({ ep, busy, onSave }: { ep: EpisodeDetail; busy: boolean; onSave: (b: object) => void }) {
  const [onset, setOnset] = useState(toLocalInput(new Date(ep.onsetAt)));
  const [res, setRes] = useState(ep.resolutionAt ? toLocalInput(new Date(ep.resolutionAt)) : "");
  const [status, setStatus] = useState<Status>(ep.status);
  const [sev, setSev] = useState<number | null>(ep.overallSeverity);
  const [notes, setNotes] = useState(ep.generalNotes ?? "");

  return (
    <Card title="Edit details">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            onsetAt: fromLocalInput(onset),
            status,
            resolutionAt: status === "active" ? null : res ? fromLocalInput(res) : undefined,
            overallSeverity: sev,
            generalNotes: notes || null,
          });
        }}
      >
        <Field label="Started">
          <input type="datetime-local" value={onset} onChange={(e) => setOnset(e.target.value)} className={inputCls} required />
        </Field>
        <div className="flex flex-wrap gap-2">
          {(["active", "resolved", "unknown"] as const).map((s) => (
            <Chip key={s} selected={status === s} onClick={() => setStatus(s)}>
              {s[0]!.toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </div>
        {status !== "active" && (
          <Field label="Resolved" hint="leave blank for now">
            <input type="datetime-local" value={res} onChange={(e) => setRes(e.target.value)} className={inputCls} />
          </Field>
        )}
        <div>
          <p className="mb-2 text-sm font-medium">Severity</p>
          <SeverityPicker value={sev} onChange={setSev} />
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={5000} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent" />
        </Field>
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Card>
  );
}

function SymptomForm({ catalog, busy, onSave }: { catalog: CatalogItem[]; busy: boolean; onSave: (b: object) => void }) {
  const [type, setType] = useState("");
  const [loc, setLoc] = useState("");
  const [sev, setSev] = useState<number | null>(null);
  return (
    <form
      className="mt-4 space-y-3 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (type && sev) onSave({ symptomType: type, bodyLocation: loc || null, severity: sev });
      }}
    >
      <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls} aria-label="Symptom" required>
        <option value="">Choose symptom…</option>
        {catalog.map((c) => (
          <option key={c.id}>{c.name}</option>
        ))}
      </select>
      <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Body location (optional)" maxLength={80} className={inputCls} />
      <SeverityPicker value={sev} onChange={setSev} />
      <button type="submit" disabled={busy || !type || !sev} className={`${btnPrimary} w-full`}>
        Add symptom
      </button>
    </form>
  );
}

function ExposureForm({ catalog, busy, onSave }: { catalog: CatalogItem[]; busy: boolean; onSave: (b: object) => void }) {
  const [cat, setCat] = useState("");
  const [desc, setDesc] = useState("");
  const [rel, setRel] = useState<Relationship>("unknown");
  return (
    <form
      className="mt-4 space-y-3 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (cat.trim()) onSave({ exposureCategory: cat.trim(), exposureDescription: desc || null, suspectedRelationship: rel });
      }}
    >
      <CategoryPicker catalog={catalog} value={cat} onChange={setCat} placeholder="Choose category…" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was it? (optional)" maxLength={500} className={inputCls} />
      <select value={rel} onChange={(e) => setRel(e.target.value as Relationship)} className={inputCls} aria-label="How likely a factor">
        <option value="unknown">Unknown if related</option>
        <option value="possible">Possibly related</option>
        <option value="suspected">Suspected</option>
        <option value="confirmed_by_clinician">Confirmed by my clinician</option>
      </select>
      <button type="submit" disabled={busy || !cat.trim()} className={`${btnPrimary} w-full`}>
        Add exposure
      </button>
    </form>
  );
}

function TreatmentForm({ busy, onSave }: { busy: boolean; onSave: (b: object) => void }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [time, setTime] = useState(toLocalInput(new Date()));
  const [resp, setResp] = useState<Response>("unknown");
  return (
    <form
      className="mt-4 space-y-3 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ medicationName: name.trim(), dosage: dose || null, administrationTime: fromLocalInput(time), response: resp });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Medication name" maxLength={120} className={inputCls} required />
      <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose (optional)" maxLength={120} className={inputCls} />
      <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} aria-label="Time taken" required />
      <select value={resp} onChange={(e) => setResp(e.target.value as Response)} className={inputCls} aria-label="Response">
        <option value="unknown">Response: not sure yet</option>
        <option value="none">No response</option>
        <option value="partial">Partial</option>
        <option value="significant">Significant</option>
        <option value="complete">Complete</option>
      </select>
      <button type="submit" disabled={busy || !name.trim()} className={`${btnPrimary} w-full`}>
        Add treatment
      </button>
    </form>
  );
}
