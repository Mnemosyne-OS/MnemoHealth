import { NO_ADVICE, PART_CHARS, chronicleTitle, docChronicles, docRef, sourceLine, splitText } from './entryText';
import type { Doc } from '../sources/types';

const doc = (over: Partial<Doc> = {}): Doc => ({
  source: 'orphanet', id: '58', lang: 'en', title: 'Alexander disease', ref: 'ORPHA:58',
  text: 'A rare neurodegenerative disorder.', date: '2026-06-23 07:53:50', dateKind: 'record',
  licence: 'Creative Commons Attribution 4.0 International (CC-BY-4.0)',
  url: 'http://www.orpha.net/consor/cgi-bin/OC_Exp.php?lng=en&Expert=58', attribution: 'Orphanet (INSERM), Orphadata API',
  ...over,
});

describe('sourceLine', () => {
  it('names the source, the date, the licence, where to check, and that it is not advice', () => {
    const line = sourceLine(doc());
    expect(line).toBe('Source: Orphanet (INSERM), Orphadata API (en). Record date: 2026-06-23 07:53:50. Licence: Creative Commons Attribution 4.0 International (CC-BY-4.0). Check: http://www.orpha.net/consor/cgi-bin/OC_Exp.php?lng=en&Expert=58 ' + NO_ADVICE);
  });

  it('an unknown date is ABSENT from the line, never "unknown" and never today', () => {
    const line = sourceLine(doc({ date: null }));
    expect(line).not.toMatch(/date|Date|reviewed|Published/);
    expect(line).not.toContain(new Date().toISOString().slice(0, 10));
  });
});

describe('chronicles', () => {
  it('titles the chronicle with the source and the entry, and closes it with the source line', () => {
    const [body] = docChronicles(doc());
    expect(body!.split('\n')[0]).toBe(`# ${chronicleTitle(doc())}`);
    expect(body!.split('\n')[0]).toBe('# Orphanet · Alexander disease (ORPHA:58)');
    expect(body!.trim().endsWith(NO_ADVICE)).toBe(true);
  });

  it('cuts a long text into parts that each carry the title and the source line, and rejoin to the text', () => {
    const text = Array.from({ length: 4000 }, (_, i) => `Sentence ${i} of a long article.`).join('\n');
    expect(splitText(text).join('')).toBe(text);
    const bodies = docChronicles(doc({ text }));
    expect(bodies.length).toBeGreaterThan(1);
    bodies.forEach((b, i) => {
      expect(b).toContain(`(part ${i + 1}/${bodies.length})`);
      expect(b).toContain('Source: Orphanet');
      expect(b.length).toBeLessThan(PART_CHARS + 1_000);
    });
  });

  it('gives every part its own sourceRef', () => {
    expect(docRef(doc())).toBe('mnemo-health:orphanet:en:58');
    expect(docRef(doc(), 2)).toBe('mnemo-health:orphanet:en:58#2');
  });
});
