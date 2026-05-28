"use client";

/**
 * LetterPreview — collapsible card that shows the AI-drafted appeal
 * letter, with a typewriter reveal the first time the letter lands.
 *
 * Why animate? When `/api/generate-stream` settles, the letter materialises
 * all at once on the polling client (we poll the row instead of consuming
 * the SSE chunks — see TicketCard.tsx). A few seconds of word-by-word
 * reveal sells the "AI just wrote this for you" feeling and gives the
 * user time to register that something just happened.
 *
 * After the animation completes (or if the letter was seen on a prior
 * mount), the collapsible behaves like a normal disclosure — tap header
 * to expand/collapse instantly. We persist "this letter has been seen"
 * in sessionStorage keyed by appeal id so a refresh doesn't replay the
 * animation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FileText } from "lucide-react";

const WORDS_PER_SECOND = 32; // ~300 word letter = ~9s of animation

interface Props {
  appealId: string;
  subject: string | null;
  body: string | null;
  wordCount: number | null;
  /** Default true — surfaces the letter fully so the customer reads it
   *  before the £2.99 submit CTA. Pass false when the preview lives
   *  under a settled SubmittedCard (the letter is reference-only at
   *  that point and shouldn't dominate the card). */
  defaultOpen?: boolean;
  /** True while `body` is actively growing from the SSE chunk loop in
   *  /api/generate-stream. When set:
   *    - the fake typewriter is skipped (the body grows naturally on
   *      every parent re-render, so synthesising a second animation on
   *      top would double-paint)
   *    - the disclosure is forced open so the user watches the letter
   *      being written
   *    - a typing cursor blinks at the tail
   *
   *  On the true → false edge (stream finished) we wait ~1.4 s so the
   *  customer registers the completed letter, then animate the
   *  disclosure shut — revealing the blue submit CTA that lives below
   *  this preview inside PaidSubmitCta. */
  isStreaming?: boolean;
}

export function LetterPreview({
  appealId,
  subject,
  body,
  wordCount,
  defaultOpen = true,
  isStreaming = false,
}: Props) {
  const seenKey = `parkingrabbit.letterSeen.${appealId}`;
  const initiallySeen = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(seenKey) === "1";
  }, [seenKey]);

  // Default to expanded so the letter body is visible on every mount —
  // previously this was `useState(!initiallySeen)`, which collapsed the
  // preview on every visit after the first typewriter pass and left the
  // customer staring at a header line with no body ("the letter looks
  // blank" symptom). Callers can pass defaultOpen=false (e.g. the post-
  // submit reference card) when the letter is supporting context, not
  // the main event.
  const [open, setOpen] = useState(defaultOpen);
  // Start with the full body painted. The typewriter is a pure
  // enhancement: it briefly rewinds to 0 then animates back up the first
  // time the user sees this letter. If the rAF tick fails for any
  // reason, the body stays fully visible instead of getting stuck at 0.
  const [revealedChars, setRevealedChars] = useState(body?.length ?? 0);
  const startedRef = useRef(false);

  // Live-stream branch — body is growing on every parent re-render from
  // SSE chunks. Skip the fake typewriter (it would double-animate on top
  // of the genuine stream), keep revealedChars locked to the live length
  // so the visible text tracks the real stream, and pin the disclosure
  // open so the user sees the letter being written.
  useEffect(() => {
    if (!isStreaming) return;
    startedRef.current = true; // suppress the post-mount typewriter below
    // The setStates here mirror props that are already React state in the
    // parent (TicketCard's draftStreamBody / draftStreamActive). The
    // react-hooks rule's "avoid setState in effect" guidance is aimed at
    // derived-state-as-effect anti-patterns; in this case we're syncing
    // internal state to a prop-edge (the streaming flag flipping on),
    // which is the canonical place to do it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealedChars(body?.length ?? 0);
    setOpen(true);
  }, [isStreaming, body?.length]);

  // Auto-collapse on the streaming → settled edge. The user just watched
  // the letter type itself out; we hold the completed letter visible for
  // ~1.4 s so they register the final state, then animate the disclosure
  // shut so the blue submit CTA below comes into view. This fires once
  // per mount — if `isStreaming` was never true (e.g. the user lands on
  // letter_ready directly, no stream context) the effect is a no-op.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (!wasStreamingRef.current) return;
    wasStreamingRef.current = false;
    try {
      window.sessionStorage.setItem(seenKey, "1");
    } catch {
      /* private mode — non-fatal */
    }
    const t = window.setTimeout(() => setOpen(false), 1400);
    return () => window.clearTimeout(t);
  }, [isStreaming, seenKey]);

  // Run the typewriter exactly once per mount when we have a body and
  // the user hasn't seen this letter before. Total duration scales with
  // word count so short letters don't drag.
  useEffect(() => {
    if (!body || startedRef.current || initiallySeen) return;
    // Don't synthesise a typewriter while real chunks are arriving —
    // the streaming branch above already drives revealedChars from the
    // live body length.
    if (isStreaming) return;
    startedRef.current = true;
    const totalChars = body.length;
    const words = body.split(/\s+/).filter(Boolean).length || 1;
    const durationMs = Math.min(
      12_000,
      Math.max(3_500, (words / WORDS_PER_SECOND) * 1000),
    );
    // Rewind to 0 once at the start of the typewriter pass. The
    // surrounding effect already gates on `startedRef` + `initiallySeen`
    // + `!isStreaming` so this fires at most once per appeal mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealedChars(0);
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const ratio = Math.min(1, elapsed / durationMs);
      // Ease-out cubic so the cursor races at first then settles —
      // feels less mechanical than linear progression.
      const eased = 1 - Math.pow(1 - ratio, 3);
      setRevealedChars(Math.floor(eased * totalChars));
      if (ratio < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setRevealedChars(totalChars);
        try {
          window.sessionStorage.setItem(seenKey, "1");
        } catch {
          /* private mode — non-fatal */
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // If we unmount mid-animation, snap to fully-visible so a remount
      // never inherits a half-painted body.
      setRevealedChars(totalChars);
    };
  }, [body, initiallySeen, seenKey, isStreaming]);

  // Empty-body fallback. Previously this returned `null`, which left the
  // customer with a "Submit £2.99" button and no letter visible above it —
  // the user-reported "there's no body in the appeal letters" symptom.
  // Now we surface a clear failure surface so the customer can re-draft
  // rather than pay for a blank submission.
  //
  // During a live stream the body can legitimately be empty for a moment
  // (between SSE open and the first chunk landing) — suppress the
  // failure surface in that case and let the streaming branch below
  // render its empty preview with the typing cursor.
  if ((!body || body.trim().length === 0) && !isStreaming) {
    return (
      <section className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4 flex items-start gap-3">
        <span className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <AlertTriangle className="size-5" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-amber-900 leading-tight">
            Letter didn&apos;t generate properly
          </p>
          <p className="text-[11.5px] text-amber-900/80 mt-1 leading-snug">
            The drafter returned an empty letter for this ticket — please
            re-draft before submitting. Hide this ticket from the list and
            scan it again, or contact support if it keeps happening.
          </p>
        </div>
      </section>
    );
  }
  // `body` is non-null on the failure-fallback path above; on the
  // streaming path it can briefly be null/empty between SSE open and
  // the first chunk arriving, hence the `?? ""` guard.
  const safeBody = body ?? "";
  const visible = safeBody.slice(0, revealedChars);
  // Cursor pulses both during the synthetic post-mount typewriter
  // (revealedChars < body.length) AND while live SSE chunks are still
  // arriving — the latter keeps a blinking cursor at the tail of the
  // last-arrived chunk so the surface reads as "still being written".
  const isAnimating = revealedChars < safeBody.length || isStreaming;

  return (
    <section className="rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-parkingrabbit-bg/40 transition"
      >
        <span className="size-8 rounded-lg bg-parkingrabbit-primary-50 text-parkingrabbit-primary flex items-center justify-center shrink-0">
          <FileText className="size-4" strokeWidth={2.25} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold text-parkingrabbit-navy leading-tight">
            {isStreaming ? "Writing your appeal letter…" : "Your draft appeal letter"}
          </span>
          <span className="block text-[11px] text-parkingrabbit-muted mt-0.5 leading-snug truncate">
            {subject ?? "Representation against PCN"}
            {!isStreaming && wordCount != null && (
              <>
                <span className="text-parkingrabbit-border mx-1.5">·</span>
                {wordCount} words
              </>
            )}
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-parkingrabbit-muted shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.25}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pt-1 pb-4 border-t border-parkingrabbit-border">
            {subject && (
              <p className="text-[12px] font-bold text-parkingrabbit-navy mt-3">
                Subject: <span className="font-semibold">{subject}</span>
              </p>
            )}
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-parkingrabbit-navy/90">
              {visible}
              {isAnimating && (
                <span
                  className="inline-block w-[1px] h-[1em] -mb-[2px] bg-parkingrabbit-primary align-middle ml-0.5 animate-pulse"
                  aria-hidden
                />
              )}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
