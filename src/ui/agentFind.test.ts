import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const entry = (id: string, title: string): Named<string> => ({ item: id, id, names: [title], label: `${title} (${id})` });
const ENTRIES = [
  entry('586', 'Mucoviscidose'),
  entry('558', 'Syndrome de Marfan'),
  entry('284993', 'Syndrome de Marfan néonatal'),
  entry('D1', 'Autisme'),
  entry('D2', 'Autisme atypique'),
  entry('D3', 'Troubles anxieux'),
];
const kind = { code: 'NO_ENTRY', noun: 'entry', plural: 'entries' };

describe('an entry named the way a person says it', () => {
  it('folds case, accents, fillers and a plural, and keeps « syndrome »', () => {
    expect(nameWords('la maladie de CROHN')).toEqual(['crohn']);
    expect(nameWords('les troubles anxieux')).toEqual(['trouble', 'anxieu']);
    expect(nameWords('le syndrome de Marfan')).toEqual(['syndrome', 'marfan']);
  });

  it('an id, the whole name, or every word of it', () => {
    expect(findNamed(ENTRIES, '586', kind)).toBe('586');
    expect(findNamed(ENTRIES, 'la mucoviscidose', kind)).toBe('586');
    // « Autisme » is a whole title: it wins over the titles that hold the word.
    expect(findNamed(ENTRIES, "l'autisme", kind)).toBe('D1');
    expect(findNamed(ENTRIES, 'le syndrome de Marfan', kind)).toBe('558');
    expect(findNamed(ENTRIES, 'Marfan néonatal', kind)).toBe('284993');
    expect(findNamed(ENTRIES, 'trouble anxieux', kind)).toBe('D3');
  });

  it('several matches are refused with their names and ids, never the first taken', () => {
    expect(() => findNamed(ENTRIES, 'Marfan', kind)).toThrow(
      'AMBIGUOUS: "Marfan" names several entries: Syndrome de Marfan (558), Syndrome de Marfan néonatal (284993); say which',
    );
  });

  it('no match is refused with the names that exist, capped', () => {
    expect(() => findNamed(ENTRIES, 'diabète', kind)).toThrow(/^NO_ENTRY: no entry named "diabète"; entries: Mucoviscidose \(586\), /);
    expect(() => findNamed(ENTRIES, '', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'x', kind)).toThrow('entries: none');
    const many = Array.from({ length: 20 }, (_, i) => entry(`E${i}`, `Title ${i}`));
    expect(() => findNamed(many, 'zzz', kind)).toThrow(/\(\+8\)$/);
  });
});
