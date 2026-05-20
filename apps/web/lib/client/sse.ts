/**
 * Minimal Server-Sent-Event parser for fetch-based POST streams.
 *
 * Why this exists: `EventSource` is GET-only and can't send custom headers
 * or a JSON body, so any SSE endpoint we POST to (e.g. /api/generate-stream
 * with a base64 PCN photo) has to be consumed via `fetch(...).body`. This
 * helper does the line-buffering + event-frame parsing for us.
 *
 * Usage:
 *   await consumeSSE(response, (ev) => {
 *     if (ev.event === "chunk") { … }
 *   });
 *
 * Each SSE frame is a sequence of `event: …\n` and `data: …\n` lines
 * terminated by a blank line. `data:` can repeat for multi-line payloads.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export async function consumeSSE(
  response: Response,
  onEvent: (ev: SseEvent) => void | Promise<void>,
): Promise<void> {
  if (!response.body) {
    throw new Error("Response has no body — can't stream");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) {
      // Flush any trailing frame that didn't end with a blank line.
      const trailing = buffer.trim();
      if (trailing) await emit(trailing, onEvent);
      break;
    }

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      await emit(raw, onEvent);
    }
  }
}

async function emit(
  raw: string,
  onEvent: (ev: SseEvent) => void | Promise<void>,
): Promise<void> {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
    // ignore id:, retry:, comment lines (starting with `:`)
  }
  if (dataLines.length === 0) return;
  const dataStr = dataLines.join("\n");
  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    data = dataStr;
  }
  await onEvent({ event, data });
}
