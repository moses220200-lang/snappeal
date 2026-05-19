/**
 * POST /api/transcribe — voice note transcription.
 *
 * The user records a short voice note in /app/notes; we POST the audio
 * blob here. The blob is forwarded to a Whisper-compatible transcription
 * endpoint (OpenAI Whisper API by default; OpenAI-compatible LiteLLM /
 * Together / Groq endpoints work the same way).
 *
 * Falls back to a clear error message when no provider key is configured,
 * so dev users get a useful "voice note coming soon" hint rather than a
 * silent 500.
 */
import { jsonError } from "@/lib/server/contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.TRANSCRIBE_API_KEY;
  const baseUrl =
    process.env.TRANSCRIBE_BASE_URL ?? "https://api.openai.com/v1/audio/transcriptions";

  if (!apiKey) {
    return Response.json(
      jsonError(
        "TRANSCRIBE_NOT_CONFIGURED",
        "Set OPENAI_API_KEY (or TRANSCRIBE_API_KEY + TRANSCRIBE_BASE_URL) to enable voice notes.",
      ),
      { status: 503 },
    );
  }

  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json(jsonError("BAD_REQUEST", "audio file required"), { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "voice-note.webm");
  upstream.append("model", process.env.TRANSCRIBE_MODEL ?? "whisper-1");
  upstream.append("language", "en");

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: upstream,
  });
  if (!res.ok) {
    const text = await res.text();
    return Response.json(jsonError("TRANSCRIBE_FAILED", `${res.status}: ${text.slice(0, 200)}`), {
      status: 502,
    });
  }
  const json = (await res.json()) as { text?: string };
  return Response.json({ text: json.text ?? "" });
}
