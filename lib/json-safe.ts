/**
 * Postgres-safe JSON serialization for Prisma Json/Text columns.
 *
 * LLM output can contain literal NUL (\u0000) and other C0 control
 * characters. JSON.stringify escapes them (\u0000), but Postgres jsonb
 * rejects the escaped form too ("\u0000 ne peut pas être converti en
 * texte"), so a run that completed analytically dies at persistence —
 * observed live on the ai-relationships-china record (brief.create 22P05).
 *
 * toJsonSafe() performs the same JSON round-trip as the previous
 * JSON.parse(JSON.stringify(v)) idiom (Dates → ISO, undefined dropped,
 * circular refs still throw) and then strips Postgres-unsafe control
 * characters from every string: \x00-\x08, \x0B, \x0C, \x0E-\x1F.
 * Tab/LF/CR are preserved.
 */

// eslint-disable-next-line no-control-regex
const PG_UNSAFE_CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

function stripControls(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(PG_UNSAFE_CTRL, '');
  if (Array.isArray(value)) return value.map(stripControls);
  if (value !== null && typeof value === 'object') {
    // After JSON.parse(JSON.stringify(...)) only plain objects/arrays remain.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripControls(v);
    }
    return out;
  }
  return value;
}

export function stripPgUnsafeControls(str: string): string {
  return str.replace(PG_UNSAFE_CTRL, '');
}

// Returns `any` deliberately: this is a JSON boundary — the result is a
// plain JSON value, and callers assign it to Prisma Json columns whose
// InputJsonValue typing rejects app-level interfaces (same as the previous
// JSON.parse(JSON.stringify(v)) idiom it replaces).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJsonSafe(value: unknown): any {
  return stripControls(JSON.parse(JSON.stringify(value)));
}
