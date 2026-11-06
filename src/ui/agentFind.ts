/**
 * agentFind — an entry of a loaded list named the way a person says it (doc 149 §19). The orb
 * plans a spoken sentence in ONE model call and never reads MnemoHealth first, so « ajoute la
 * mucoviscidose » reaches `add` with the words « mucoviscidose », never an Orphanet id. An id
 * still works (other agents read `entries` first).
 *
 * 🚨 Several matches are REFUSED with their names (AMBIGUOUS), never the first one taken: the
 *    refusal is what the orb's repair call reads to pick the right one. No match is refused
 *    with names that exist.
 *
 * Copied from Vitrine Studio's `data/agentFind.ts` (never imported across cartridges), with the
 * filler words of this app's domain.
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles and the words a sentence wraps a name in.
 * 🪤 Matched BEFORE the accents come off: folded, « thé » would be « the ».
 * ⛔ « syndrome » is NOT a filler: it is a real part of thousands of Orphanet titles.
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à',
  'the', 'a', 'an', 'of', 'my', 'and', 'el', 'los', 'las', 'del', 'mi', 'y',
  'maladie', 'maladies', 'disease', 'diseases', 'enfermedad', 'enfermedades',
  'fiche', 'fiches', 'terme', 'termes', 'term', 'terms', 'término', 'article', 'articles', 'artículo',
  'entrée', 'entrées', 'entry', 'entries', 'entrada',
]);

/** The words of a name, folded, fillers out, a plural « s »/« x » off so « troubles » finds « trouble ». */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => fold(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

export interface Named<T> { item: T; id: string; names: string[]; label: string }

const LIST_MAX = 12;
const listed = (labels: string[]) => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};

/**
 * The one item `ref` names: its id; else the item whose whole name is `ref`; else the item whose
 * words hold every word of `ref`. `kind` names the error (NO_ENTRY…) and the noun said.
 */
export function findNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string, kind: { code: string; noun: string; plural: string }): T {
  const raw = ref.trim();
  if (!raw) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const byId = entries.find((e) => e.id === raw);
  if (byId) return byId.item;
  const asked = nameWords(raw);
  const all = entries.map((e) => e.label);
  if (!asked.length) throw new Error(`${kind.code}: "${raw}" names no ${kind.noun}; ${kind.plural}: ${listed(all) || 'none'}`);
  // The whole name said as written wins over a partial match (« Autisme » against « Autisme » and « Autisme atypique »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return whole[0]!.item;
  const hits = entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0]!.item;
  if (hits.length > 1) throw new Error(`AMBIGUOUS: "${raw}" names several ${kind.plural}: ${listed(hits.map((e) => e.label))}; say which`);
  throw new Error(`${kind.code}: no ${kind.noun} named "${raw}"; ${kind.plural}: ${listed(all) || 'none'}`);
}
