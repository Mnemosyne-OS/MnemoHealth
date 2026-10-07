/**
 * WHO fact sheets — one fact sheet per entry, in English, French or Spanish.
 *
 * Measured 2026-10-04 on www.who.int (CORS `*`, read directly):
 *  - `/news-room/fact-sheets` lists 244 sheets in English; `/fr/…` and `/es/…`
 *    list 240 each, under the SAME slug (`detail/depression` in all three).
 *  - A sheet holds its title in `.sf-item-header-wrapper h1`, its date in the
 *    `.timestamp` right under it ("11 September 2026", "11 septembre 2026",
 *    "11 de septiembre de 2026": kept verbatim, never converted), and its text
 *    in `article.sf-detail-body-wrapper` (malformed: `<h2>` inside `<p>`).
 *
 * Licence: the sheet names none (its footer reads "© 2026"). The WHO copyright
 * page (the footer's "Permissions and licensing" link) names SEVERAL licences
 * depending on the content, and none of them for the fact sheets. Quoting one
 * of its sentences would pick a licence for the reader (review of 2026-10-04),
 * so the memory says exactly that: not stated by the page, several licences in
 * the policy, and the link. Never a guessed licence.
 */
import { elementText, parseHtml } from '../lib/html';
import type { Entry, ListResult, ReadResult, ReaderDeps, SourceDef, SourceLang } from './types';

export const WHO_BASE = 'https://www.who.int';
export const WHO_POLICY_URL = 'https://www.who.int/about/policies/publishing/copyright';
/** The licence line of every WHO memory: what the page says (nothing), what the policy says (several), where to read it. */
export const WHO_LICENCE = `Licence of the fact sheets not stated by the page. The WHO copyright policy names several licences, depending on the content, without saying which one covers the fact sheets: ${WHO_POLICY_URL}`;
export const WHO_ATTRIBUTION = 'World Health Organization (WHO), fact sheet';

/** The listing URL of a language. */
export function whoIndexUrl(lang: SourceLang): string {
  return `${WHO_BASE}${lang === 'en' ? '' : `/${lang}`}/news-room/fact-sheets`;
}

/** The URL of one sheet in one language. */
export function whoSheetUrl(slug: string, lang: SourceLang): string {
  return `${whoIndexUrl(lang)}/detail/${slug}`;
}

/** The sheets of a listing page, sorted by title in that language, each once. */
export function parseWhoIndex(html: string): ListResult {
  const doc = parseHtml(html);
  const seen = new Set<string>();
  const entries: Entry[] = [];
  doc.querySelectorAll('a[href*="/news-room/fact-sheets/detail/"]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    // Slugs carry parentheses and capitals (`coronavirus-disease-(covid-19)`, `…-CBHI`).
    const m = /\/news-room\/fact-sheets\/detail\/([^/?#\s]+)\/?$/.exec(href);
    const title = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!m || !title || seen.has(m[1]!)) return;
    seen.add(m[1]!);
    entries.push({ id: m[1]!, title });
  });
  if (entries.length === 0) throw new Error('WHO_NO_FACT_SHEETS');
  return { entries, total: entries.length };
}

/** One sheet into a document. */
export function parseWhoSheet(html: string, entry: Entry, lang: SourceLang): ReadResult {
  const doc = parseHtml(html);
  const body = doc.querySelector('article.sf-detail-body-wrapper');
  if (!body) return { kind: 'skip', reason: 'NO_TEXT' };
  const header = doc.querySelector('.sf-item-header-wrapper');
  const title = (header?.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim() || entry.title;
  const stamp = (header?.querySelector('.timestamp')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // A template placeholder ("#: FormatedDate #") is not a date.
  const date = stamp && !stamp.includes('#') ? stamp : null;
  const text = elementText(body);
  if (text.length < 40) return { kind: 'skip', reason: 'NO_TEXT' };
  return {
    kind: 'doc',
    doc: {
      source: 'who', id: entry.id, lang, title, ref: `WHO fact sheet “${entry.id}”`,
      text, date, dateKind: 'published', licence: WHO_LICENCE,
      url: whoSheetUrl(entry.id, lang), attribution: WHO_ATTRIBUTION,
    },
  };
}

/** The WHO fact sheets source (catalogue, en/fr/es, read directly). */
export const WHO: SourceDef = {
  id: 'who',
  domain: 'who',
  langs: ['en', 'fr', 'es'],
  mode: 'catalogue',
  name: 'WHO',
  licence: WHO_LICENCE,
  licenceUrl: WHO_POLICY_URL,
  pauseMs: 300,
  async list(deps: ReaderDeps, lang, _query, signal) {
    const res = parseWhoIndex(await deps.fetchText(whoIndexUrl(lang), signal));
    res.entries.sort((a, b) => a.title.localeCompare(b.title, lang));
    return res;
  },
  async read(deps: ReaderDeps, entry, lang, signal) {
    try {
      return parseWhoSheet(await deps.fetchText(whoSheetUrl(entry.id, lang), signal), entry, lang);
    } catch (err) {
      if (err instanceof Error && err.message === 'HTTP_404') return { kind: 'skip', reason: 'NOT_FOUND' };
      throw err;
    }
  },
};
