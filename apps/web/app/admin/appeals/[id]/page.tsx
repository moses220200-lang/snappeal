/**
 * /admin/appeals/[id] — single appeal deep-dive.
 *
 * Server-rendered; no client interactivity beyond native <details>
 * expand/collapse so the whole page stays a Server Component.
 *
 * Sections (top to bottom):
 *   1. Header strip — id, status, service tier, owner email, timestamps.
 *   2. KPI tiles — cost, calls, wall-clock, strength, portal verdict.
 *   3. Identity grid — canonical ticket + ownership/viewers.
 *   4. Council verdict — portalLookup snapshot.
 *   5. Processing state + Letter (with strength card).
 *   6. Image gallery — categorised: PCN / Warden / Evidence / MCP / Submission.
 *      (covers issues #42 MCP screenshots + #44 categorised gallery)
 *   7. AI calls — expandable rows showing error + (for MCP jobs) the
 *      slice of `jobs.progress` events that surfaced during that call.
 *      (covers issue #43 per-call activity/thinking log)
 *   8. Jobs / Submissions / Inbound mail.
 *   9. Raw JSON dumps (collapsed) for ticket / timeline / processing.
 */
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/server/db/client";
import { formatCostUsd } from "@/lib/server/aiCalls";
import { getCouncilLookup } from "@/lib/server/councils";
import { CouncilBadge } from "@/components/CouncilBadge";
import type {
  JobProgressEvent,
  PortalLookupSnapshot,
  ProcessingStatus,
  TicketPortalSnapshot,
} from "@/lib/server/db/schema";

export const dynamic = "force-dynamic";

/* ───── types ─────
 *
 * `appeals.ticket` jsonb has no compile-time schema. We narrow at read
 * time so the rest of the page can render fields without `as any`. */
type TicketJson = {
  issuer?: string;
  pcnRef?: string;
  vehicleReg?: string;
  contraventionCode?: string;
  contraventionDescription?: string;
  issuedAt?: string;
  location?: string;
  amountPence?: number;
  discountUntil?: string;
  fullChargeFrom?: string;
  dueDateAt?: string;
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  submitting: "bg-amber-100 text-amber-700",
  submitted: "bg-parkingrabbit-primary-100 text-parkingrabbit-primary-700",
  under_review: "bg-amber-100 text-amber-700",
  decision_pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const VERDICT_TONE: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  expired: "bg-amber-100 text-amber-700",
  paid: "bg-slate-100 text-slate-700",
  closed: "bg-slate-100 text-slate-700",
  not_found: "bg-red-100 text-red-700",
  unknown: "bg-slate-100 text-slate-700",
};

const STEP_TONE: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  running: "bg-amber-100 text-amber-700",
  pending: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-700",
};

export default async function AdminAppealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) notFound();
  const appealRows = await db
    .select()
    .from(schema.appeals)
    .where(eq(schema.appeals.id, id));
  const appeal = appealRows[0];
  if (!appeal) notFound();

  // Fan-out: every related row for this appeal in one parallel batch.
  // None of these queries depend on each other so Promise.all is safe.
  const [submissions, inbound, jobs, aiCalls, photos, viewers, councilMap, ticketRows, ownerRows, payments] =
    await Promise.all([
      db
        .select()
        .from(schema.submissions)
        .where(eq(schema.submissions.appealId, id)),
      db
        .select()
        .from(schema.inboundMessages)
        .where(eq(schema.inboundMessages.appealId, id)),
      db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.appealId, id))
        .orderBy(asc(schema.jobs.createdAt)),
      db
        .select()
        .from(schema.aiCalls)
        .where(eq(schema.aiCalls.appealId, id))
        .orderBy(asc(schema.aiCalls.createdAt)),
      db
        .select()
        .from(schema.appealPhotos)
        .where(eq(schema.appealPhotos.appealId, id))
        .orderBy(asc(schema.appealPhotos.uploadedAt)),
      db
        .select()
        .from(schema.appealViewers)
        .where(eq(schema.appealViewers.appealId, id)),
      getCouncilLookup(),
      appeal.ticketId
        ? db
            .select()
            .from(schema.tickets)
            .where(eq(schema.tickets.id, appeal.ticketId))
        : Promise.resolve([] as Array<typeof schema.tickets.$inferSelect>),
      appeal.userId
        ? db
            .select()
            .from(schema.users)
            .where(eq(schema.users.id, appeal.userId))
        : Promise.resolve([] as Array<typeof schema.users.$inferSelect>),
      db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.appealId, id)),
    ]);

  // Resolve viewer userIds → user rows in one extra query (small N).
  const viewerUserIds = viewers.map((v) => v.userId).filter((u): u is string => !!u);
  const viewerUsers = viewerUserIds.length
    ? await db
        .select()
        .from(schema.users)
        .where(inArray(schema.users.id, viewerUserIds))
    : [];
  const viewerUserById = new Map(viewerUsers.map((u) => [u.id, u]));

  // Header totals — single pass over ai_calls.
  let totalUsd = 0;
  let totalMs = 0;
  let okCalls = 0;
  let errCalls = 0;
  for (const c of aiCalls) {
    totalUsd += c.costUsd != null ? Number(c.costUsd) : 0;
    totalMs += c.durationMs ?? 0;
    if (c.ok) okCalls += 1;
    else errCalls += 1;
  }

  const ticketJson = (appeal.ticket ?? {}) as TicketJson;
  const ticketRow = ticketRows[0] ?? null;
  const owner = ownerRows[0] ?? null;
  const portal = (appeal.portalLookup ?? null) as PortalLookupSnapshot | null;
  const processing = (appeal.processing ?? null) as ProcessingStatus | null;
  const council = appeal.councilSlug ? councilMap.get(appeal.councilSlug) : null;

  // jobId → array of progress events; used by both the gallery (MCP
  // screenshots) and the ai_calls expandable rows (thoughts/steps).
  const jobProgress = new Map<string, JobProgressEvent[]>();
  for (const j of jobs) {
    jobProgress.set(j.id, (j.progress as JobProgressEvent[] | null) ?? []);
  }

  // Categorise photos for the gallery: pcn vs evidence.
  const pcnPhotos = photos.filter((p) => p.kind === "pcn");
  const evidencePhotos = photos.filter((p) => p.kind === "evidence");

  // Warden photos can appear in BOTH the per-appeal portalLookup AND
  // the shared canonical-ticket snapshot. De-dup by URL.
  const wardenSet = new Set<string>();
  for (const url of portal?.photoUrls ?? []) wardenSet.add(url);
  const ticketSnap = (ticketRow?.portalSnapshot ?? null) as TicketPortalSnapshot | null;
  for (const url of ticketSnap?.photoUrls ?? []) wardenSet.add(url);
  const wardenPhotos = Array.from(wardenSet);

  // MCP screenshots — flatten across all jobs, tag with job id+kind so
  // the gallery can group by which job they came from (lookup vs submit).
  const mcpShots: Array<{
    jobId: string;
    jobKind: string;
    step: number;
    url: string;
    caption?: string;
    ts: string;
  }> = [];
  for (const j of jobs) {
    const events = jobProgress.get(j.id) ?? [];
    for (const e of events) {
      if (e.kind === "screenshot") {
        mcpShots.push({
          jobId: j.id,
          jobKind: j.kind,
          step: e.step,
          url: e.url,
          caption: e.caption,
          ts: e.ts,
        });
      }
    }
  }

  const submissionShots = submissions
    .filter((s) => !!s.screenshotUrl)
    .map((s) => ({ id: s.id, url: s.screenshotUrl as string, status: s.status }));

  const totalImages =
    (appeal.pcnImageUrl ? 1 : 0) +
    pcnPhotos.length +
    wardenPhotos.length +
    evidencePhotos.length +
    mcpShots.length +
    submissionShots.length;

  return (
    <div className="flex flex-col gap-5">
      {/* ───── 1. Header ───── */}
      <div>
        <Link href="/admin/appeals" className="text-xs text-parkingrabbit-primary">
          ← Back to all appeals
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold text-parkingrabbit-navy font-mono">{appeal.id}</h1>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
              STATUS_TONE[appeal.status] ?? STATUS_TONE.draft
            }`}
          >
            {appeal.status}
          </span>
          <span className="text-xs text-parkingrabbit-muted">tier: {appeal.serviceTier}</span>
          <span className="text-xs text-parkingrabbit-muted">step: {appeal.step}</span>
          {appeal.preferredMethod && (
            <span className="text-xs text-parkingrabbit-muted">method: {appeal.preferredMethod}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-parkingrabbit-muted">
          created {new Date(appeal.createdAt).toLocaleString("en-GB")} · updated{" "}
          {new Date(appeal.updatedAt).toLocaleString("en-GB")}
          {owner && (
            <>
              {" · "}
              owner{" "}
              <Link href={`/admin/users/${owner.id}`} className="text-parkingrabbit-primary hover:underline">
                {owner.email}
              </Link>
            </>
          )}
          {!owner && appeal.sessionId && <> · guest session <span className="font-mono">{appeal.sessionId.slice(0, 12)}…</span></>}
        </p>
      </div>

      {/* ───── 2. KPI tiles ───── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Claude spend" value={formatCostUsd(totalUsd)} hint={`${aiCalls.length} call${aiCalls.length === 1 ? "" : "s"}`} />
        <Kpi label="Agent wall-clock" value={`${(totalMs / 1000).toFixed(1)}s`} hint={`${okCalls} ok / ${errCalls} err`} />
        <Kpi
          label="Portal verdict"
          value={portal?.verdict ?? "—"}
          hint={portal?.status ?? "no lookup"}
          tone={portal?.verdict ? VERDICT_TONE[portal.verdict] : undefined}
        />
        <Kpi
          label="Strength"
          value={appeal.strengthScore != null ? `${appeal.strengthScore}/100` : "—"}
          hint={appeal.letterWordCount != null ? `${appeal.letterWordCount} words` : "no letter"}
        />
        <Kpi label="Images" value={String(totalImages)} hint={`${mcpShots.length} MCP shots`} />
      </div>

      {/* ───── 3. Identity grid: canonical ticket + ownership ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Canonical ticket">
          <div className="flex flex-col gap-2">
            <MetaRow label="Council">
              {ticketJson.issuer ? (
                <CouncilBadge
                  size="sm"
                  name={ticketJson.issuer}
                  logoUrl={council?.logoUrl ?? null}
                  logoBg={council?.logoBg ?? null}
                />
              ) : (
                "—"
              )}
              {appeal.councilSlug && (
                <span className="ml-2 text-[11px] text-parkingrabbit-muted font-mono">{appeal.councilSlug}</span>
              )}
            </MetaRow>
            <MetaRow label="PCN ref">
              <code className="font-mono text-parkingrabbit-navy">{ticketRow?.pcnRef ?? ticketJson.pcnRef ?? "—"}</code>
            </MetaRow>
            <MetaRow label="Vehicle">
              <code className="font-mono text-parkingrabbit-navy">{ticketRow?.vehicleReg ?? ticketJson.vehicleReg ?? "—"}</code>
            </MetaRow>
            <MetaRow label="Contravention">
              <code className="font-mono text-parkingrabbit-navy">{ticketRow?.contraventionCode ?? ticketJson.contraventionCode ?? "—"}</code>
              {(ticketRow?.contraventionDescription ?? ticketJson.contraventionDescription) && (
                <span className="ml-2 text-[11px] text-parkingrabbit-muted">
                  {ticketRow?.contraventionDescription ?? ticketJson.contraventionDescription}
                </span>
              )}
            </MetaRow>
            <MetaRow label="Location">{ticketRow?.location ?? ticketJson.location ?? "—"}</MetaRow>
            <MetaRow label="Issued">
              {ticketRow?.issuedAt
                ? new Date(ticketRow.issuedAt).toLocaleString("en-GB")
                : ticketJson.issuedAt ?? "—"}
            </MetaRow>
            <MetaRow label="Amount">
              {formatAmountPence(ticketRow?.amountPence ?? ticketJson.amountPence)}
            </MetaRow>
            {appeal.ticketId && (
              <MetaRow label="Ticket id">
                <code className="font-mono text-[11px] text-parkingrabbit-muted">{appeal.ticketId}</code>
              </MetaRow>
            )}
          </div>
        </Card>

        <Card title="Ownership & access">
          <div className="flex flex-col gap-2">
            <MetaRow label="Owner">
              {owner ? (
                <Link href={`/admin/users/${owner.id}`} className="text-parkingrabbit-primary hover:underline">
                  {owner.email}
                </Link>
              ) : (
                <span className="text-parkingrabbit-muted">guest</span>
              )}
            </MetaRow>
            <MetaRow label="Session">
              <code className="font-mono text-[11px] text-parkingrabbit-muted">{appeal.sessionId}</code>
            </MetaRow>
            {appeal.replyEmail && (
              <MetaRow label="Reply-to">
                <code className="font-mono text-[11px] text-parkingrabbit-muted">{appeal.replyEmail}</code>
              </MetaRow>
            )}
            <MetaRow label="Shared viewers">
              {viewers.length === 0 ? (
                <span className="text-parkingrabbit-muted">none</span>
              ) : (
                <span>{viewers.length}</span>
              )}
            </MetaRow>
            {viewers.length > 0 && (
              <ul className="ml-4 mt-1 flex flex-col gap-1">
                {viewers.map((v) => {
                  const u = v.userId ? viewerUserById.get(v.userId) : null;
                  return (
                    <li
                      key={`${v.appealId}:${v.sessionId}`}
                      className="text-[11px] text-parkingrabbit-muted"
                    >
                      {u ? (
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-parkingrabbit-primary hover:underline"
                        >
                          {u.email}
                        </Link>
                      ) : (
                        <span className="font-mono">guest {v.sessionId.slice(0, 12)}…</span>
                      )}
                      <span className="ml-2">joined {new Date(v.joinedAt).toLocaleString("en-GB")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <MetaRow label="Grounds">
              {appeal.grounds.length === 0 ? (
                <span className="text-parkingrabbit-muted">none picked</span>
              ) : (
                <span className="text-[11px] font-mono">{appeal.grounds.join(", ")}</span>
              )}
            </MetaRow>
            {payments.length > 0 && (
              <MetaRow label="Payments">
                <span className="text-[11px]">
                  {payments.length} ·{" "}
                  {payments
                    .map((p) => `${p.status} £${(p.amountPence / 100).toFixed(2)}`)
                    .join(", ")}
                </span>
              </MetaRow>
            )}
          </div>
        </Card>
      </div>

      {/* ───── 4. Council verdict ───── */}
      {portal && (
        <Card title="Council verdict (portal lookup)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MetaRow label="Status">
              <span
                className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                  portal.status === "verified"
                    ? "bg-green-100 text-green-700"
                    : portal.status === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {portal.status}
              </span>
            </MetaRow>
            <MetaRow label="Verdict">
              {portal.verdict ? (
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                    VERDICT_TONE[portal.verdict] ?? VERDICT_TONE.unknown
                  }`}
                >
                  {portal.verdict}
                </span>
              ) : (
                "—"
              )}
            </MetaRow>
            {portal.verdictReason && (
              <MetaRow label="Reason">
                <span className="text-[11px] text-parkingrabbit-muted">{portal.verdictReason}</span>
              </MetaRow>
            )}
            <MetaRow label="Fetched">
              <span className="text-[11px] text-parkingrabbit-muted">
                {new Date(portal.fetchedAt).toLocaleString("en-GB")}
              </span>
            </MetaRow>
            {ticketSnap?.source && (
              <MetaRow label="Source">
                <span className="text-[11px] font-mono">{ticketSnap.source}</span>
              </MetaRow>
            )}
            {portal.metadata?.amountPence != null && (
              <MetaRow label="Amount (portal)">
                {formatAmountPence(portal.metadata.amountPence)}
              </MetaRow>
            )}
            {portal.metadata?.discountUntil && (
              <MetaRow label="Discount until">
                <span className="text-[11px]">{portal.metadata.discountUntil}</span>
              </MetaRow>
            )}
            {portal.metadata?.dueDateAt && (
              <MetaRow label="Due">
                <span className="text-[11px]">{portal.metadata.dueDateAt}</span>
              </MetaRow>
            )}
            {portal.metadata?.paidAt && (
              <MetaRow label="Paid at">
                <span className="text-[11px]">{portal.metadata.paidAt}</span>
              </MetaRow>
            )}
          </div>
        </Card>
      )}

      {/* ───── 5. Processing + Letter (with strength) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Processing state">
          <div className="flex flex-col gap-2">
            <StepRow label="OCR" step={processing?.ocr} />
            <StepRow label="Analysis" step={processing?.analysis} />
            <StepRow label="Draft" step={processing?.draft} />
            {processing?.ocr?.runId && (
              <p className="text-[10px] text-parkingrabbit-muted mt-1">
                run id: <code className="font-mono">{processing.ocr.runId.slice(0, 14)}…</code>
              </p>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2">
          <Card
            title={
              appeal.letterBody
                ? `Letter — ${appeal.letterWordCount ?? 0} words${
                    appeal.strengthScore != null ? ` · strength ${appeal.strengthScore}/100` : ""
                  }`
                : "Letter (none yet)"
            }
          >
            {appeal.letterBody ? (
              <>
                {appeal.letterSubject && (
                  <p className="text-xs font-semibold text-parkingrabbit-navy mb-2">
                    {appeal.letterSubject}
                  </p>
                )}
                {appeal.letterAddressedTo && (
                  <p className="text-[11px] text-parkingrabbit-muted mb-2">
                    addressed to: {appeal.letterAddressedTo}
                  </p>
                )}
                {appeal.strengthScore != null && appeal.strengthScore < 80 && (
                  <div
                    className={`mb-3 rounded-lg p-3 text-[11px] ${
                      appeal.strengthScore < 50
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {appeal.strengthRationale && <p>{appeal.strengthRationale}</p>}
                    {appeal.strengthImprovements && appeal.strengthImprovements.length > 0 && (
                      <ul className="list-disc pl-4 mt-1">
                        {appeal.strengthImprovements.map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary mb-2">
                    Show letter body
                  </summary>
                  <pre className="text-xs text-parkingrabbit-navy whitespace-pre-wrap font-sans leading-relaxed mt-2">
                    {appeal.letterBody}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-xs text-parkingrabbit-muted">No letter drafted yet.</p>
            )}
            {appeal.notes && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary">
                  User notes
                </summary>
                <pre className="text-xs text-parkingrabbit-navy whitespace-pre-wrap font-sans leading-relaxed mt-2">
                  {appeal.notes}
                </pre>
              </details>
            )}
          </Card>
        </div>
      </div>

      {/* ───── 6. Image gallery (categorised) ─────
           Covers issues #42 + #44. Each category is a <details> block
           with a count; expanding the whole gallery is one click. */}
      <Card title={`Image gallery (${totalImages})`}>
        {totalImages === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No images yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <GalleryCategory
              label="PCN photo"
              count={(appeal.pcnImageUrl ? 1 : 0) + pcnPhotos.length}
              tone="bg-parkingrabbit-primary-50 border-parkingrabbit-primary/20"
              defaultOpen
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {appeal.pcnImageUrl && (
                  <Thumb url={appeal.pcnImageUrl} caption="uploaded scan (current)" />
                )}
                {pcnPhotos.map((p) => (
                  <Thumb
                    key={p.id}
                    url={p.blobUrl}
                    caption={p.caption ?? `uploaded ${new Date(p.uploadedAt).toLocaleTimeString("en-GB")}`}
                  />
                ))}
              </div>
            </GalleryCategory>

            <GalleryCategory
              label="Warden / portal photos"
              count={wardenPhotos.length}
              tone="bg-amber-50 border-amber-200"
            >
              {wardenPhotos.length === 0 ? (
                <p className="text-[11px] text-parkingrabbit-muted">No warden photos from the portal lookup.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {wardenPhotos.map((url, i) => (
                    <Thumb key={url} url={url} caption={`warden ${i + 1}`} />
                  ))}
                </div>
              )}
            </GalleryCategory>

            <GalleryCategory
              label="Evidence photos"
              count={evidencePhotos.length}
              tone="bg-slate-50 border-slate-200"
            >
              {evidencePhotos.length === 0 ? (
                <p className="text-[11px] text-parkingrabbit-muted">User has not added evidence photos.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {evidencePhotos.map((p) => (
                    <Thumb
                      key={p.id}
                      url={p.blobUrl}
                      caption={p.caption ?? `uploaded ${new Date(p.uploadedAt).toLocaleTimeString("en-GB")}`}
                    />
                  ))}
                </div>
              )}
            </GalleryCategory>

            {/* MCP screenshots — issue #42. Grouped by job so a single
                lookup or submit run shows as one strip. Most useful
                when you're debugging "why did this submission stall on
                step 14?" — you scrub the row left to right. */}
            <GalleryCategory
              label="MCP screenshots"
              count={mcpShots.length}
              tone="bg-indigo-50 border-indigo-200"
            >
              {mcpShots.length === 0 ? (
                <p className="text-[11px] text-parkingrabbit-muted">No Playwright screenshots captured.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {Array.from(groupBy(mcpShots, (s) => s.jobId).entries()).map(([jobId, shots]) => {
                    const job = jobs.find((j) => j.id === jobId);
                    return (
                      <div key={jobId}>
                        <p className="text-[11px] text-parkingrabbit-muted mb-2">
                          <code className="font-mono">{jobId.slice(-12)}</code>
                          {job && (
                            <>
                              {" · "}
                              {job.kind} · {job.status} · {shots.length} shot{shots.length === 1 ? "" : "s"}
                            </>
                          )}
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                          {shots
                            .sort((a, b) => a.step - b.step)
                            .map((s) => (
                              <Thumb
                                key={`${jobId}-${s.step}`}
                                url={s.url}
                                caption={`step ${s.step}${s.caption ? ` · ${s.caption}` : ""}`}
                              />
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GalleryCategory>

            <GalleryCategory
              label="Submission confirmations"
              count={submissionShots.length}
              tone="bg-green-50 border-green-200"
            >
              {submissionShots.length === 0 ? (
                <p className="text-[11px] text-parkingrabbit-muted">No submission confirmation screenshot.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {submissionShots.map((s) => (
                    <Thumb key={s.id} url={s.url} caption={`submission ${s.status}`} />
                  ))}
                </div>
              )}
            </GalleryCategory>
          </div>
        )}
      </Card>

      {/* ───── 7. AI calls (expandable per-row) — issue #43 ─────
           Click a row to see the error + (for MCP calls) the slice of
           jobs.progress events that surfaced during the run. The
           thinking transcript for one-shot calls (extract/draft) isn't
           persisted today; we surface what we have. */}
      <Card
        title={`AI calls (${aiCalls.length}) · ${formatCostUsd(totalUsd)} · ${(totalMs / 1000).toFixed(1)}s`}
      >
        {aiCalls.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No Claude calls recorded for this appeal yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-parkingrabbit-muted px-2 pb-1 border-b border-parkingrabbit-border">
              <div className="col-span-2">When</div>
              <div className="col-span-2">Stage</div>
              <div className="col-span-1">Mode</div>
              <div className="col-span-2">Model</div>
              <div className="col-span-1 text-right">In</div>
              <div className="col-span-1 text-right">Out</div>
              <div className="col-span-1 text-right">Cost</div>
              <div className="col-span-1 text-right">Dur</div>
              <div className="col-span-1 text-center">OK</div>
            </div>
            {aiCalls.map((c) => {
              const events = c.jobId ? jobProgress.get(c.jobId) ?? [] : [];
              // Filter progress to a window from the call start to start + duration.
              // For MCP calls the events cluster inside that window; for retries we
              // err on the side of including ambient events around the call.
              const callStart = c.createdAt.getTime();
              const callEnd = callStart + (c.durationMs ?? 0) + 2000;
              const callEvents = events.filter((e) => {
                const t = new Date(e.ts).getTime();
                return t >= callStart - 500 && t <= callEnd;
              });
              const thoughts = callEvents.filter((e) => e.kind === "thought");
              const steps = callEvents.filter((e) => e.kind === "step");
              const statuses = callEvents.filter((e) => e.kind === "status");
              const metadataEvents = callEvents.filter((e) => e.kind === "metadata");
              const hasDetail =
                !c.ok || thoughts.length > 0 || steps.length > 0 || statuses.length > 0 || metadataEvents.length > 0;
              return (
                <details
                  key={c.id}
                  className="text-[11px] border-b border-parkingrabbit-border last:border-b-0"
                >
                  <summary
                    className={`grid grid-cols-12 gap-2 px-2 py-2 ${
                      hasDetail ? "cursor-pointer hover:bg-parkingrabbit-bg/30" : "cursor-default"
                    }`}
                  >
                    <div className="col-span-2 text-parkingrabbit-muted whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
                    </div>
                    <div className="col-span-2 font-mono text-parkingrabbit-navy">{c.stage}</div>
                    <div className="col-span-1 text-parkingrabbit-muted">{c.mode}</div>
                    <div className="col-span-2 text-parkingrabbit-muted font-mono truncate" title={c.model}>
                      {c.model}
                    </div>
                    <div className="col-span-1 text-right font-mono">{c.inputTokens ?? "—"}</div>
                    <div className="col-span-1 text-right font-mono">{c.outputTokens ?? "—"}</div>
                    <div className="col-span-1 text-right font-mono">
                      {c.costUsd != null ? formatCostUsd(Number(c.costUsd)) : "—"}
                    </div>
                    <div className="col-span-1 text-right font-mono text-parkingrabbit-muted">
                      {c.durationMs != null ? `${(c.durationMs / 1000).toFixed(1)}s` : "—"}
                    </div>
                    <div className="col-span-1 text-center">
                      {c.ok ? (
                        <span className="text-green-700">✓</span>
                      ) : (
                        <span className="text-red-700">✗</span>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-2 pb-3 pt-1 bg-parkingrabbit-bg/30 -mx-2">
                      {!c.ok && (
                        <div className="mb-2 rounded-lg bg-red-50 border border-red-200 p-2 text-[11px] text-red-800">
                          <p className="font-bold">
                            {c.errorKind ?? "error"}
                          </p>
                          {c.errorMessage && <p className="mt-0.5 whitespace-pre-wrap">{c.errorMessage}</p>}
                        </div>
                      )}
                      {(c.cacheReadTokens || c.cacheWriteTokens) && (
                        <p className="text-[10px] text-parkingrabbit-muted mb-2">
                          cache read: {c.cacheReadTokens ?? 0} · write: {c.cacheWriteTokens ?? 0}
                        </p>
                      )}
                      {c.jobId && (
                        <p className="text-[10px] text-parkingrabbit-muted mb-2">
                          job: <code className="font-mono">{c.jobId.slice(-14)}</code>
                        </p>
                      )}
                      {statuses.length > 0 && (
                        <ActivitySection title="Status">
                          {statuses.map((e, i) => (
                            <ActivityLine key={`s-${i}`} ts={e.ts}>
                              {e.kind === "status" ? e.message : ""}
                            </ActivityLine>
                          ))}
                        </ActivitySection>
                      )}
                      {steps.length > 0 && (
                        <ActivitySection title="Steps">
                          {steps.map((e, i) => (
                            <ActivityLine key={`step-${i}`} ts={e.ts}>
                              {e.kind === "step" ? e.message : ""}
                            </ActivityLine>
                          ))}
                        </ActivitySection>
                      )}
                      {thoughts.length > 0 && (
                        <ActivitySection title="Thinking">
                          {thoughts.map((e, i) => (
                            <ActivityLine key={`t-${i}`} ts={e.ts} italic>
                              {e.kind === "thought" ? e.message : ""}
                            </ActivityLine>
                          ))}
                        </ActivitySection>
                      )}
                      {metadataEvents.length > 0 && (
                        <ActivitySection title="Metadata captured">
                          <ul className="text-[11px] text-parkingrabbit-navy">
                            {metadataEvents.map((e, i) =>
                              e.kind === "metadata" ? (
                                <li key={`m-${i}`} className="font-mono">
                                  <span className="text-parkingrabbit-muted">{e.field}:</span> {e.value}
                                </li>
                              ) : null,
                            )}
                          </ul>
                        </ActivitySection>
                      )}
                      {c.ok && thoughts.length === 0 && steps.length === 0 && statuses.length === 0 && metadataEvents.length === 0 && (
                        <p className="text-[11px] text-parkingrabbit-muted">
                          No streaming activity recorded for this call. (One-shot calls don&apos;t persist a thinking
                          transcript; MCP calls would surface their walk here.)
                        </p>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </Card>

      {/* ───── 8. Jobs / Submissions / Inbound ───── */}
      <Card title={`Jobs (${jobs.length})`}>
        {jobs.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No jobs.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.map((j) => {
              const events = jobProgress.get(j.id) ?? [];
              return (
                <li key={j.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                  <p className="font-mono text-parkingrabbit-navy">{j.id}</p>
                  <p className="text-parkingrabbit-muted">
                    {j.kind} · {j.status} · attempt {j.attempts}/{j.maxAttempts} · {events.length} event
                    {events.length === 1 ? "" : "s"}
                    {j.lockedAt && (
                      <>
                        {" · locked "}
                        {new Date(j.lockedAt).toLocaleString("en-GB")}
                      </>
                    )}
                  </p>
                  {j.lastError && <p className="text-red-700 mt-1">err: {j.lastError}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`Submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No submissions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                <p className="font-mono text-parkingrabbit-navy">{s.id}</p>
                <p className="text-parkingrabbit-muted">
                  {s.status} · {s.method} · ref {s.councilReference ?? "—"} ·{" "}
                  {s.submittedAt ? new Date(s.submittedAt).toLocaleString("en-GB") : "pending"}
                </p>
                {s.lastError && <p className="text-red-700 mt-1">err: {s.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Inbound (${inbound.length})`}>
        {inbound.length === 0 ? (
          <p className="text-xs text-parkingrabbit-muted">No replies yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inbound.map((m) => (
              <li key={m.id} className="rounded-lg bg-parkingrabbit-bg/50 p-3 text-xs">
                <p className="font-semibold text-parkingrabbit-navy">{m.subject}</p>
                <p className="text-parkingrabbit-muted">
                  {m.classification ?? "?"} · from {m.fromAddr} · {new Date(m.receivedAt).toLocaleString("en-GB")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ───── 9. Raw JSON dumps (collapsed) ───── */}
      <Card title="Raw">
        <div className="flex flex-col gap-2">
          <details>
            <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary">
              ticket json ({Object.keys(ticketJson).length} keys)
            </summary>
            <pre className="text-[11px] text-parkingrabbit-navy whitespace-pre-wrap font-mono mt-2">
              {JSON.stringify(appeal.ticket ?? {}, null, 2)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary">
              timeline ({Array.isArray(appeal.timeline) ? appeal.timeline.length : 0} entries)
            </summary>
            <pre className="text-[11px] text-parkingrabbit-navy whitespace-pre-wrap font-mono mt-2">
              {JSON.stringify(appeal.timeline, null, 2)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary">processing</summary>
            <pre className="text-[11px] text-parkingrabbit-navy whitespace-pre-wrap font-mono mt-2">
              {JSON.stringify(appeal.processing ?? {}, null, 2)}
            </pre>
          </details>
          {appeal.knowledgePackUsed && (
            <details>
              <summary className="cursor-pointer text-[11px] text-parkingrabbit-primary">knowledge pack used</summary>
              <pre className="text-[11px] text-parkingrabbit-navy whitespace-pre-wrap font-mono mt-2">
                {JSON.stringify(appeal.knowledgePackUsed, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ───── shared building blocks ───── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border p-5">
      <p className="text-sm font-bold text-parkingrabbit-navy mb-3">{title}</p>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-parkingrabbit-border p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-bold font-mono ${
          tone
            ? `text-base inline-block rounded-full px-2 py-0.5 ${tone}`
            : "text-lg text-parkingrabbit-navy"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-parkingrabbit-muted mt-1">{hint}</p>}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <p className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted pt-0.5">
        {label}
      </p>
      <div className="flex-1 min-w-0 text-parkingrabbit-navy">{children}</div>
    </div>
  );
}

function StepRow({
  label,
  step,
}: {
  label: string;
  step?: { status: string; error?: string | null; completedAt?: string } | undefined;
}) {
  const status = step?.status ?? "pending";
  return (
    <div className="flex items-center gap-2 text-xs">
      <p className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted">
        {label}
      </p>
      <span
        className={`text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 ${
          STEP_TONE[status] ?? STEP_TONE.pending
        }`}
      >
        {status}
      </span>
      {step?.completedAt && (
        <span className="text-[10px] text-parkingrabbit-muted">
          {new Date(step.completedAt).toLocaleTimeString("en-GB")}
        </span>
      )}
      {step?.error && <span className="text-[10px] text-red-700 truncate">{step.error}</span>}
    </div>
  );
}

function GalleryCategory({
  label,
  count,
  tone,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  tone: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className={`rounded-xl border p-3 ${tone}`}>
      <summary className="cursor-pointer flex items-center justify-between gap-2 text-sm">
        <span className="font-bold text-parkingrabbit-navy">{label}</span>
        <span className="text-[11px] text-parkingrabbit-muted font-mono">{count}</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Thumb({ url, caption }: { url: string; caption?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg overflow-hidden bg-white border border-parkingrabbit-border hover:border-parkingrabbit-primary transition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={caption ?? ""}
        className="w-full h-32 object-cover bg-slate-100"
      />
      {caption && (
        <p className="px-2 py-1 text-[10px] text-parkingrabbit-muted truncate" title={caption}>
          {caption}
        </p>
      )}
    </a>
  );
}

function ActivitySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parkingrabbit-muted mb-1">
        {title}
      </p>
      <div className="rounded-lg bg-white border border-parkingrabbit-border p-2">{children}</div>
    </div>
  );
}

function ActivityLine({
  ts,
  italic,
  children,
}: {
  ts: string;
  italic?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-[11px] text-parkingrabbit-navy ${italic ? "italic" : ""}`}>
      <span className="text-parkingrabbit-muted font-mono mr-2">
        {new Date(ts).toLocaleTimeString("en-GB", { hour12: false })}
      </span>
      {children}
    </p>
  );
}

/* ───── helpers ───── */

function formatAmountPence(pence: number | null | undefined): string {
  if (pence == null || !Number.isFinite(pence)) return "—";
  return `£${(pence / 100).toFixed(2)}`;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key);
    if (arr) arr.push(item);
    else out.set(key, [item]);
  }
  return out;
}
