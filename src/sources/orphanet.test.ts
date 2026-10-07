// Recorded answers of api.orphadata.com, 2026-10-04 (curl, list trimmed to 20 rows).
import list from './fixtures/orphanet-list-en.json?raw';
import d58en from './fixtures/orphanet-58-en.json?raw';
import d58fr from './fixtures/orphanet-58-fr.json?raw';
import d166024es from './fixtures/orphanet-166024-es.json?raw';
import d68367 from './fixtures/orphanet-68367-en.json?raw';
import { ORPHANET, ORPHANET_TILE_LICENCE, licenceOf, parseOrphanetDisease, parseOrphanetList } from './orphanet';
import type { ReaderDeps } from './types';

describe('Orphanet list', () => {
  it('keeps the API count and sorts by ORPHAcode, so a resume cursor names the same disease', () => {
    const res = parseOrphanetList(JSON.parse(list));
    expect(res.total).toBe(11645);
    expect(res.entries).toHaveLength(20);
    const codes = res.entries.map((e) => Number(e.id));
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    expect(res.entries.find((e) => e.id === '58')?.title).toBe('Alexander disease');
  });

  it('refuses an answer that is not a list instead of returning nothing', () => {
    expect(() => parseOrphanetList({ error: { code: 404 } })).toThrow('ORPHANET_UNEXPECTED_LIST');
  });
});

describe('Orphanet disease', () => {
  it('reads the definition, the record date and the licence of THIS answer', () => {
    const r = parseOrphanetDisease(JSON.parse(d58en), 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.text).toMatch(/^A rare neurodegenerative disorder of the astrocytes/);
    expect(r.doc.date).toBe('2026-06-23 07:53:50');
    expect(r.doc.licence).toBe('Creative Commons Attribution 4.0 International (CC-BY-4.0)');
    expect(r.doc.ref).toBe('ORPHA:58');
    expect(r.doc.url).toContain('Expert=58');
  });

  it('the memory carries the licence of the ANSWER, even when it differs from the tile constant', () => {
    const json = JSON.parse(d58en);
    json.data.__licence = { identifier: 'CC0-1.0', name: 'Creative Commons Zero v1.0 Universal', link: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    const r = parseOrphanetDisease(json, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.licence).toBe('Creative Commons Zero v1.0 Universal (CC0-1.0)');
    expect(r.doc.licence).not.toBe(ORPHANET_TILE_LICENCE);
  });

  it('reads a localised definition key (Définition, Definición) and drops the <i> tags, not the words', () => {
    const fr = parseOrphanetDisease(JSON.parse(d58fr), 'fr');
    if (fr.kind !== 'doc') throw new Error('expected a doc');
    expect(fr.doc.title).toBe("Maladie d'Alexander");
    expect(fr.doc.text).toMatch(/^La maladie d'Alexander \(AxD\)/);
    const es = parseOrphanetDisease(JSON.parse(d166024es), 'es');
    if (es.kind !== 'doc') throw new Error('expected a doc');
    expect(es.doc.text).toContain('genu valgum');
    expect(es.doc.text).not.toContain('<i>');
  });

  it('skips a group of disorders that has no definition, never an empty memory', () => {
    expect(parseOrphanetDisease(JSON.parse(d68367), 'en')).toEqual({ kind: 'skip', reason: 'NO_DEFINITION' });
  });

  it('says the licence field is absent rather than assuming one', () => {
    expect(licenceOf({})).toBe('Licence field absent from the Orphadata answer');
  });

  it('reads with the `lang` parameter (a wrong name silently returns English)', async () => {
    const urls: string[] = [];
    const deps = { fetchJson: async (url: string) => { urls.push(url); return JSON.parse(d58fr); } } as unknown as ReaderDeps;
    await ORPHANET.read(deps, { id: '58', title: 'x' }, 'fr');
    expect(urls[0]).toBe('https://api.orphadata.com/rd-cross-referencing/orphacodes/58?lang=fr');
  });

  it('turns a 404 into a counted skip', async () => {
    const deps = { fetchJson: async () => { throw new Error('HTTP_404'); } } as unknown as ReaderDeps;
    expect(await ORPHANET.read(deps, { id: '1', title: 'x' }, 'en')).toEqual({ kind: 'skip', reason: 'NOT_FOUND' });
  });
});
