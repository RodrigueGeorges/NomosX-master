/**
 * @deprecated Use lib/auth.ts directly — this stub returns null for all methods.
 * Actual auth logic: hashPassword, verifyPassword, createSession, getSession, requireAuth, requireAdmin.
 * This file will be removed in a future refactor.
 */

import { prisma } from '../db';

export interface AuthService {
  signIn(email: string, password: string): Promise<{ user: any | null; token: string }>;
  signUp(email: string, password: string, name: string): Promise<{ user: any | null; token: string }>;
  signOut(token: string): Promise<void>;
  refreshToken(token: string): Promise<string | null>;
}

/** @deprecated Do not use — all methods return null. Use lib/auth.ts instead. */
export class AuthServiceImpl implements AuthService {
  async signIn(email: string, password: string) {
    return { user: null, token: '' };
  }

  async signUp(email: string, password: string, name: string) {
    return { user: null, token: '' };
  }

  async signOut(token: string) {
    return;
  }

  async refreshToken(token: string) {
    return null;
  }
}

export const authService = new AuthServiceImpl();