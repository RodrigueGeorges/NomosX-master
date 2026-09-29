/**
 * HTML sanitization for brief/report content rendered via dangerouslySetInnerHTML.
 *
 * Uses the browser's Sanitizer API where available (Chrome 105+),
 * otherwise falls back to a lightweight allowlist-based approach.
 *
 * This prevents XSS from LLM-generated HTML (scripts, iframes, event handlers).
 */

// Tags allowed in rendered briefs
const ALLOWED_TAGS = new Set([
  'h1','h2','h3','h4','h5','h6',
  'p','br','hr','blockquote','pre','code',
  'ul','ol','li','dl','dt','dd',
  'table','thead','tbody','tr','th','td','caption',
  'a','strong','em','b','i','u','s','sub','sup','mark','small','del','ins',
  'span','div','section','article','aside','header','footer','nav',
  'figure','figcaption','details','summary','time','abbr',
  'img',
]);

// Attributes allowed globally
const ALLOWED_ATTRS = new Set([
  'href','target','rel','title','aria-label','role',
  'class','id',
  'src','alt','width','height','loading',
  'colspan','rowspan','scope',
  'datetime',
]);

// Tags that must strip all attributes except explicit allowlist
const TAG_ATTR_ALLOWLIST: Record<string, Set<string>> = {
  a: new Set(['href','target','rel','title','aria-label','class']),
  img: new Set(['src','alt','width','height','loading','class']),
  td: new Set(['colspan','rowspan','class']),
  th: new Set(['colspan','rowspan','scope','class']),
  time: new Set(['datetime','class']),
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function isSafeUrl(value: string, attr: string): boolean {
  const trimmed = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
    return false;
  }

  if (attr === 'src' && lower.startsWith('data:')) {
    return lower.startsWith('data:image/');
  }

  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('/') ||
    lower.startsWith('#') ||
    !/^[a-z][a-z0-9+.-]*:/i.test(lower)
  );
}

/**
 * Server-side sanitizer used during SSR.
 *
 * It is deliberately conservative: remove dangerous elements, strip unknown
 * tags while preserving text, and rebuild allowed tag attributes from an
 * allowlist. This keeps public report rendering safe before client hydration.
 */
function sanitizeHtmlServer(html: string): string {
  let output = String(html || '')
    .replace(/^```html?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  output = output.replace(
    /<\s*(script|iframe|object|embed|applet|form|style|link|meta|base|input|textarea|select|button)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ''
  );
  output = output.replace(
    /<\s*(script|iframe|object|embed|applet|form|style|link|meta|base|input|textarea|select|button)\b[^>]*\/?\s*>/gi,
    ''
  );

  return output.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g, (match, rawTag: string, rawAttrs: string) => {
    const closing = /^<\s*\//.test(match);
    const tag = rawTag.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return `</${tag}>`;

    const allowedForTag = TAG_ATTR_ALLOWLIST[tag] || ALLOWED_ATTRS;
    const rebuiltAttrs: string[] = [];
    const attrRegex = /([:@a-zA-Z_][:\w.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(rawAttrs || ''))) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';

      if (attrName.startsWith('on') || attrName === 'style' || !allowedForTag.has(attrName)) continue;
      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attrValue, attrName)) continue;

      rebuiltAttrs.push(`${attrName}="${escapeHtml(attrValue)}"`);
    }

    if (tag === 'a') {
      const hasTargetBlank = rebuiltAttrs.some(a => /^target="_blank"$/i.test(a));
      const hasRel = rebuiltAttrs.some(a => /^rel=/i.test(a));
      if (hasTargetBlank && !hasRel) rebuiltAttrs.push('rel="noopener noreferrer"');
    }

    return `<${tag}${rebuiltAttrs.length ? ` ${rebuiltAttrs.join(' ')}` : ''}>`;
  });
}

/**
 * Sanitize HTML string via the deterministic allowlist sanitizer.
 * Removes <script>, <iframe>, <object>, <embed>, <form>, event handlers, javascript: URLs.
 *
 * IMPORTANT: a single implementation must run on BOTH server and client.
 * A previous version branched on `typeof window` (regex on server, DOMParser /
 * Sanitizer API on client) — the two serializers produced different output
 * (attribute order, style stripping), which caused React hydration mismatches
 * on every dangerouslySetInnerHTML fragment.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlServer(html);
}
