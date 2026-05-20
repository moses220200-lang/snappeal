"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Save, Trash2 } from "lucide-react";

interface CouncilRow {
  slug: string;
  name: string;
  type: string;
  appealPortalUrl: string;
  appealEmail: string | null;
  postalAddress: string | null;
  submissionMethods: string[];
  identifierHints: string[];
  pcnRefPattern: string | null;
  automationStatus: "manual" | "automated_beta" | "automated_ga";
  notes: string | null;
}

interface Props {
  mode: "create" | "edit";
  initial?: CouncilRow;
}

const EMPTY: CouncilRow = {
  slug: "",
  name: "",
  type: "borough",
  appealPortalUrl: "",
  appealEmail: "",
  postalAddress: "",
  submissionMethods: ["portal", "email"],
  identifierHints: [],
  pcnRefPattern: "",
  automationStatus: "manual",
  notes: "",
};

export function CouncilForm({ mode, initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<CouncilRow>(initial ?? EMPTY);
  const [hintsText, setHintsText] = useState(
    (initial?.identifierHints ?? []).join("\n"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof CouncilRow>(key: K, value: CouncilRow[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const identifierHints = hintsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = { ...draft, identifierHints };
      const url = mode === "create" ? "/api/admin/councils" : `/api/admin/councils/${draft.slug}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body = mode === "create" ? payload : { ...payload, slug: undefined };
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Failed (${res.status})`);
      router.replace("/admin/councils");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/councils" className="text-xs text-snappeal-primary inline-flex items-center gap-1">
          <ChevronLeft className="size-3.5" /> All councils
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-snappeal-navy">
          {mode === "create" ? "Add council" : draft.name || draft.slug}
        </h1>
        <p className="text-sm text-snappeal-muted mt-1">
          {mode === "create"
            ? "New London authority. Slug must be kebab-case (e.g. hackney)."
            : "Update the council's KB row. Changes take effect on the next appeal."}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Card title="Identity">
          <Grid>
            <Field label="Slug (kebab-case)" hint="e.g. hackney">
              <input
                value={draft.slug}
                onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                disabled={mode === "edit"}
                placeholder="hackney"
                className="font-mono input-base"
              />
            </Field>
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="London Borough of Hackney"
                className="input-base"
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(e) => setField("type", e.target.value as CouncilRow["type"])}
                className="input-base"
              >
                <option value="borough">Borough</option>
                <option value="corporation">Corporation</option>
                <option value="tfl">TfL</option>
                <option value="royal_parks">Royal Parks</option>
              </select>
            </Field>
            <Field label="Automation status">
              <select
                value={draft.automationStatus}
                onChange={(e) => setField("automationStatus", e.target.value as CouncilRow["automationStatus"])}
                className="input-base"
              >
                <option value="manual">Manual (email / post)</option>
                <option value="automated_beta">Automated · beta</option>
                <option value="automated_ga">Automated · GA</option>
              </select>
            </Field>
          </Grid>
        </Card>

        <Card title="Channels">
          <Grid>
            <Field label="Appeal portal URL">
              <input
                value={draft.appealPortalUrl}
                onChange={(e) => setField("appealPortalUrl", e.target.value)}
                placeholder="https://appeals.hackney.gov.uk/"
                className="input-base"
              />
            </Field>
            <Field label="Appeal email (optional)">
              <input
                value={draft.appealEmail ?? ""}
                onChange={(e) => setField("appealEmail", e.target.value || null)}
                placeholder="parkingappeals@hackney.gov.uk"
                className="input-base"
              />
            </Field>
            <Field label="Postal address (optional)" full>
              <textarea
                value={draft.postalAddress ?? ""}
                onChange={(e) => setField("postalAddress", e.target.value || null)}
                rows={2}
                placeholder="London Borough of Hackney, Parking Operations, PO Box ..."
                className="input-base resize-y"
              />
            </Field>
            <Field label="Submission methods" full>
              <div className="flex flex-wrap gap-2">
                {(["portal", "email", "post"] as const).map((m) => {
                  const on = draft.submissionMethods.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setField(
                          "submissionMethods",
                          on
                            ? draft.submissionMethods.filter((x) => x !== m)
                            : [...draft.submissionMethods, m],
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        on
                          ? "bg-snappeal-primary text-white"
                          : "bg-white border border-snappeal-border text-snappeal-navy"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Grid>
        </Card>

        <Card title="Identifier hints">
          <Field
            label="One hint per line — short strings the OCR can match against to identify this council"
          >
            <textarea
              value={hintsText}
              onChange={(e) => setHintsText(e.target.value)}
              rows={5}
              placeholder={"LONDON BOROUGH OF HACKNEY\nHackney Council\nLB Hackney"}
              className="input-base resize-y font-mono"
            />
          </Field>
        </Card>

        <Card title="PCN reference pattern (optional)">
          <Field label="Regex-style pattern matched against extracted PCN refs">
            <input
              value={draft.pcnRefPattern ?? ""}
              onChange={(e) => setField("pcnRefPattern", e.target.value || null)}
              placeholder="^HK[0-9]{8,10}$"
              className="font-mono input-base"
            />
          </Field>
        </Card>

        <Card title="Notes (internal)">
          <Field label="Ops notes for this council">
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value || null)}
              rows={4}
              placeholder="e.g. requires two-step verification; usually responds in 21 days; portal uses Taranto"
              className="input-base resize-y"
            />
          </Field>
        </Card>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-snappeal-action text-white font-semibold px-5 py-3 shadow-lg shadow-snappeal-action/40 hover:bg-snappeal-action-600 transition disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {mode === "create" ? "Create council" : "Save changes"}
          </button>
          <Link href="/admin/councils" className="text-xs text-snappeal-muted hover:text-snappeal-navy">
            Cancel
          </Link>
          {mode === "edit" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-snappeal-muted">
              <Trash2 className="size-3.5" /> Hard-delete via SQL only — councils are referenced by appeals.
            </span>
          )}
        </div>
      </form>

      {/* shared input styling so we don't rewrite Tailwind classes 8x */}
      <style jsx>{`
        :global(.input-base) {
          width: 100%;
          background: rgba(250, 250, 250, 0.6);
          border: 1px solid var(--color-snappeal-border);
          border-radius: 0.75rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: var(--color-snappeal-navy);
          outline: none;
          transition: border-color 0.15s ease;
        }
        :global(.input-base:focus) {
          border-color: var(--color-snappeal-primary);
        }
        :global(.input-base:disabled) {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-snappeal-border p-5 flex flex-col gap-3">
      <p className="text-sm font-bold text-snappeal-navy">{title}</p>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-snappeal-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-snappeal-muted">{hint}</span>}
    </label>
  );
}
