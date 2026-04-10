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
  'class','id','style',
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

/**
 * Sanitize HTML string by parsing and re-serializing with allowlist.
 * Removes <script>, <iframe>, <object>, <embed>, <form>, event handlers, javascript: URLs.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html; // SSR: skip (no DOM)

  // Try native Sanitizer API first (Chrome 105+, Firefox 128+)
  if ('Sanitizer' in window) {
    try {
      const sanitizer = new Sanitizer({
        allowElements: [...ALLOWED_TAGS],
        allowAttributes: Object.fromEntries(
          [...ALLOWED_TAGS].map(tag => [tag, [...(TAG_ATTR_ALLOWLIST[tag] || ALLOWED_ATTRS)]])
        ),
        dropElements: ['script','iframe','object','embed','applet','form','input','textarea','select','button','style','link','meta','base'],
      });
      const div = document.createElement('div');
      div.setHTML(html, { sanitizer });
      return div.innerHTML;
    } catch {
      // Fall through to manual approach
    }
  }

  // Manual fallback: parse → walk → re-serialize
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  // Remove dangerous elements entirely
  const dangerousSelectors = ['script','iframe','object','embed','applet','form','style','link','meta','base','input','textarea','select','button'];
  dangerousSelectors.forEach(sel => {
    body.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Walk all elements and filter tags + attributes
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Replace with its children
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
        return; // Don't recurse into removed element
      }

      // Filter attributes
      const allowedForTag = TAG_ATTR_ALLOWLIST[tag] || ALLOWED_ATTRS;
      const attrsToRemove: string[] = [];
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        const name = attr.name.toLowerCase();

        // Remove event handlers (on*) and javascript: URLs
        if (name.startsWith('on') || !allowedForTag.has(name)) {
          attrsToRemove.push(attr.name);
        }
        if (name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
          attrsToRemove.push(attr.name);
        }
        if (name === 'src' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
          attrsToRemove.push(attr.name);
        }
      }
      attrsToRemove.forEach(a => el.removeAttribute(a));

      // Add rel=noopener to links
      if (tag === 'a' && el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // Recurse (use a copy of childNodes since we may modify)
    const children = Array.from(node.childNodes);
    children.forEach(walk);
  };

  walk(body);
  return body.innerHTML;
}
