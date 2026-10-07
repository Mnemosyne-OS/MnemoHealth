// Recorded pages of www.nimh.nih.gov, 2026-10-04 (curl).
import index from './fixtures/nimh-topics.html?raw';
import depression from './fixtures/nimh-depression.html?raw';
import depressionListing from './fixtures/nimh-depression-listing.html?raw';
import depressionPublication from './fixtures/nimh-publication-depression.html?raw';
import covid from './fixtures/nimh-covid-19-and-mental-health.html?raw';
import anxiety from './fixtures/nimh-anxiety-disorders.html?raw';
import psychotherapies from './fixtures/nimh-psychotherapies.html?raw';
import {
  NIMH, NIMH_LICENCE, isNimhHub, nimhPublicationUrl, parseNimhHub, parseNimhIndex, parseNimhPublication, parseNimhTopic,
} from './nimh';
import type { ReaderDeps } from './types';

/** The link sections every hub repeats: none of them may reach memory. */
const HUB_NAVIGATION = [
  'Where can I learn more',
  'Why is NIMH studying',
  'Explore clinical trials',
  'Share outreach materials',
  'Find help and support',
  'Additional federal resources',
  'Digital shareables',
];

function host(pages: Record<string, string>, calls: string[] = []): ReaderDeps {
  return {
    fetchJson: async () => { throw new Error('not used'); },
    fetchText: async () => { throw new Error('not used'); },
    hostText: async (url: string) => {
      calls.push(url);
      const page = pages[url];
      if (page === undefined) throw new Error('HTTP_404');
      return page;
    },
    sleep: async () => { calls.push('sleep'); },
  };
}

describe('NIMH index', () => {
  it('lists the English topics once each, without the Spanish pages or the links outside /health/topics', () => {
    const res = parseNimhIndex(index);
    const ids = res.entries.map((e) => e.id);
    expect(ids).toContain('depression');
    expect(ids).toContain('brain-stimulation-therapies/brain-stimulation-therapies');
    expect(ids.some((id) => id.startsWith('espanol'))).toBe(false);
    expect(ids).not.toContain('find-help');
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.entries.find((e) => e.id === 'depression')?.title).toBe('Depression');
    expect(res.total).toBe(25);
  });
});

describe('NIMH hub topic (Depression)', () => {
  it('keeps only the "What is X?" intro of the hub and its date', () => {
    expect(isNimhHub(depression)).toBe(true);
    const hub = parseNimhHub(depression, { id: 'depression', title: 'Depression' })!;
    expect(hub.title).toBe('Depression');
    expect(hub.heading).toBe('What is depression?');
    expect(hub.date).toBe('December 2024');
    expect(hub.definition).toMatch(/^Everyone feels sad or low sometimes/);
    for (const nav of HUB_NAVIGATION) expect(hub.definition).not.toContain(nav);
  });

  it('the publication of a topic is the one under the SAME slug', () => {
    expect(nimhPublicationUrl('depression')).toBe('https://www.nimh.nih.gov/health/publications/depression');
  });

  it('reads the publication text without its PDF/Spanish links and its closing link sections', () => {
    const pub = parseNimhPublication(depressionPublication)!;
    expect(pub.title).toBe('Depression');
    expect(pub.number).toBe('NIH Publication No. 24-MH-8079');
    expect(pub.revised).toBe('Revised 2024');
    expect(pub.text).toMatch(/^## What is depression\?/);
    expect(pub.text).toContain('What are the different types of depression?');
    expect(pub.text).toContain('Persistent depressive disorder');
    expect(pub.text).not.toContain('Download PDF');
    expect(pub.text).not.toContain('En español');
    expect(pub.text).not.toContain('For more information');
    expect(pub.text).not.toContain('Reprints');
  });

  it('writes the definition of the hub + the main publication, and none of the hub navigation', async () => {
    const calls: string[] = [];
    const r = await NIMH.read(host({
      'https://www.nimh.nih.gov/health/topics/depression': depression,
      'https://www.nimh.nih.gov/health/publications/depression': depressionPublication,
    }, calls), { id: 'depression', title: 'Depression' }, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.text).toMatch(/^## What is depression\?\n\nEveryone feels sad/);
    expect(r.doc.text).toContain('## NIMH publication: Depression (NIH Publication No. 24-MH-8079, revised 2024)');
    expect(r.doc.text).toContain('(https://www.nimh.nih.gov/health/publications/depression)');
    expect(r.doc.text).toContain('Persistent depressive disorder');
    for (const nav of HUB_NAVIGATION) expect(r.doc.text).not.toContain(nav);
    expect(r.doc.date).toBe('December 2024');
    expect(r.doc.licence).toBe(NIMH_LICENCE);
    // Two host reads, paced: the hub, then the publication under the same slug. No listing page.
    expect(calls).toEqual([
      'https://www.nimh.nih.gov/health/topics/depression', 'sleep',
      'https://www.nimh.nih.gov/health/publications/depression',
    ]);
  });

  it('a page without "Last Reviewed" has NO date, never the download day', () => {
    const html = depression.replace(/<p class="mt-4"><strong>Last Reviewed: <\/strong>December 2024<\/p>/, '');
    expect(parseNimhHub(html, { id: 'depression', title: 'D' })!.date).toBeNull();
  });
});

describe('NIMH hub without a publication under its slug', () => {
  it('COVID-19: a 404 on the same slug writes only "What is X?" and SAYS there is no publication', async () => {
    const calls: string[] = [];
    const r = await NIMH.read(host({ 'https://www.nimh.nih.gov/health/topics/covid-19-and-mental-health': covid }, calls),
      { id: 'covid-19-and-mental-health', title: 'COVID-19 and Mental Health' }, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.text).toMatch(/^## What is COVID-19\?/);
    expect(r.doc.text).toContain("NIMH has no publication under this topic's name");
    for (const nav of HUB_NAVIGATION) expect(r.doc.text).not.toContain(nav);
    expect(calls).toEqual([
      'https://www.nimh.nih.gov/health/topics/covid-19-and-mental-health', 'sleep',
      'https://www.nimh.nih.gov/health/publications/covid-19-and-mental-health',
    ]);
  });

  it('Anxiety: its listing page is NEVER read to choose a brochure (its first link could be another topic)', async () => {
    const calls: string[] = [];
    // The hub links `/health/publications/anxiety-disorders-listing`. A listing whose first
    // link is another topic's brochure is served there: reading it would file Depression under Anxiety.
    const r = await NIMH.read(host({
      'https://www.nimh.nih.gov/health/topics/anxiety-disorders': anxiety,
      'https://www.nimh.nih.gov/health/publications/anxiety-disorders-listing': depressionListing,
      'https://www.nimh.nih.gov/health/publications/depression': depressionPublication,
    }, calls), { id: 'anxiety-disorders', title: 'Anxiety Disorders' }, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(calls.some((c) => c.includes('-listing'))).toBe(false);
    expect(r.doc.text).not.toContain('NIMH publication:');
    expect(r.doc.text).not.toContain('Persistent depressive disorder');
    expect(r.doc.text).toMatch(/^## What is anxiety\?/);
    expect(r.doc.text).toContain("NIMH has no publication under this topic's name");
  });

  it('any failure other than 404 on the publication fails the entry, never "without publication"', async () => {
    const deps = host({ 'https://www.nimh.nih.gov/health/topics/depression': depression });
    deps.hostText = async (url: string) => {
      if (url.endsWith('/topics/depression')) return depression;
      throw new Error('HTTP_503');
    };
    await expect(NIMH.read(deps, { id: 'depression', title: 'Depression' }, 'en')).rejects.toThrow('HTTP_503');
    deps.hostText = async (url: string) => {
      if (url.endsWith('/topics/depression')) return depression;
      throw new Error('HOST_FETCH_TRUNCATED');
    };
    await expect(NIMH.read(deps, { id: 'depression', title: 'Depression' }, 'en')).rejects.toThrow('HOST_FETCH_TRUNCATED');
  });
});

describe('NIMH article topic (Psychotherapies)', () => {
  it('is not a hub: the page itself is the text, kept whole, and no publication is looked for', async () => {
    expect(isNimhHub(psychotherapies)).toBe(false);
    const calls: string[] = [];
    const r = await NIMH.read(host({ 'https://www.nimh.nih.gov/health/topics/psychotherapies': psychotherapies }, calls),
      { id: 'psychotherapies', title: 'Psychotherapies' }, 'en');
    expect(calls).toEqual(['https://www.nimh.nih.gov/health/topics/psychotherapies']);
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.text).toContain('What is psychotherapy?');
    expect(r.doc.text).toContain('What should I look for in a therapist?');
    expect(r.doc.text).not.toContain('Last Reviewed');
  });

  it('parseNimhTopic keeps an article page as it is', () => {
    const r = parseNimhTopic(psychotherapies, { id: 'psychotherapies', title: 'P' });
    expect(r.kind).toBe('doc');
  });
});
