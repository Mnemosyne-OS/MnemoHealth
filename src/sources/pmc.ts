/**
 * PMC Open Access — research articles by subject, one article per entry (cut
 * into parts when long). Licence PER ARTICLE, shown on every row: the person
 * chooses.
 *
 * Measured 2026-10-04:
 *  - NCBI E-utilities (CORS `*`): `esearch.fcgi?db=pmc&term=<subject> AND open
 *    access[filter]&retmode=json` (514 671 hits for "type 2 diabetes"), then
 *    `esummary.fcgi?db=pmc&id=…` for title, journal and `pubdate`. NCBI asks
 *    for at most 3 requests a second without a key: one call at a time, a
 *    pause of 400 ms between two, and a `tool=` name with the project's `email=`.
 *  - The article files live on S3, bucket `pmc-oa-opendata`, with NO CORS
 *    header: they are read by the host (`social.fetch`). The version suffix
 *    (`PMC13632730.1`) is not in esummary, so the bucket listing
 *    `?list-type=2&prefix=PMC<id>.&delimiter=/` (host too) names it.
 *  - `<version>.json` carries `license_code` ("CC BY-NC", "CC0"…),
 *    `is_retracted` and `citation`; `<version>.txt` is the plain text
 *    (147 KB for the sample), its references after a `REFERENCES` line.
 *    Both are served as `binary/octet-stream`, which the host decodes as text.
 *
 * 🚨 A retracted article is refused (counted), never written as a source.
 * The references section is left out of the memory and the memory says so.
 */
import type { Entry, ReaderDeps, SourceDef } from './types';

export const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
export const PMC_S3 = 'https://pmc-oa-opendata.s3.amazonaws.com';
export const PMC_TOOL = 'mnemo-health';
/**
 * Contact NCBI asks for next to `tool=`: the project's public address, the one
 * the published @mnemosyne_os/mcp README gives for privacy questions. Never
 * the user's address.
 */
export const PMC_EMAIL = 'dev@mnemosyne-os.com';
/** The `tool` and `email` parameters every E-utilities call carries. */
export const NCBI_ID = `tool=${PMC_TOOL}&email=${encodeURIComponent(PMC_EMAIL)}`;
/** NCBI: 3 requests a second without a key. 400 ms keeps a margin. */
export const NCBI_PAUSE_MS = 400;
/** Articles per page: each one costs two host reads to show its licence. */
export const PMC_PAGE = 10;
export const PMC_TILE_LICENCE = 'licence PER ARTICLE in the JSON, field license_code (e.g. "CC0")';
export const PMC_LICENCE_URL = 'https://pmc.ncbi.nlm.nih.gov/tools/openftlist/';
export const PMC_ATTRIBUTION = 'PubMed Central Open Access Subset (U.S. National Library of Medicine)';

/** The esearch URL of one page of a subject. */
export function esearchUrl(term: string, retstart: number): string {
  const q = encodeURIComponent(`${term} AND open access[filter]`);
  return `${EUTILS}/esearch.fcgi?db=pmc&term=${q}&retmode=json&retmax=${PMC_PAGE}&retstart=${retstart}&${NCBI_ID}`;
}

/** Ids and total of an esearch answer. */
export function parseEsearch(json: unknown): { ids: string[]; total: number | null } {
  const r = (json as { esearchresult?: { idlist?: unknown; count?: unknown } })?.esearchresult;
  if (!r || !Array.isArray(r.idlist)) throw new Error('PMC_UNEXPECTED_ESEARCH');
  const total = typeof r.count === 'string' && /^\d+$/.test(r.count) ? Number(r.count) : null;
  return { ids: r.idlist.filter((x): x is string => typeof x === 'string' && /^\d+$/.test(x)), total };
}

/** Title, journal and publication date of each id, from esummary. */
export function parseEsummary(json: unknown, ids: readonly string[]): Entry[] {
  const result = (json as { result?: Record<string, Record<string, unknown>> })?.result;
  if (!result) throw new Error('PMC_UNEXPECTED_ESUMMARY');
  const out: Entry[] = [];
  for (const id of ids) {
    const r = result[id];
    if (!r || typeof r.title !== 'string') continue;
    const extra: Record<string, string> = {};
    if (typeof r.pubdate === 'string' && r.pubdate.trim()) extra.pubdate = r.pubdate.trim();
    if (typeof r.source === 'string' && r.source.trim()) extra.journal = r.source.trim();
    out.push({ id: `PMC${id}`, title: r.title.replace(/\.$/, '').trim(), extra });
  }
  return out;
}

/** The latest version folder named by an S3 listing (`PMC13632730.1/`), or null. */
export function latestVersion(xml: string, pmcid: string): string | null {
  const re = new RegExp(`<Prefix>(${pmcid}\\.(\\d+))/</Prefix>`, 'g');
  let best: { name: string; n: number } | null = null;
  for (const m of xml.matchAll(re)) {
    const n = Number(m[2]);
    if (!best || n > best.n) best = { name: m[1]!, n };
  }
  return best?.name ?? null;
}

/** The facts of an article's JSON record that the screen and the memory need. */
export function parseArticleRecord(json: string): { licence: string | null; retracted: boolean; citation: string | null } {
  const v = JSON.parse(json) as Record<string, unknown>;
  return {
    licence: typeof v.license_code === 'string' && v.license_code.trim() ? v.license_code.trim() : null,
    retracted: v.is_retracted === true,
    citation: typeof v.citation === 'string' && v.citation.trim() ? v.citation.trim() : null,
  };
}

/** The article text without its reference list. */
export function articleBody(txt: string): { text: string; referencesCut: boolean } {
  const m = /\n(?:REFERENCES|References)\s*\n/.exec(txt);
  return m ? { text: txt.slice(0, m.index).trim(), referencesCut: true } : { text: txt.trim(), referencesCut: false };
}

/** The licence line of an article: its license_code as written, or that the record has none. */
export function articleLicence(code: string | undefined): string {
  return code ? `${code} (license_code of the PMC Open Access record)` : 'license_code empty in the PMC Open Access record';
}

/** The PMC Open Access source (search by subject, English; files read through the host; licence per article). */
export const PMC: SourceDef = {
  id: 'pmc',
  domain: 'research',
  langs: ['en'],
  mode: 'search',
  name: 'PMC Open Access',
  licence: PMC_TILE_LICENCE,
  licenceUrl: PMC_LICENCE_URL,
  pauseMs: NCBI_PAUSE_MS,
  pageSize: PMC_PAGE,
  async list(deps: ReaderDeps, _lang, query, signal, offset = 0) {
    const term = query.trim();
    if (!term) return { entries: [], total: null };
    const found = parseEsearch(await deps.fetchJson(esearchUrl(term, offset), signal));
    if (found.ids.length === 0) return { entries: [], total: found.total };
    await deps.sleep(NCBI_PAUSE_MS, signal);
    const summary = await deps.fetchJson(`${EUTILS}/esummary.fcgi?db=pmc&id=${found.ids.join(',')}&retmode=json&${NCBI_ID}`, signal);
    const entries = parseEsummary(summary, found.ids);
    // Each row shows its licence, so each article's record is read now (host, S3).
    for (const e of entries) {
      try {
        const version = latestVersion(await deps.hostText(`${PMC_S3}/?list-type=2&prefix=${e.id}.&delimiter=/`, signal), e.id);
        if (!version) { e.extra = { ...e.extra, missing: '1' }; continue; }
        const rec = parseArticleRecord(await deps.hostText(`${PMC_S3}/${version}/${version}.json`, signal));
        e.extra = {
          ...e.extra, version,
          ...(rec.licence ? { licence: rec.licence } : {}),
          ...(rec.citation ? { citation: rec.citation } : {}),
          retracted: rec.retracted ? '1' : '0',
        };
      } catch (err) {
        if (signal?.aborted) throw err;
        // One unreadable record leaves its row without a licence (and without an import button); the list goes on.
        console.error('[mnemo-health] PMC record unreadable', e.id, err);
        e.extra = { ...e.extra, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return { entries, total: found.total };
  },
  async read(deps: ReaderDeps, entry, _lang, signal) {
    const version = entry.extra?.version;
    if (!version) return { kind: 'skip', reason: 'NOT_FOUND' };
    if (entry.extra?.retracted === '1') return { kind: 'skip', reason: 'RETRACTED' };
    const { text, referencesCut } = articleBody(await deps.hostText(`${PMC_S3}/${version}/${version}.txt`, signal));
    if (text.length < 200) return { kind: 'skip', reason: 'NO_TEXT' };
    const head = [entry.extra?.citation ? `Citation: ${entry.extra.citation}` : '', referencesCut ? '(Reference list left out.)' : '']
      .filter(Boolean).join('\n');
    return {
      kind: 'doc',
      doc: {
        source: 'pmc', id: entry.id, lang: 'en', title: entry.title, ref: version,
        text: head ? `${head}\n\n${text}` : text,
        date: entry.extra?.pubdate ?? null, dateKind: 'published',
        licence: articleLicence(entry.extra?.licence),
        url: `https://pmc.ncbi.nlm.nih.gov/articles/${entry.id}/`, attribution: PMC_ATTRIBUTION,
      },
    };
  },
};
