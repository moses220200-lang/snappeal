/**
 * Email/password auth + JWT sessions.
 *
 *   - Password hashing: pbkdf2-sha256 with a random 16-byte salt. Stored as
 *     `<saltHex>:<hashHex>` in `users.password_hash`.
 *   - Session: stateless HS256 JWT signed with AUTH_SECRET. Carried in an
 *     httpOnly Secure cookie named `parkingrabbit.token` so XSS can't steal it.
 *   - Sign-out just clears the cookie — there's no server-side session
 *     state to revoke. Token TTL is 30 days.
 *
 * OAuth providers (Apple, Google) plug in later by issuing tokens with the
 * same shape and signature.
 */
import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";

const COOKIE_NAME = "parkingrabbit.token";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 minimum for sha256
const PBKDF2_KEYLEN = 32;
const SALT_LEN = 16;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
}

export interface JwtPayload extends SessionUser {
  iat: number;
  exp: number;
}

function getSecret(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need ≥32 chars). Set it in apps/web/.env.local.",
    );
  }
  return Buffer.from(secret, "utf8");
}

/* ─── Password hashing ─────────────────────────────────────────────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha256");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, "sha256");
  if (expected.length !== actual.length) return false;
  // Constant-time compare to defeat timing side-channels.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

/* ─── HS256 JWT (hand-rolled, no dep) ──────────────────────────────────── */

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function signJwt(user: SessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      ...user,
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    } satisfies JwtPayload),
  );
  const signingInput = `${header}.${payload}`;
  const sig = base64UrlEncode(createHmac("sha256", getSecret()).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const [header, payload, sig] = token.split(".");
    if (!header || !payload || !sig) return null;
    const signingInput = `${header}.${payload}`;
    const expectedSig = base64UrlEncode(createHmac("sha256", getSecret()).update(signingInput).digest());
    // Constant-time string compare.
    if (sig.length !== expectedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    if (diff !== 0) return null;
    const data = JSON.parse(base64UrlDecode(payload).toString("utf8")) as JwtPayload;
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/* ─── Cookie helpers (Next.js App Router) ─────────────────────────────── */

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyJwt(token);
  if (!payload) return null;
  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    role: payload.role,
  };
}

/* ─── DB user CRUD ─────────────────────────────────────────────────────── */

export interface CreateUserInput {
  email: string;
  password: string;
  displayName?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressPostcode?: string | null;
}

const newUserId = () => {
  const bytes = randomBytes(12);
  return `u_${bytes.toString("hex")}`;
};

export async function createUser(input: CreateUserInput): Promise<SessionUser> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");
  const normalisedEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedEmail)) {
    throw new Error("That doesn't look like a valid email");
  }
  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, normalisedEmail));
  if (existing[0]) throw new Error("An account with that email already exists");

  const id = newUserId();
  const hash = hashPassword(input.password);
  const [row] = await db
    .insert(schema.users)
    .values({
      id,
      email: normalisedEmail,
      passwordHash: hash,
      displayName: input.displayName ?? null,
      phone: input.phone ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      addressCity: input.addressCity ?? null,
      addressPostcode: input.addressPostcode ?? null,
    })
    .returning();
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as "user" | "admin",
  };
}

export async function authenticateUser(email: string, password: string): Promise<SessionUser | null> {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL not set");
  const normalisedEmail = email.trim().toLowerCase();
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, normalisedEmail));
  const row = rows[0];
  if (!row || !row.passwordHash) return null;
  if (!verifyPassword(password, row.passwordHash)) return null;
  await db.update(schema.users).set({ lastSignInAt: new Date() }).where(eq(schema.users.id, row.id));
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as "user" | "admin",
  };
}
