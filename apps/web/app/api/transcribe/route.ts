/**
 * POST /api/transcribe — voice-note transcription.
 *
 * Speech-to-text isn't Claude's job — it's a reasoning model, not a
 * transcription engine. We forward the recorded audio Blob to a
 * Whisper-compatible HTTP endpoint (OpenAI by default; any OpenAI-API-
 * compatible provider works — LiteLLM, Groq's `whisper-large-v3`, etc.)
 * and pipe the returned text back into the dictation panel.
 *
 * Env:
 *   - OPENAI_API_KEY              → uses https://api.openai.com/v1/audio/transcriptions
 *   - TRANSCRIBE_API_KEY          → custom provider key (overrides OPENAI_API_KEY)
 *   - TRANSCRIBE_BASE_URL         → custom transcribe endpoint (overrides OpenAI URL)
 *   - TRANSCRIBE_MODEL            → model name (default `whisper-1`)
 *
 * Returns 503 with a clear message when no key is configured so dev
 * users get a useful "voice notes not configured" hint rather than a
 * silent 500. The dictation panel still works — the user just types.
 */
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const apiKey = process.env.TRANSCRIBE_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseUrl =
    process.env.TRANSCRIBE_BASE_URL ?? "https://api.openai.com/v1/audio/transcriptions";

  if (!apiKey) {
    return Response.json(
      jsonError(
        "TRANSCRIBE_NOT_CONFIGURED",
        "Voice notes need a Whisper-compatible transcription provider. Set OPENAI_API_KEY (cheapest path, ~$0.006/min) or TRANSCRIBE_API_KEY + TRANSCRIBE_BASE_URL for a custom endpoint.",
      ),
      { status: 503 },
    );
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json(jsonError("BAD_REQUEST", "audio file required"), { status: 400 });
  }
  if (audio.size === 0) {
    return Response.json(jsonError("BAD_REQUEST", "empty audio"), { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json(
      jsonError(
        "AUDIO_TOO_LARGE",
        `audio is ${(audio.size / 1024 / 1024).toFixed(1)} MB — max 8 MB. Try a shorter take or pause/resume between sentences.`,
      ),
      { status: 413 },
    );
  }

  // Whisper accepts any common container — webm/opus from Chromium,
  // mp4/aac from Safari, ogg, wav. Use the Blob's MIME-derived
  // extension where we can, fall back to .webm.
  const ext = filenameExtensionFor(audio.type);
  const upstream = new FormData();
  upstream.append("file", audio, `voice-note.${ext}`);
  upstream.append("model", process.env.TRANSCRIBE_MODEL ?? "whisper-1");
  upstream.append("language", "en");
  upstream.append("response_format", "json");

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: upstream,
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        jsonError(
          "TRANSCRIBE_FAILED",
          `Provider returned ${res.status}: ${text.slice(0, 400)}`,
        ),
        { status: 502 },
      );
    }
    const json = (await res.json()) as { text?: string };
    return Response.json({ text: (json.text ?? "").trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcribe failed";
    return Response.json(jsonError("TRANSCRIBE_FAILED", message), { status: 502 });
  }
}

/** Map a MIME type (possibly with codec hints) to a file extension. */
function filenameExtensionFor(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  const sub = base.split("/")[1] ?? "webm";
  if (sub === "mpeg") return "mp3";
  if (sub === "mp4") return "m4a";
  if (sub === "x-m4a") return "m4a";
  return sub || "webm";
}
