// Recorded pages of www.who.int, 2026-10-04 (curl).
import indexEn from './fixtures/who-index-en.html?raw';
import indexFr from './fixtures/who-index-fr.html?raw';
import sheetEn from './fixtures/who-depression-en.html?raw';
import sheetEs from './fixtures/who-depression-es.html?raw';
import { WHO_LICENCE, WHO_POLICY_URL, parseWhoIndex, parseWhoSheet, whoSheetUrl } from './who';

describe('WHO index', () => {
  it('lists 244 sheets in English and 240 in French, under shared slugs', () => {
    const en = parseWhoIndex(indexEn);
    const fr = parseWhoIndex(indexFr);
    expect(en.entries).toHaveLength(244);
    expect(fr.entries).toHaveLength(240);
    expect(en.entries.find((e) => e.id === 'depression')).toBeTruthy();
    // 🪤 27 slugs carry parentheses or capitals; a [a-z0-9-] pattern lost them all.
    expect(en.entries.find((e) => e.id === 'coronavirus-disease-(covid-19)')).toBeTruthy();
    expect(en.entries.find((e) => e.id === 'community-based-health-insurance-CBHI')).toBeTruthy();
    expect(fr.entries.find((e) => e.id === 'stroke')?.title).toBe('Accident vasculaire cérébral (AVC)');
  });
});

describe('WHO sheet', () => {
  it('reads the title, the date as printed and the body', () => {
    const r = parseWhoSheet(sheetEn, { id: 'depression', title: 'Depression' }, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.title).toBe('Depressive disorder (depression)');
    expect(r.doc.date).toBe('11 September 2026');
    expect(r.doc.text).toMatch(/^## Key facts/);
    expect(r.doc.text).toContain('- Depression is a common mental disorder.');
    expect(r.doc.url).toBe('https://www.who.int/news-room/fact-sheets/detail/depression');
  });

  it('keeps a localised date verbatim, never converted', () => {
    const r = parseWhoSheet(sheetEs, { id: 'depression', title: 'x' }, 'es');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.date).toBe('11 de septiembre de 2026');
    expect(r.doc.url).toBe(whoSheetUrl('depression', 'es'));
    expect(r.doc.url).toBe('https://www.who.int/es/news-room/fact-sheets/detail/depression');
  });

  it('a template placeholder in the date slot is no date', () => {
    const html = sheetEn.replace('<span class="timestamp">11 September 2026</span>', '<span class="timestamp">#: FormatedDate #</span>');
    const r = parseWhoSheet(html, { id: 'depression', title: 'x' }, 'en');
    if (r.kind !== 'doc') throw new Error('expected a doc');
    expect(r.doc.date).toBeNull();
  });

  it('says the licence is not stated by the page and that the policy names several, without picking one', () => {
    expect(WHO_LICENCE).toMatch(/^Licence of the fact sheets not stated by the page\./);
    expect(WHO_LICENCE).toContain('several licences');
    expect(WHO_LICENCE).toContain(WHO_POLICY_URL);
    // No single licence named: quoting one would choose it for the reader.
    expect(WHO_LICENCE).not.toMatch(/CC BY|Creative Commons/);
  });
});
