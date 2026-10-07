/**
 * Orphanet — rare diseases, one disease and its definition per entry.
 *
 * Measured 2026-10-04 against api.orphadata.com (doc 135 §3bis.6):
 *  - CORS: the origin is echoed back (`Access-Control-Allow-Origin:
 *    http://localhost:5227`), so the cartridge reads it directly.
 *  - The language parameter is `lang` (OpenAPI at /openapi.json). 🪤 A wrong
 *    name (`language=fr`) is ignored silently and returns English.
 *  - `GET /rd-cross-referencing/orphacodes?lang=xx`: the list, 11 645 entries,
 *    1.3 MB, ORPHAcode + preferred term only, no definition.
 *  - `GET /rd-cross-referencing/orphacodes/{code}?lang=xx`: one disease, with
 *    `Date`, `OrphanetURL` and `SummaryInformation`. 🪤 The definition key is
 *    LOCALISED (`Definition`, `Définition`, `Definición`), so the first value
 *    of the first summary object is read, never a fixed key.
 *  - A group of disorders (ORPHA:68367, "Category") has
 *    `SummaryInformation: null`: no definition, no entry. It is SKIPPED and
 *    COUNTED, never written as an empty memory.
 *  - Every answer carries `__licence` ({ identifier, link, name }); the
 *    licence of a memory is copied from THAT answer, never assumed.
 *
 * The 54 MB XML (`orphadata.com/data/xml/*_product1.xml`) is above the host's
 * 4 MB cap and is not used.
 */
import { LARGE_REQUEST_TIMEOUT_MS } from '../lib/fetchers';
import { inlineText } from '../lib/html';
import type { Entry, ListResult, ReadResult, ReaderDeps, SourceDef, SourceLang } from './types';

export const ORPHANET_API = 'https://api.orphadata.com';

/** Licence as doc 135 §3bis.6 recopied it from the API's `__licence` field. */
export const ORPHANET_TILE_LICENCE = 'Creative Commons Attribution 4.0 International (CC-BY-4.0)';
export const ORPHANET_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0';
export const ORPHANET_ATTRIBUTION = 'Orphanet (INSERM), Orphadata API';

interface Licence { identifier?: unknown; name?: unknown; link?: unknown }

/** The licence of one answer, as written in its `__licence` field. Absent field = said, not guessed. */
export function licenceOf(data: { __licence?: Licence } | undefined): string {
  const l = data?.__licence;
  const name = typeof l?.name === 'string' ? l.name : '';
  const id = typeof l?.identifier === 'string' ? l.identifier : '';
  if (!name && !id) return 'Licence field absent from the Orphadata answer';
  return name && id ? `${name} (${id})` : name || id;
}

/** Parses the list answer: entries sorted by ORPHAcode, so a resume cursor means the same disease next time. */
export function parseOrphanetList(json: unknown): ListResult {
  const data = (json as { data?: { __count?: unknown; results?: unknown } })?.data;
  if (!data || !Array.isArray(data.results)) throw new Error('ORPHANET_UNEXPECTED_LIST');
  const entries: Entry[] = [];
  for (const r of data.results as Array<Record<string, unknown>>) {
    const code = r?.ORPHAcode;
    const term = r?.['Preferred term'];
    if (typeof code === 'number' && Number.isFinite(code) && typeof term === 'string' && term.trim()) {
      entries.push({ id: String(code), title: term.trim() });
    }
  }
  entries.sort((a, b) => Number(a.id) - Number(b.id));
  return { entries, total: typeof data.__count === 'number' ? data.__count : null };
}

/** Parses one disease. No definition = a skip, counted by the caller. */
export function parseOrphanetDisease(json: unknown, lang: SourceLang): ReadResult {
  const data = (json as { data?: { __licence?: Licence; results?: Record<string, unknown> } })?.data;
  const r = data?.results;
  if (!r || typeof r !== 'object') return { kind: 'skip', reason: 'NOT_FOUND' };
  const summary = Array.isArray(r.SummaryInformation) ? r.SummaryInformation[0] : null;
  const raw = summary && typeof summary === 'object'
    ? Object.values(summary as Record<string, unknown>).find((v) => typeof v === 'string' && v.trim())
    : undefined;
  const definition = typeof raw === 'string' ? inlineText(raw) : '';
  if (!definition) return { kind: 'skip', reason: 'NO_DEFINITION' };
  const code = String(r.ORPHAcode ?? '');
  const title = typeof r['Preferred term'] === 'string' ? r['Preferred term'].trim() : `ORPHA:${code}`;
  const synonyms = Array.isArray(r.Synonym) ? r.Synonym.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [];
  const date = typeof r.Date === 'string' && r.Date.trim() ? r.Date.trim() : null;
  const url = typeof r.OrphanetURL === 'string' && r.OrphanetURL ? r.OrphanetURL : `${ORPHANET_API}/rd-cross-referencing/orphacodes/${code}?lang=${lang}`;
  const lines = [definition];
  if (synonyms.length > 0) lines.push('', `Synonyms: ${synonyms.join('; ')}`);
  if (typeof r.Typology === 'string' && r.Typology) lines.push(`Typology: ${r.Typology}`);
  return {
    kind: 'doc',
    doc: {
      source: 'orphanet', id: code, lang, title, ref: `ORPHA:${code}`,
      text: lines.join('\n'), date, dateKind: 'record',
      licence: licenceOf(data), url, attribution: ORPHANET_ATTRIBUTION,
    },
  };
}

/** The Orphanet source (catalogue, en/fr/es, read directly; licence copied from each answer). */
export const ORPHANET: SourceDef = {
  id: 'orphanet',
  domain: 'rare',
  langs: ['en', 'fr', 'es'],
  mode: 'catalogue',
  name: 'Orphanet',
  licence: ORPHANET_TILE_LICENCE,
  licenceUrl: ORPHANET_LICENCE_URL,
  pauseMs: 250,
  async list(deps: ReaderDeps, lang, _query, signal) {
    const json = await deps.fetchJson(`${ORPHANET_API}/rd-cross-referencing/orphacodes?lang=${lang}`, signal, LARGE_REQUEST_TIMEOUT_MS);
    return parseOrphanetList(json);
  },
  async read(deps: ReaderDeps, entry, lang, signal) {
    try {
      const json = await deps.fetchJson(`${ORPHANET_API}/rd-cross-referencing/orphacodes/${encodeURIComponent(entry.id)}?lang=${lang}`, signal);
      return parseOrphanetDisease(json, lang);
    } catch (err) {
      // A code the API no longer knows answers 404: that disease is skipped, the pack goes on.
      if (err instanceof Error && err.message === 'HTTP_404') return { kind: 'skip', reason: 'NOT_FOUND' };
      throw err;
    }
  },
};
