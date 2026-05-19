/**
 * Minimal nanoid-style id generator — no external dep so it works in both
 * server (node) and client (web crypto) contexts.
 */
export function customAlphabet(alphabet: string, size: number, prefix = "") {
  return () => {
    const bytes = new Uint8Array(size);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback — fine for development; node 20+ has globalThis.crypto.
      for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = "";
    for (let i = 0; i < size; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return prefix + out;
  };
}
