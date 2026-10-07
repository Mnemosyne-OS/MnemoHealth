/**
 * html — readable text out of a web page, with the browser's own parser.
 *
 * The WHO and NIMH pages are not well-formed (WHO puts an `<h2>` inside a
 * `<p>`, NIMH nests whole `<html><body>` fragments inside `<main>`). A regex
 * would cut them wrong; `DOMParser` repairs them the way the browser does, in
 * the cartridge and in jsdom alike.
 *
 * The text is never rewritten: headings become `## `, list items `- `, block
 * elements a line break. Scripts, styles, iframes and forms are dropped.
 */

const SKIP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'FORM', 'BUTTON', 'SVG', 'TEMPLATE', 'IMG', 'VIDEO', 'AUDIO']);
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'TABLE', 'TR', 'BLOCKQUOTE', 'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'BR', 'HR']);

/** Parses an HTML string into a document. */
export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Decodes entities and drops tags of a short HTML fragment (a title, an Orphanet definition with `<i>`). */
export function inlineText(html: string): string {
  return (parseHtml(`<body>${html}</body>`).body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The text of an element, with headings, list items and paragraphs kept as lines. */
export function elementText(root: Element): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) { out.push((node.textContent ?? '').replace(/\s+/g, ' ')); return; }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    const heading = /^H([1-6])$/.exec(tag);
    if (heading) {
      out.push(`\n\n${'#'.repeat(Math.max(2, Number(heading[1])))} `);
      el.childNodes.forEach(walk);
      out.push('\n\n');
      return;
    }
    if (tag === 'LI') { out.push('\n- '); el.childNodes.forEach(walk); out.push('\n'); return; }
    if (tag === 'TD' || tag === 'TH') { el.childNodes.forEach(walk); out.push(' | '); return; }
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    el.childNodes.forEach(walk);
    if (block) out.push('\n');
  };
  walk(root);
  return out.join('')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    // A list item emptied of its only link (a removed PDF link) is not text.
    .filter((line) => line !== '-')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(#+ )\n+/gm, '$1')
    .trim();
}
