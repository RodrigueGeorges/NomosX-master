/**
 * Translate messages/en.json into another locale's messages file.
 *
 * Usage:
 *   npx tsx scripts/translate-messages.ts de           # one locale
 *   npx tsx scripts/translate-messages.ts de es it     # several
 *   npx tsx scripts/translate-messages.ts --all        # every routing locale minus en
 *
 * Idempotent: keys already present in messages/<locale>.json are skipped, so
 * re-running only fills what's missing (e.g. after en.json gains new keys).
 *
 * Articles are NOT covered here — they translate lazily via
 * lib/agent/translation-service.ts on first request per locale. This script
 * only produces the UI chrome (nav, labels, editorial chrome, pages).
 */

import "./load-env.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { callLLM } from "../lib/llm/unified-llm";
import { LOCALE_NAMES } from "../i18n/locale-names";

const MESSAGES_DIR = join(__dirname, "..", "messages");
const BATCH_SIZE = 30; // leaf strings per LLM call — keeps JSON well under token limits

type Messages = Record<string, unknown>;

function flatten(obj: Messages, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Messages, key));
  }
  return out;
}

function unflatten(flat: Record<string, string>): Messages {
  const root: Messages = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = root;
    for (const p of parts.slice(0, -1)) {
      node = (node[p] ??= {}) as Messages;
    }
    node[parts[parts.length - 1]] = value;
  }
  return root;
}

/** Reorder `translated` keys to match `source` structure (stable diffs). */
function reorder(source: Messages, translated: Messages): Messages {
  const out: Messages = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "string") {
      out[k] = translated[k] ?? v;
    } else if (v && typeof v === "object") {
      out[k] = reorder(v as Messages, (translated[k] ?? {}) as Messages);
    }
  }
  return out;
}

async function translateBatch(
  entries: [string, string][],
  targetName: string,
): Promise<Record<string, string>> {
  const flat = Object.fromEntries(entries);
  const response = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a professional UI translator for NomosX, a European think-tank publication platform. Translate the JSON string VALUES from English to ${targetName}. Rules:
1. Return a JSON object with the SAME keys, translated values only.
2. NEVER translate keys, URLs, email addresses, or the brand name "NomosX".
3. PRESERVE every placeholder exactly: {name}, {count}, {date}, {domain}, {n} — same braces, same names.
4. PRESERVE HTML tags exactly (<span>, <em>…) — translate only the text between them.
5. Keep the register institutional and precise — this is think-tank editorial chrome, not marketing.
6. Keep mono/badge strings concise; uppercase styling is applied via CSS.
Return ONLY the JSON object.`,
      },
      { role: "user", content: JSON.stringify(flat, null, 0) },
    ],
    temperature: 0.2,
    jsonMode: true,
    maxTokens: 8000,
    task: "translation",
  });
  if (!response.content) throw new Error("Empty LLM response");
  const parsed = JSON.parse(response.content);
  return parsed as Record<string, string>;
}

async function translateLocale(locale: string): Promise<void> {
  const targetName = LOCALE_NAMES[locale];
  if (!targetName) {
    console.error(`[i18n] Unknown locale "${locale}" — add it to i18n/locale-names.ts first`);
    return;
  }

  const source = JSON.parse(readFileSync(join(MESSAGES_DIR, "en.json"), "utf8")) as Messages;
  const sourceFlat = flatten(source);

  const targetPath = join(MESSAGES_DIR, `${locale}.json`);
  const existing: Messages = existsSync(targetPath)
    ? JSON.parse(readFileSync(targetPath, "utf8"))
    : {};
  const existingFlat = flatten(existing);

  const missing = Object.entries(sourceFlat).filter(([k]) => !(k in existingFlat));
  if (missing.length === 0) {
    console.log(`[i18n] ${locale}: already complete (${Object.keys(sourceFlat).length} keys)`);
    return;
  }

  console.log(`[i18n] ${locale} → ${targetName}: ${missing.length}/${Object.keys(sourceFlat).length} keys to translate`);

  const translatedFlat: Record<string, string> = { ...existingFlat };
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const out = await translateBatch(batch, targetName);
    // Only accept string values for keys we asked for — never trust extra output.
    for (const [k] of batch) {
      if (typeof out[k] === "string" && out[k].length > 0) translatedFlat[k] = out[k];
      else translatedFlat[k] = sourceFlat[k]; // fallback: English beats a missing key
    }
    process.stdout.write(`  … ${Math.min(i + BATCH_SIZE, missing.length)}/${missing.length}\n`);
  }

  writeFileSync(targetPath, JSON.stringify(reorder(source, unflatten(translatedFlat)), null, 2) + "\n", "utf8");
  console.log(`[i18n] ${locale}: wrote ${targetPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const locales = args.includes("--all")
    ? Object.keys(LOCALE_NAMES).filter((l) => l !== "en")
    : args.filter((a) => !a.startsWith("--"));
  if (locales.length === 0) {
    console.log("Usage: npx tsx scripts/translate-messages.ts <locale…> | --all");
    process.exit(1);
  }
  for (const loc of locales) {
    try {
      await translateLocale(loc);
    } catch (err) {
      console.error(`[i18n] ${loc} failed:`, err);
    }
  }
}

main();
