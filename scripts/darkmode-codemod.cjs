#!/usr/bin/env node
/**
 * darkmode-codemod — adds dark: counterparts for hardcoded black/white
 * Tailwind utilities inside className strings / cx() calls.
 *
 * Rules (per class string token):
 *   text-black/50          → + dark:text-white/50
 *   border-black/[0.08]    → + dark:border-white/[0.08]
 *   bg-black               → + dark:bg-white
 *   hover:text-black       → + dark:hover:text-black→white handled per-variant
 *   group-hover:bg-white/… → + dark:group-hover:bg-black/…
 * Skips tokens already carrying dark:, and no-ops on theme tokens
 * (text-text, bg-bg, etc.).
 *
 * Usage: node scripts/darkmode-codemod.cjs [--apply] [file ...]
 * Default: dry-run report over all candidate files.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const APPLY = process.argv.includes("--apply");
const explicit = process.argv.filter((a) => !a.startsWith("--") && a.endsWith(".tsx"));

// Utilities whose black↔white inversion is thematically meaningful
// (no outer parens — capture groups must stay: 1 variants · 2 prop · 3 color · 4 alpha)
const PROP = "text|bg|border|divide|ring|ring-offset|from|via|to|stroke|fill|shadow|outline|decoration|caret|accent|placeholder|border-l|border-r|border-t|border-b";

const TOKEN_RE = new RegExp(`^((?:[a-zA-Z-]+:)*?)(${PROP})-(black|white)(/[\\w.\\[\\]%]+)?$`);

function swapToken(tok) {
  const m = tok.match(TOKEN_RE);
  if (!m) return null;
  const [, variants, prop, color, alpha] = m;
  if (variants.includes("dark:")) return null;
  const inv = color === "black" ? "white" : "black";
  return `dark:${variants}${prop}-${inv}${alpha || ""}`;
}

/**
 * Idempotent per-string transform:
 * - skip a token if its exact dark: twin already exists in the string;
 * - skip if ANY dark: variant for the same variant-prefix+prop exists
 *   (a hand-written dark:bg-[#0a0a0f]/80 beats a generated dark:bg-black/80);
 * - then drop exact-duplicate tokens (heals a previous double-run).
 */
function processString(s) {
  // Only transform strings that look like class lists (contain a utility hint)
  if (!/(text|bg|border|shadow|divide|ring|stroke|fill|from|via|to)-/.test(s)) return null;
  const toks = s.split(/\s+/).filter(Boolean);

  // Keys already covered by an explicit dark: variant: "dark:<variants>:<prop>"
  const darkKeys = new Set();
  for (const tok of toks) {
    const m = tok.match(new RegExp(`^dark:((?:[a-zA-Z-]+:)*?)(${PROP})-`));
    if (m) darkKeys.add(`${m[1]}${m[2]}`);
  }

  const seen = new Set();
  const out = [];
  let changed = false;
  for (const tok of toks) {
    if (seen.has(tok)) { changed = true; continue; } // drop duplicate
    seen.add(tok);
    out.push(tok);
    const v = swapToken(tok);
    if (!v) continue;
    const m = tok.match(TOKEN_RE);
    const key = `${m[1]}${m[2]}`; // variants + prop of the light token
    if (seen.has(v) || darkKeys.has(key)) continue; // already covered
    seen.add(v);
    out.push(v);
    changed = true;
  }

  // Heal: a generated `dark:V:prop-<inverse>` loses to a hand-written
  // `dark:V:prop-*` sharing the same variants+prop (incl. arbitrary colors
  // like dark:bg-[#0a0a0f]). Residual conflicts keep the LAST occurrence —
  // hand-written variants sit after generated inserts.
  const DARK_RE = new RegExp(`^dark:((?:[a-zA-Z-]+:)*?)(${PROP})-(\\S+)$`);
  const drop = new Set();
  const byKey = new Map();
  out.forEach((t, i) => {
    const m = t.match(DARK_RE);
    if (!m) return;
    const k = m[1] + m[2];
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ i, k, color: m[3] });
  });
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    // A token is "generated" when its exact color-inverse base exists here.
    const gen = list.find((x) => {
      const cm = x.color.match(/^(black|white)(\/.*)?$/);
      if (!cm) return false;
      const inv = (cm[1] === "black" ? "white" : "black") + (cm[2] || "");
      return out.some((b) => {
        const bm = b.match(TOKEN_RE);
        return bm && bm[1] + bm[2] === x.k && bm[3] + (bm[4] || "") === inv;
      });
    });
    drop.add(gen ? gen.i : list[list.length - 2].i);
    changed = true;
  }
  const healed = drop.size ? out.filter((_, i) => !drop.has(i)) : out;

  return changed ? healed.join(" ") : null;
}

// Match quoted strings (single, double, backtick — no nested template eval needed
// since ${} chunks are tokenized like normal text and won't match the regex)
const STRING_RE = /(['"`])([^'"`]{0,2000})\1/g;

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  let count = 0;
  const next = src.replace(STRING_RE, (whole, quote, inner) => {
    const rep = processString(inner);
    if (rep === null) return whole;
    count++;
    return quote + rep + quote;
  });
  if (count && APPLY) fs.writeFileSync(file, next);
  return count;
}

// Collect target files: tsx under app/ and components/ containing black/white utils
let files = explicit;
if (!files.length) {
  const out = execSync(
    `git ls-files "*.tsx" | grep -E "^(app|components)/"`,
    { cwd: process.cwd(), encoding: "utf8" }
  ).trim().split(/\r?\n/);
  files = out.filter((f) => fs.existsSync(f));
}

let touched = 0, strings = 0;
for (const f of files) {
  try {
    const n = processFile(f);
    if (n) { touched++; strings += n; console.log(`${String(n).padStart(3)} strings — ${f}`); }
  } catch (e) { console.error(`ERR ${f}: ${e.message}`); }
}
console.log(`\n${APPLY ? "APPLIED" : "DRY-RUN"}: ${strings} class strings across ${touched} files`);
