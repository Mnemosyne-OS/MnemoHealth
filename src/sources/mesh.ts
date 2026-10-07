/**
 * MeSH — the U.S. National Library of Medicine's medical vocabulary, one
 * descriptor and its scope note per entry, found by a search term.
 *
 * Measured 2026-10-04 on id.nlm.nih.gov/mesh (CORS `*` on both calls):
 *  - `lookup/descriptor?label=<term>&match=contains&limit=N` returns
 *    `[{ resource, label }]`.
 *  - 🪤 The scope note is on the descriptor's PREFERRED CONCEPT, not on the
 *    descriptor. One SPARQL call (`/mesh/sparql?format=JSON`) returns label,
 *    scope note and `lastUpdated` for every descriptor of the page at once.
 *  - A descriptor with no scope note has nothing to say: skipped, counted.
 *
 * Licence: the NLM "Terms and Conditions MeSH" page, recopied below. It asks
 * to acknowledge NLM, never to imply NLM's endorsement, and to identify the
 * version used: the memory names the record's `lastUpdated` date and the day
 * it was read from the current MeSH RDF.
 */
import type { Entry, ReadResult, ReaderDeps, SourceDef } from './types';

export const MESH_BASE = 'https://id.nlm.nih.gov/mesh';
export const MESH_LICENCE_URL = 'https://www.nlm.nih.gov/databases/download/terms_and_conditions_mesh.html';
/** Recopied from the NLM Terms and Conditions MeSH page (read 2026-10-04). */
export const MESH_LICENCE = 'NLM Terms and Conditions MeSH: “NLM freely provides MeSH data.” Users who republish or redistribute the data agree to “acknowledge NLM as the source of the data in a clear and conspicuous manner” and “not indicate or imply that NLM has endorsed its products/services/applications”.';
export const MESH_ATTRIBUTION = 'Medical Subject Headings (MeSH), courtesy of the U.S. National Library of Medicine; not endorsed by NLM';

/** How many descriptors one search shows. */
export const MESH_PAGE = 25;

/** The descriptor id out of its resource URI (`http://id.nlm.nih.gov/mesh/D003920` → `D003920`). */
export function meshId(resource: string): string | null {
  const m = /\/mesh\/(D\d{6,9})$/.exec(resource);
  return m ? m[1]! : null;
}

/** Parses the lookup answer into entries (no scope note yet). */
export function parseMeshLookup(json: unknown): Entry[] {
  if (!Array.isArray(json)) throw new Error('MESH_UNEXPECTED_LOOKUP');
  const out: Entry[] = [];
  for (const r of json as Array<Record<string, unknown>>) {
    const id = typeof r?.resource === 'string' ? meshId(r.resource) : null;
    const label = typeof r?.label === 'string' ? r.label.trim() : '';
    if (id && label && !out.some((e) => e.id === id)) out.push({ id, title: label });
  }
  return out;
}

/** The SPARQL query for a page of descriptors. Ids are checked to be MeSH ids before they enter it. */
export function meshSparql(ids: readonly string[]): string {
  const values = ids.filter((id) => /^D\d{6,9}$/.test(id)).map((id) => `<http://id.nlm.nih.gov/mesh/${id}>`).join(' ');
  return 'PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> '
    + `SELECT ?d ?label ?scope ?updated WHERE { VALUES ?d { ${values} } ?d rdfs:label ?label ; meshv:preferredConcept ?c . `
    + 'OPTIONAL { ?c meshv:scopeNote ?scope } OPTIONAL { ?d meshv:lastUpdated ?updated } }';
}

/** Merges the SPARQL answer into the entries: scope note and date ride in `extra`; absent stays absent. */
export function mergeMeshDetails(entries: Entry[], json: unknown): Entry[] {
  const bindings = (json as { results?: { bindings?: unknown } })?.results?.bindings;
  if (!Array.isArray(bindings)) throw new Error('MESH_UNEXPECTED_SPARQL');
  const by = new Map<string, Record<string, string>>();
  for (const b of bindings as Array<Record<string, { value?: unknown }>>) {
    const id = typeof b.d?.value === 'string' ? meshId(b.d.value) : null;
    if (!id) continue;
    const extra: Record<string, string> = {};
    if (typeof b.scope?.value === 'string' && b.scope.value.trim()) extra.scope = b.scope.value.trim();
    if (typeof b.updated?.value === 'string' && b.updated.value.trim()) extra.updated = b.updated.value.trim();
    by.set(id, { ...by.get(id), ...extra });
  }
  return entries.map((e) => ({ ...e, extra: by.get(e.id) ?? {} }));
}

/** One descriptor into a document, from what the search already read. */
export function meshDoc(entry: Entry, readOn: string): ReadResult {
  const scope = entry.extra?.scope;
  if (!scope) return { kind: 'skip', reason: 'NO_SCOPE_NOTE' };
  return {
    kind: 'doc',
    doc: {
      source: 'mesh', id: entry.id, lang: 'en', title: entry.title, ref: `MeSH ${entry.id}`,
      text: `${scope}\n\n(Read from the current MeSH RDF at id.nlm.nih.gov on ${readOn}.)`,
      date: entry.extra?.updated ?? null, dateKind: 'updated', licence: MESH_LICENCE,
      url: `https://meshb.nlm.nih.gov/record/ui?ui=${entry.id}`, attribution: MESH_ATTRIBUTION,
    },
  };
}

/** The MeSH source (search by term, English, read directly). */
export const MESH: SourceDef = {
  id: 'mesh',
  domain: 'vocab',
  langs: ['en'],
  mode: 'search',
  name: 'MeSH',
  licence: MESH_LICENCE,
  licenceUrl: MESH_LICENCE_URL,
  pauseMs: 0,
  async list(deps: ReaderDeps, _lang, query, signal) {
    const term = query.trim();
    if (!term) return { entries: [], total: null };
    const found = parseMeshLookup(await deps.fetchJson(
      `${MESH_BASE}/lookup/descriptor?label=${encodeURIComponent(term)}&match=contains&limit=${MESH_PAGE}`, signal,
    ));
    if (found.length === 0) return { entries: [], total: 0 };
    const sparql = await deps.fetchJson(
      `${MESH_BASE}/sparql?format=JSON&query=${encodeURIComponent(meshSparql(found.map((e) => e.id)))}`, signal,
    );
    return { entries: mergeMeshDetails(found, sparql), total: null };
  },
  async read(_deps: ReaderDeps, entry) {
    return meshDoc(entry, new Date().toISOString().slice(0, 10));
  },
};
