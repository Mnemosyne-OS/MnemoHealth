// Recorded answers of E-utilities and of the pmc-oa-opendata bucket, 2026-10-04 (curl).
import esearch from './fixtures/pmc-esearch.json?raw';
import esummary from './fixtures/pmc-esummary.json?raw';
import s3list from './fixtures/pmc-s3-list.xml?raw';
import record from './fixtures/pmc-PMC13632730.1.json?raw';
import txt from './fixtures/pmc-PMC13632730.1.txt?raw';
import { PMC, PMC_EMAIL, esearchUrl, articleBody, articleLicence, latestVersion, parseArticleRecord, parseEsearch, parseEsummary } from './pmc';
import type { ReaderDeps } from './types';

const deps = (calls: string[]): ReaderDeps => ({
  fetchJson: async (url: string) => { calls.push(url); return JSON.parse(url.includes('esearch') ? esearch : esummary); },
  fetchText: async () => { throw new Error('not used'); },
  hostText: async (url: string) => {
    calls.push(url);
    if (url.includes('list-type=2')) return s3list;
    if (url.endsWith('.json')) return record;
    if (url.endsWith('.txt')) return txt;
    throw new Error('HTTP_404');
  },
  sleep: async () => { calls.push('sleep'); },
});

describe('PMC Open Access', () => {
  it('parses esearch and esummary', () => {
    const s = parseEsearch(JSON.parse(esearch));
    expect(s.total).toBe(514671);
    expect(s.ids).toHaveLength(5);
    const entries = parseEsummary(JSON.parse(esummary), s.ids);
    expect(entries[0]).toMatchObject({ id: 'PMC13632730', title: 'The landscape of allele-specific expression in human kidneys' });
    expect(entries[0]!.extra?.pubdate).toBe('2026 Oct 2');
  });

  it('finds the version folder, then reads the licence and the retraction flag of the record', () => {
    expect(latestVersion(s3list, 'PMC13632730')).toBe('PMC13632730.1');
    expect(latestVersion('<Prefix>PMC1.1/</Prefix><Prefix>PMC1.3/</Prefix><Prefix>PMC1.2/</Prefix>', 'PMC1')).toBe('PMC1.3');
    expect(parseArticleRecord(record)).toEqual({ licence: 'CC BY-NC', retracted: false, citation: 'Sci Adv. 2026 Oct 2;12(40):eaeg3462. doi: 10.1126/sciadv.aeg3462' });
  });

  it('leaves the reference list out and says so', () => {
    const b = articleBody(txt);
    expect(b.referencesCut).toBe(true);
    expect(b.text).toContain('INTRODUCTION');
    expect(b.text).not.toContain('Detecting and resolving sample anomalies');
  });

  it('shows each article with its licence, pausing between two NCBI calls', async () => {
    const calls: string[] = [];
    const res = await PMC.list(deps(calls), 'en', 'type 2 diabetes');
    expect(calls[0]).toContain('open%20access%5Bfilter%5D');
    expect(calls[1]).toBe('sleep');
    expect(calls[2]).toContain('esummary');
    expect(res.entries[0]!.extra).toMatchObject({ version: 'PMC13632730.1', licence: 'CC BY-NC', retracted: '0' });
  });

  it('reads the article as a doc whose licence is its own license_code', async () => {
    const entry = { id: 'PMC13632730', title: 't', extra: { version: 'PMC13632730.1', licence: 'CC BY-NC', retracted: '0', pubdate: '2026 Oct 2', citation: 'Sci Adv. 2026 Oct 2;12(40):eaeg3462' } };
    const r = await PMC.read(deps([]), entry, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.licence).toBe('CC BY-NC (license_code of the PMC Open Access record)');
    expect(r.doc.date).toBe('2026 Oct 2');
    expect(r.doc.text).toMatch(/^Citation: Sci Adv/);
    expect(r.doc.text).toContain('(Reference list left out.)');
  });

  it('refuses a retracted article', async () => {
    const entry = { id: 'PMC1', title: 't', extra: { version: 'PMC1.1', licence: 'CC0', retracted: '1' } };
    expect(await PMC.read(deps([]), entry, 'en')).toEqual({ kind: 'skip', reason: 'RETRACTED' });
  });

  it('identifies itself to NCBI with tool= and the project email=, as NCBI asks', () => {
    const url = esearchUrl('migraine', 0);
    expect(url).toContain('tool=mnemo-health');
    expect(url).toContain(`email=${encodeURIComponent(PMC_EMAIL)}`);
  });

  it('says when a record has no licence code instead of inventing one', () => {
    expect(articleLicence(undefined)).toBe('license_code empty in the PMC Open Access record');
  });
});
