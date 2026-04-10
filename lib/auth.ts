/**
 * Authentication utilities
 * Handles password hashing, JWT tokens, and session management
 */

import { SignJWT,jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const JWT_SECRET_RAW = process.env.JWT_SECRET;
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || "");

// Legacy (pre-bcrypt) password hashing used in early versions.
// We keep it for a smooth migration: if a user logs in with a legacy hash,
// we can rehash to bcrypt.
async function legacySha256(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = process.env.PASSWORD_SALT;
  if (!salt) {
    throw new Error("PASSWORD_SALT is not configured. Legacy password verification requires this env var.");
  }
  const data = encoder.encode(`${password}${salt}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SESSION_COOKIE_NAME = "nomosx-session";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

/**
 * Hash password (bcrypt)
 */
export async function hashPassword(password: string): Promise<string> {
  const rounds = 12;
  return bcrypt.hash(password, rounds);
}

/**
 * Verify password.
 *
 * Supports:
 * - bcrypt hashes (preferred)
 * - legacy SHA-256 hashes (migration path)
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hp = String(hashedPassword || "");

  // bcrypt hashes start with $2a$, $2b$, $2y$
  if (hp.startsWith("$2")) {
    try {
      return await bcrypt.compare(password, hp);
    } catch {
      return false;
    }
  }

  // legacy
  try {
    const legacy = await legacySha256(password);
    return legacy === hp;
  } catch {
    return false;
  }
}

/**
 * Create JWT token
 */
export async function createToken(user: SessionUser): Promise<string> {
  if (!JWT_SECRET_RAW || JWT_SECRET_RAW.trim().length < 16) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verify JWT token
 */
export async function verifyToken(token: string): Promise<SessionUser | null> {
  if (!JWT_SECRET_RAW || JWT_SECRET_RAW.trim().length < 16) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, JWT_SECRET);
    return verified.payload.user as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Create session cookie
 */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await createToken(user);
  const cookieStore = await cookies();
  
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000,
    path: "/",
  });
}

/**
 * Get current session user
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  return await verifyToken(token);
}

/**
 * Delete session
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Require authentication (use in Server Components)
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSession();
  
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

/**
 * Require admin role
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  
  if (user.role !== "admin") {
    throw new Error("Forbidden: Admin access required");
  }

  return user;
}
