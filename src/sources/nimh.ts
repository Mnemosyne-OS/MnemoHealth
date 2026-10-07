/**
 * NIMH — mental health topics of the U.S. National Institute of Mental
 * Health, one topic page per entry.
 *
 * Measured 2026-10-04: www.nimh.nih.gov sends NO CORS header, so both the
 * index and the topic pages are read by the host (`social.fetch`). The index
 * `/health/topics` lists its topics inside `<main id="main-content">`; a topic
 * page holds its text in the same `<main>`, with nested `<html><body>`
 * fragments that `DOMParser` repairs, and closes on
 * `<strong>Last Reviewed: </strong>December 2024`.
 *
 * A topic page is either a HUB (Depression, Schizophrenia…: a "What is X?"
 * intro then link sections) or an article (Psychotherapies). For a hub, the
 * intro is kept and the real text is read from its publication under the
 * same slug, when NIMH has one (see `nimhPublicationUrl`). For an article,
 * the page is the text.
 *
 * Kept: links `/health/topics/<slug>` (one or two segments). Left out: the
 * Spanish pages (`/health/topics/espanol…`), which are a separate site not
 * wired here, and the links outside `/health/topics/` (find-help, trials).
 *
 * The date is "Last Reviewed" as printed (a month and a year). A page without
 * it has NO date: absent, never the day of the download.
 */
import { elementText, parseHtml } from '../lib/html';
import type { Entry, ListResult, ReadResult, ReaderDeps, SourceDef } from './types';

export const NIMH_BASE = 'https://www.nimh.nih.gov';
export const NIMH_INDEX = `${NIMH_BASE}/health/topics`;
/** Pause between two host reads of nimh.nih.gov. */
export const NIMH_PAUSE_MS = 500;

/** Licence as recopied in doc 135 §3bis.2 from the NIMH policies page. */
export const NIMH_LICENCE = 'The information on our website and in our materials is in the public domain and may be reused or copied without permission';
export const NIMH_LICENCE_URL = 'https://www.nimh.nih.gov/site-info/policies';
export const NIMH_ATTRIBUTION = 'National Institute of Mental Health (NIMH), U.S. National Institutes of Health';

const TOPIC_PATH = /^\/health\/topics\/([a-z0-9-]+(?:\/[a-z0-9-]+)?)\/?$/;

/** The topics of the index page, in page order, each once. */
export function parseNimhIndex(html: string): ListResult {
  const doc = parseHtml(html);
  const main = doc.querySelector('main') ?? doc.body;
  const seen = new Set<string>();
  const entries: Entry[] = [];
  main.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    const m = TOPIC_PATH.exec(href);
    if (!m) return;
    const slug = m[1]!;
    if (slug === 'espanol' || slug.startsWith('espanol/')) return;
    const title = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!title || seen.has(slug)) return;
    seen.add(slug);
    entries.push({ id: slug, title });
  });
  if (entries.length === 0) throw new Error('NIMH_NO_TOPICS');
  return { entries, total: entries.length };
}

/** The "Last Reviewed" date as printed, or null when the page has none. */
export function nimhReviewed(doc: Document): string | null {
  for (const strong of Array.from(doc.querySelectorAll('strong'))) {
    if (/^\s*Last Reviewed:?\s*$/i.test(strong.textContent ?? '')) {
      const rest = (strong.parentElement?.textContent ?? '').replace(/^\s*Last Reviewed:?\s*/i, '').trim();
      return rest || null;
    }
  }
  return null;
}

/** True for a topic page that is a HUB (a "What is X?" intro followed by link sections). */
export function isNimhHub(html: string): boolean {
  return /<h2\b[^>]*\bid="hts-intro"/.test(html);
}

/** What a hub page holds that is worth keeping: its title, its date, its "What is X?" section and the link to its publications. */
export interface NimhHub {
  title: string;
  date: string | null;
  /** The intro heading as printed ("What is depression?"). */
  heading: string;
  definition: string;
}

/**
 * Reads a hub page. 🪤 Measured 2026-10-04 on Depression: of ~4 500 characters
 * of `<main>`, the definition is ONE paragraph and the rest is link sections
 * repeated on every hub ("Where can I learn more", "Explore clinical trials",
 * "Share outreach materials", "Find help and support", "Additional federal
 * resources"). Only the intro is kept, cut out of the raw HTML between its
 * `<h2 id="hts-intro">` and the next `<h2`.
 */
export function parseNimhHub(html: string, entry: Entry): NimhHub | null {
  const m = /<h2\b[^>]*\bid="hts-intro"[^>]*>([\s\S]*?)<\/h2>/.exec(html);
  if (!m) return null;
  const after = html.slice(m.index + m[0].length);
  const next = after.search(/<h2\b/);
  const fragment = parseHtml(`<body>${next >= 0 ? after.slice(0, next) : after}</body>`).body;
  const doc = parseHtml(html);
  const title = (doc.querySelector('main h1')?.textContent ?? '').replace(/\s+/g, ' ').trim() || entry.title;
  const heading = (parseHtml(`<body>${m[1]}</body>`).body.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { title, date: nimhReviewed(doc), heading, definition: elementText(fragment) };
}

/**
 * The publication of a hub topic, when there is one: `/health/publications/`
 * under the SAME slug as the topic. Measured on the 25 topics on 2026-10-04:
 * 6 answer 200 (bipolar-disorder, borderline-personality-disorder, depression,
 * eating-disorders, post-traumatic-stress-disorder-ptsd, schizophrenia), the
 * other 19 answer 404.
 *
 * 🪤 The first version took the first English link of the hub's `-listing`
 * page. A listing can gather every category, or several sub-publications, and
 * one hub links another topic's brochure first: that rule guessed, and could
 * file the wrong brochure under the wrong topic. A listing page is never read
 * to choose a publication.
 */
export function nimhPublicationUrl(slug: string): string {
  return `${NIMH_BASE}/health/publications/${slug}`;
}

/** A publication's text and what it says of itself. */
export interface NimhPublication {
  title: string;
  text: string;
  /** "NIH Publication No. 24-MH-8079", as printed, or null. */
  number: string | null;
  /** "Revised 2024", as printed, or null. */
  revised: string | null;
}

/**
 * Reads a publication page: its `<main>` without the title, the "Download
 * PDF" and "En español" links, and the closing "For more information" and
 * "Reprints" sections (links, and the reuse notice already in the source line).
 */
export function parseNimhPublication(html: string): NimhPublication | null {
  const doc = parseHtml(html);
  const main = doc.querySelector('main');
  if (!main) return null;
  const raw = main.textContent ?? '';
  // textContent glues the <br>-separated lines ("…8079Revised 2024"): the number has a fixed shape.
  const number = /NIH Publication No\.\s*\d{2}-[A-Z]{2,4}-\d+/.exec(raw)?.[0] ?? null;
  const revised = /Revised \d{4}/.exec(raw)?.[0] ?? null;
  const h1 = main.querySelector('h1');
  const title = (h1?.textContent ?? '').replace(/\s+/g, ' ').trim();
  h1?.remove();
  main.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (/\.pdf(\?|$)/i.test(href) || href.includes('/espanol')) a.remove();
  });
  let text = elementText(main);
  const tail = text.search(/^#+ (For more information|Reprints)\b/m);
  if (tail >= 0) text = text.slice(0, tail).trim();
  if (text.length < 200) return null;
  return { title, text, number, revised };
}

/** The document of a hub topic: its definition, then its main publication when there is one, and says which. */
export function nimhHubDoc(entry: Entry, hub: NimhHub, pub: { url: string; data: NimhPublication } | null): ReadResult {
  if (!hub.definition && !pub) return { kind: 'skip', reason: 'NO_TEXT' };
  const parts = [`## ${hub.heading || entry.title}`, '', hub.definition];
  if (pub) {
    const facts = [pub.data.number, pub.data.revised?.replace(/^Revised/, 'revised')].filter(Boolean).join(', ');
    parts.push('', `## NIMH publication: ${pub.data.title || entry.title}${facts ? ` (${facts})` : ''}`, `(${pub.url})`, '', pub.data.text);
  } else {
    parts.push('', '(NIMH has no publication under this topic\'s name: only the definition of its topic page is kept, not its link sections.)');
  }
  return {
    kind: 'doc',
    doc: {
      source: 'nimh', id: entry.id, lang: 'en', title: hub.title, ref: `nimh.nih.gov/health/topics/${entry.id}`,
      text: parts.join('\n').trim(), date: hub.date, dateKind: 'reviewed', licence: NIMH_LICENCE,
      url: `${NIMH_INDEX}/${entry.id}`, attribution: NIMH_ATTRIBUTION,
    },
  };
}

/**
 * A topic page that is NOT a hub (Psychotherapies, Caring for Your Mental
 * Health…) is itself the text, in sections: its whole `<main>` is kept,
 * without the in-page table of contents and the "Last Reviewed" line.
 */
export function parseNimhTopic(html: string, entry: Entry): ReadResult {
  const doc = parseHtml(html);
  const main = doc.querySelector('main');
  if (!main) return { kind: 'skip', reason: 'NO_TEXT' };
  const date = nimhReviewed(doc);
  // The in-page table of contents and the "Last Reviewed" line are not text of the topic.
  main.querySelectorAll('.onpage-nav, #block-nimhtheme-local-tasks').forEach((n) => n.remove());
  main.querySelectorAll('strong').forEach((s) => {
    if (/^\s*Last Reviewed/i.test(s.textContent ?? '')) s.parentElement?.remove();
  });
  const h1 = main.querySelector('h1');
  const title = (h1?.textContent ?? '').replace(/\s+/g, ' ').trim() || entry.title;
  h1?.remove();
  const text = elementText(main);
  if (text.length < 40) return { kind: 'skip', reason: 'NO_TEXT' };
  return {
    kind: 'doc',
    doc: {
      source: 'nimh', id: entry.id, lang: 'en', title, ref: `nimh.nih.gov/health/topics/${entry.id}`,
      text, date, dateKind: 'reviewed', licence: NIMH_LICENCE,
      url: `${NIMH_INDEX}/${entry.id}`, attribution: NIMH_ATTRIBUTION,
    },
  };
}

/** The NIMH source (catalogue, English, read through the host). */
export const NIMH: SourceDef = {
  id: 'nimh',
  domain: 'mental',
  langs: ['en'],
  mode: 'catalogue',
  name: 'NIMH',
  licence: NIMH_LICENCE,
  licenceUrl: NIMH_LICENCE_URL,
  pauseMs: NIMH_PAUSE_MS,
  async list(deps: ReaderDeps, _lang, _query, signal) {
    return parseNimhIndex(await deps.hostText(NIMH_INDEX, signal));
  },
  async read(deps: ReaderDeps, entry, _lang, signal) {
    const html = await deps.hostText(`${NIMH_INDEX}/${entry.id}`, signal);
    const hub = isNimhHub(html) ? parseNimhHub(html, entry) : null;
    if (!hub) return parseNimhTopic(html, entry);
    // One more host read, paced: the publication under the same slug. A 404 is
    // "no publication"; any other failure fails the entry (retried, or the run
    // stops on it), never a silent "without publication".
    await deps.sleep(NIMH_PAUSE_MS, signal);
    const url = nimhPublicationUrl(entry.id);
    let page: string | null;
    try {
      page = await deps.hostText(url, signal);
    } catch (err) {
      if (err instanceof Error && err.message === 'HTTP_404') page = null;
      else throw err;
    }
    const data = page === null ? null : parseNimhPublication(page);
    return nimhHubDoc(entry, hub, data ? { url, data } : null);
  },
};
