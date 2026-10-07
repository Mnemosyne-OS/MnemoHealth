// Recorded answers of id.nlm.nih.gov/mesh, 2026-10-04 (curl).
import lookup from './fixtures/mesh-lookup-diabetes.json?raw';
import sparqlMulti from './fixtures/mesh-sparql-multi.json?raw';
import { MESH, mergeMeshDetails, meshDoc, meshSparql, parseMeshLookup } from './mesh';
import type { ReaderDeps } from './types';

describe('MeSH', () => {
  it('parses the lookup into descriptor ids and labels', () => {
    const entries = parseMeshLookup(JSON.parse(lookup));
    expect(entries).toHaveLength(10);
    expect(entries.find((e) => e.id === 'D003920')?.title).toBe('Diabetes Mellitus');
  });

  it('merges the scope note (on the preferred concept) and the record date from one SPARQL answer', () => {
    const entries = mergeMeshDetails(parseMeshLookup(JSON.parse(lookup)), JSON.parse(sparqlMulti));
    const dm = entries.find((e) => e.id === 'D003920')!;
    expect(dm.extra?.scope).toBe('A heterogeneous group of disorders characterized by HYPERGLYCEMIA and GLUCOSE INTOLERANCE.');
    expect(dm.extra?.updated).toBe('2017-07-17');
    // Not in that SPARQL answer: nothing invented.
    expect(entries.find((e) => e.id === 'D048909')?.extra).toEqual({});
  });

  it('builds a doc from the scope note, and skips a descriptor without one', () => {
    const r = meshDoc({ id: 'D003920', title: 'Diabetes Mellitus', extra: { scope: 'A group.', updated: '2017-07-17' } }, '2026-10-04');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.date).toBe('2017-07-17');
    expect(r.doc.text).toContain('2026-10-04');
    expect(meshDoc({ id: 'D1', title: 'x', extra: {} }, '2026-10-04')).toEqual({ kind: 'skip', reason: 'NO_SCOPE_NOTE' });
    const undated = meshDoc({ id: 'D003920', title: 'x', extra: { scope: 'A group.' } }, '2026-10-04');
    expect(undated.kind === 'doc' && undated.doc.date).toBeNull();
  });

  it('never lets anything but a MeSH id into the SPARQL query', () => {
    const q = meshSparql(['D003920', '} DROP ALL {', 'D1']);
    expect(q).toContain('<http://id.nlm.nih.gov/mesh/D003920>');
    expect(q).not.toContain('DROP');
  });

  it('searches with one lookup and one SPARQL call', async () => {
    const urls: string[] = [];
    const deps = {
      fetchJson: async (url: string) => { urls.push(url); return JSON.parse(url.includes('/sparql') ? sparqlMulti : lookup); },
    } as unknown as ReaderDeps;
    const res = await MESH.list(deps, 'en', 'diabetes');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('lookup/descriptor?label=diabetes&match=contains');
    expect(res.entries).toHaveLength(10);
  });
});
