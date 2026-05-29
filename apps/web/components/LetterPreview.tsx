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
import { AlertTriangle, Check, ChevronDown, FileText } from "lucide-react";

const WORDS_PER_SECOND = 32; // ~300 word letter = ~9s of animation

/** Target duration for the boilerplate preamble pass (ms).
 *
 *  2026-05-28 — halved from 50 s to 25 s. The original 50 s figure was
 *  picked to outlast Claude's draft window, but in practice that's
 *  exactly the problem: the customer was waiting almost a full minute
 *  before the "stay in the loop" panel surfaced underneath. 25 s still
 *  comfortably hides the typical ~15 s body-generation window for the
 *  vast majority of takes, but in the long-tail case the panel just
 *  appears sooner — and that's the whole point of the panel (give the
 *  customer something to do during the wait, rather than padding the
 *  wait itself). */
const PREAMBLE_DURATION_MS = 25_000;
/** Post-preamble typing pace, in chars per ms, applied to the AI body once the
 *  preamble has fully revealed. ~67 chars/sec ≈ 12 words/sec — fast enough to
 *  drain a 1.5 k-char letter in ~20 s without flashing it in. */
const POST_CHARS_PER_MS = 1 / 15;
/** Regex that locates the first "Ground N — …" heading in the AI body. We
 *  strip everything before this marker from the streamed display so the AI's
 *  own salutation + opening paragraph doesn't duplicate the client-side
 *  preamble. The original `body` is kept untouched for the canonical letter
 *  view that re-opens after streaming completes. */
const GROUND_MARKER_RE = /(?:^|\n)\s*Ground\s+\d/;

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
  /** Client-side boilerplate paragraph composed from already-collected
   *  ticket data (PCN ref, vehicle reg, contravention code, location,
   *  issued date, amount). Only honoured while `isStreaming` is true —
   *  the typewriter types this preamble first (paced for ~50 s) and then
   *  chains into the AI body once chunks arrive, so the user sees motion
   *  immediately instead of a blinking cursor over an empty pane during
   *  Claude's generation window. Ignored once the AI body is settled
   *  (the canonical letter then renders on its own). */
  preamble?: string | null;
  /** Fires `true` once the preamble has fully typed out AND the AI body
   *  hasn't started arriving yet — the typewriter then shows a brief
   *  "…" thinking indicator, collapses the disclosure, and hands the
   *  surface below over to a "stay in the loop" panel so the user has
   *  something to do during the remainder of Claude's draft window.
   *  Fires `false` when AI chunks land (the disclosure re-opens and the
   *  typewriter chains into the body) or when the stream ends without
   *  ever entering this waiting state. */
  onWaitForBody?: (waiting: boolean) => void;
  /** Visual tone of the disclosure card.
   *    "default"   — neutral white card with blue file glyph. Used
   *                  during drafting + letter-ready states where the
   *                  letter is the artefact about to be acted on.
   *    "submitted" — green card with a check glyph. Used once the
   *                  appeal has been filed and the same letter is
   *                  now read-only confirmation of what went out. */
  tone?: "default" | "submitted";
}

export function LetterPreview({
  appealId,
  subject,
  body,
  wordCount,
  defaultOpen = true,
  isStreaming = false,
  preamble = null,
  onWaitForBody,
  tone = "default",
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

  const safeBody = body ?? "";
  const usePreambleTypewriter = !!preamble && isStreaming;

  // What the typewriter actually paints. Three cases:
  //   1. No preamble — the visible text is just the body (existing behaviour
  //      for letter_ready / submitted previews and pre-v0.3.x streaming).
  //   2. Preamble + streaming — type the boilerplate first, then chain into
  //      the AI body sliced from the first "Ground N — …" heading. The AI's
  //      own salutation + opening paragraph is hidden during streaming so it
  //      doesn't duplicate what the preamble already said.
  //   3. Preamble committed at mount but the SSE has settled (rare — we
  //      stayed mounted past the stream): keep showing preamble + AI tail so
  //      the visible text doesn't suddenly flip to the canonical body mid-
  //      mount (which would rewrite the already-typed preamble paragraph
  //      into "Dear …" — reads as a flicker).
  const displayText = useMemo(() => {
    if (!preamble) return safeBody;
    const m = safeBody.match(GROUND_MARKER_RE);
    if (m && m.index != null) {
      const aiTail = safeBody.slice(m.index).replace(/^\n+/, "");
      return aiTail ? `${preamble}\n\n${aiTail}` : preamble;
    }
    // No Ground marker yet. If chunks are still flowing, withhold the AI
    // body so the duplicate opening doesn't peek through. If streaming
    // ended without ever emitting a Ground heading (rare malformed AI
    // output), fall back to showing the body as-is so the user isn't
    // stranded on a preamble-only view.
    if (!isStreaming && safeBody.length > 0) {
      return `${preamble}\n\n${safeBody}`;
    }
    return preamble;
  }, [isStreaming, preamble, safeBody]);

  // Refs let the rAF tick read latest values without re-running (which
  // would cancel-and-restart the animation on every chunk). The tick reads
  // `displayTextRef` so newly-arrived chunks expand the buffer the
  // typewriter is draining, and `isStreamingRef` so the loop keeps ticking
  // past the SSE-end edge until it has actually painted the final char.
  const displayTextRef = useRef(displayText);
  useEffect(() => {
    displayTextRef.current = displayText;
  }, [displayText]);
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);
  // The parent recomputes `preamble` from ticket fields each render and
  // hands us a fresh string instance every time. Threading the prop
  // directly into the rAF effect's deps would cancel-and-restart the
  // animation on every parent re-render. Stash the length in a ref so
  // the rAF reads it once at start and stays put.
  const preambleLenRef = useRef(preamble?.length ?? 0);
  useEffect(() => {
    preambleLenRef.current = preamble?.length ?? 0;
  }, [preamble]);

  // ─── "Stay in the loop" handoff state machine ───
  //
  // When the preamble has fully revealed AND no AI body has arrived yet
  // AND we're still streaming, the typewriter has caught its breath. We
  // use the remaining wait to:
  //
  //   1. Show a brief "…" thinking indicator at the cursor for ~1.5 s
  //      (so the user sees the typewriter pausing intentionally, not
  //      stalled).
  //   2. Collapse the disclosure box.
  //   3. Signal the parent via `onWaitForBody(true)` so it can render
  //      the "Turn on notifications / Email me" panel underneath.
  //
  // When the AI body chunks DO start arriving (the Ground heading
  // appears in safeBody, so displayText extends past the preamble), we
  // reverse all three: re-open the box, fire `onWaitForBody(false)`,
  // and the rAF tick chains into the body.
  type Phase = "typing" | "thinking" | "waiting";
  const [phase, setPhase] = useState<Phase>("typing");
  const onWaitForBodyRef = useRef(onWaitForBody);
  useEffect(() => {
    onWaitForBodyRef.current = onWaitForBody;
  }, [onWaitForBody]);

  // Derived: the preamble has fully revealed, the buffer hasn't been
  // extended past it yet (no Ground heading seen), and we're still
  // streaming. This is the trigger condition for the thinking handoff.
  const preambleSettledNoBody =
    !!preamble &&
    isStreaming &&
    revealedChars >= preamble.length &&
    displayText.length === preamble.length;

  // Effect 1 — phase router. Just flips the phase state based on the
  // current condition. No timer here; if we co-located the timer with
  // the phase flip, calling `setPhase("thinking")` would re-run this
  // effect with phase=thinking, and React would call THIS run's
  // cleanup (which contained the `clearTimeout`) BEFORE the next run
  // — killing the very timer we just scheduled. (Classic
  // self-cancellation bug — user-visible symptom was the dots
  // pulsing forever and the box never collapsing.)
  useEffect(() => {
    if (preambleSettledNoBody) {
      if (phase === "typing") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase("thinking");
      }
      return;
    }
    // Body arrived OR stream ended — exit any thinking/waiting state,
    // re-open the box so the typewriter's continuation is visible,
    // and let the parent retire the panel.
    if (phase !== "typing") {
      setPhase("typing");
      setOpen(true);
      onWaitForBodyRef.current?.(false);
    }
  }, [preambleSettledNoBody, phase]);

  // Effect 2 — thinking-phase timer. Owned by `phase` alone, so the
  // cleanup only runs when phase transitions OUT of "thinking" (at
  // which point we WANT the timer cleared anyway). When the 1.5 s
  // elapses we commit the collapse + the wait-handoff: flip to
  // "waiting", close the disclosure, fire `onWaitForBody(true)`.
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = window.setTimeout(() => {
      setPhase("waiting");
      setOpen(false);
      onWaitForBodyRef.current?.(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Live-stream branch (no preamble) — body is growing on every parent
  // re-render from SSE chunks. Skip the fake typewriter (it would double-
  // animate on top of the genuine stream), keep revealedChars locked to
  // the live length so the visible text tracks the real stream, and pin
  // the disclosure open so the user sees the letter being written. When a
  // preamble is provided we yield to the preamble-driven rAF below.
  useEffect(() => {
    if (!isStreaming || usePreambleTypewriter) return;
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
  }, [isStreaming, body?.length, usePreambleTypewriter]);

  // Preamble-driven typewriter — runs exactly once per mount, the first
  // time both streaming + a preamble are present. Latches on via an
  // animationStarted state so the rAF effect's deps don't include
  // isStreaming (whose true → false edge would otherwise cancel the rAF
  // mid-type at the SSE-end). The rAF self-terminates once preamble is
  // fully revealed AND the SSE has closed AND the buffer is drained.
  const [animationStarted, setAnimationStarted] = useState(false);
  useEffect(() => {
    if (!usePreambleTypewriter || animationStarted) return;
    // Latching internal state in response to a prop-edge (streaming +
    // preamble both becoming present). The rule's anti-pattern target is
    // derived-state-as-effect; this is a one-shot trigger.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnimationStarted(true);
  }, [usePreambleTypewriter, animationStarted]);

  useEffect(() => {
    if (!animationStarted) return;
    startedRef.current = true; // suppress the post-mount typewriter below
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    setRevealedChars(0);
    const preLen = preambleLenRef.current;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const buffer = displayTextRef.current;
      let target: number;
      if (elapsed < PREAMBLE_DURATION_MS) {
        // Phase 1 — linear advance through the preamble across ~50 s.
        // An eased curve front-loads most chars into the first ~15 s and
        // then crawls for 35 s, which over a 50-s window reads as "the
        // letter raced ahead and froze"; a steady pace is closer to the
        // "AI is typing this" mental model we're selling.
        const ratio = elapsed / PREAMBLE_DURATION_MS;
        target = Math.floor(ratio * preLen);
      } else {
        // Phase 2 — fixed chars-per-ms through the AI body. The preamble
        // length is added so target keeps growing monotonically across
        // the phase boundary.
        target =
          preLen +
          Math.floor((elapsed - PREAMBLE_DURATION_MS) * POST_CHARS_PER_MS);
      }
      target = Math.min(target, buffer.length);
      setRevealedChars(target);
      const stillInPreamble = elapsed < PREAMBLE_DURATION_MS;
      const streamingActive = isStreamingRef.current;
      const bufferDrained = target >= buffer.length;
      if (stillInPreamble || streamingActive || !bufferDrained) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Only animationStarted as a dep — keeps the rAF tied to a single
    // mount-edge so it can outlive isStreaming → false. The tick reads
    // newer values via displayTextRef / isStreamingRef, and preamble
    // length comes from preambleLenRef which we capture at start.
  }, [animationStarted]);

  // Auto-collapse on the streaming → settled edge. The user just watched
  // the letter type itself out; we hold the completed letter visible for
  // ~1.4 s so they register the final state, then animate the disclosure
  // shut so the blue submit CTA below comes into view. This fires once
  // per mount — if `isStreaming` was never true (e.g. the user lands on
  // letter_ready directly, no stream context) the effect is a no-op. We
  // also wait until the typewriter has actually painted the full buffer
  // before scheduling the collapse — the preamble path runs at a
  // deliberately slow pace and may still be typing for tens of seconds
  // after the SSE itself closes.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (!wasStreamingRef.current) return;
    if (revealedChars < displayText.length) return;
    wasStreamingRef.current = false;
    try {
      window.sessionStorage.setItem(seenKey, "1");
    } catch {
      /* private mode — non-fatal */
    }
    const t = window.setTimeout(() => setOpen(false), 1400);
    return () => window.clearTimeout(t);
  }, [isStreaming, seenKey, revealedChars, displayText.length]);

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
  // the first chunk arriving, hence the `?? ""` guard handled in the
  // safeBody / displayText derivations above.
  const visible = displayText.slice(0, revealedChars);
  // Cursor pulses both during the synthetic post-mount typewriter
  // (revealedChars < displayText.length) AND while live SSE chunks are
  // still arriving — the latter keeps a blinking cursor at the tail of
  // the last-arrived chunk so the surface reads as "still being written".
  const isAnimating = revealedChars < displayText.length || isStreaming;

  // 2026-05-28 — `tone="submitted"` swaps the neutral white card for
  // a green-themed one with a check glyph. The full letter body is
  // unchanged; only the disclosure header restyles. This is how the
  // submitted-state surface collapses what used to be two separate
  // cards (the green "Filed with the council" success box + the
  // neutral white letter preview) into a single green preview card.
  const isSubmittedTone = tone === "submitted";
  const sectionClasses = isSubmittedTone
    ? "rounded-2xl bg-green-50 border border-green-200 overflow-hidden"
    : "rounded-2xl bg-white border border-parkingrabbit-border overflow-hidden";
  const buttonHoverClasses = isSubmittedTone
    ? "hover:bg-green-100/40"
    : "hover:bg-parkingrabbit-bg/40";
  const iconWrapperClasses = isSubmittedTone
    ? "size-8 rounded-lg bg-green-600 text-white flex items-center justify-center shrink-0"
    : "size-8 rounded-lg bg-parkingrabbit-primary-50 text-parkingrabbit-primary flex items-center justify-center shrink-0";
  const titleClasses = isSubmittedTone
    ? "block text-[13px] font-bold text-green-900 leading-tight"
    : "block text-[13px] font-bold text-parkingrabbit-navy leading-tight";
  const subtitleClasses = isSubmittedTone
    ? "block text-[11px] text-green-800/80 mt-0.5 leading-snug truncate"
    : "block text-[11px] text-parkingrabbit-muted mt-0.5 leading-snug truncate";
  const chevronColorClass = isSubmittedTone
    ? "text-green-700"
    : "text-parkingrabbit-muted";

  return (
    <section className={sectionClasses}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition ${buttonHoverClasses}`}
      >
        <span className={iconWrapperClasses}>
          {isSubmittedTone ? (
            <Check className="size-4" strokeWidth={3} />
          ) : (
            <FileText className="size-4" strokeWidth={2.25} />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className={titleClasses}>
            {isStreaming ? "Writing your appeal letter…" : "Your draft appeal letter"}
          </span>
          <span className={subtitleClasses}>
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
          className={`size-4 shrink-0 transition-transform ${chevronColorClass} ${
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
              {phase === "thinking" ? (
                /* Preamble done, AI body still cooking. Three dots
                 *  pulse in sequence so the tail reads as "thinking"
                 *  rather than a stalled cursor. The disclosure
                 *  collapses ~1.5 s after these appear (see phase
                 *  effect above). */
                <span
                  className="inline-flex items-center gap-[3px] align-middle ml-1"
                  aria-label="Drafting the rest of the appeal"
                >
                  <span
                    className="size-1.5 rounded-full bg-parkingrabbit-primary animate-bounce"
                    style={{ animationDelay: "0ms", animationDuration: "1s" }}
                  />
                  <span
                    className="size-1.5 rounded-full bg-parkingrabbit-primary animate-bounce"
                    style={{ animationDelay: "150ms", animationDuration: "1s" }}
                  />
                  <span
                    className="size-1.5 rounded-full bg-parkingrabbit-primary animate-bounce"
                    style={{ animationDelay: "300ms", animationDuration: "1s" }}
                  />
                </span>
              ) : (
                isAnimating && (
                  <span
                    className="inline-block w-[1px] h-[1em] -mb-[2px] bg-parkingrabbit-primary align-middle ml-0.5 animate-pulse"
                    aria-hidden
                  />
                )
              )}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
