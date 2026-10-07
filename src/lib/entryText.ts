/**
 * entryText — how a document becomes chronicles, each closed by its source line.
 *
 * Pure. A chunk retrieved alone months later must still say what it is, where
 * it comes from, how old it is, under which licence, and where to check it
 * (doc 134 §2.3, carried over). The text itself is never rewritten.
 *
 * 🎭 A date the source did not give is ABSENT from the line: no "date
 * unknown", and never the day of the download dressed as the text's date.
 */
import type { DateKind, Doc } from '../sources/types';

/** Source names inside a chronicle (proper nouns, English like the rest of the line). */
const SOURCE_LABEL: Record<Doc['source'], string> = {
  orphanet: 'Orphanet',
  nimh: 'NIMH',
  who: 'WHO',
  mesh: 'MeSH',
  pmc: 'PMC Open Access',
};

const DATE_LABEL: Record<DateKind, string> = {
  record: 'Record date',
  reviewed: 'Last reviewed',
  published: 'Published',
  updated: 'Record last updated',
};

/** One line written in every chronicle and shown under every entry. */
export const NO_ADVICE = 'MnemoHealth quotes this text and gives no medical advice.';

/**
 * Largest text in ONE chronicle. The host refuses a chronicle above 50 000
 * BYTES (`social:ingest`); 18 000 characters is DocWatch's part size (doc 57)
 * and stays under the cap for the Latin scripts these sources use.
 */
export const PART_CHARS = 18_000;

/**
 * Splits a text into parts of at most `max` characters, at a blank line in the
 * second half of the window when one exists, else a line break, else a space,
 * else hard. Joined back, the parts are the text.
 */
export function splitText(text: string, max = PART_CHARS): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const floor = Math.floor(max / 2);
    let cut = window.lastIndexOf('\n\n');
    if (cut < floor) cut = window.lastIndexOf('\n');
    if (cut < floor) cut = window.lastIndexOf(' ');
    if (cut < floor) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts;
}

/** The title of a chronicle: the source, the entry and its reference. */
export function chronicleTitle(doc: Pick<Doc, 'source' | 'title' | 'ref'>): string {
  return `${SOURCE_LABEL[doc.source]} · ${doc.title} (${doc.ref})`;
}

/** The closing line: where the text comes from, its date if the source gave one, its licence, where to check it. */
export function sourceLine(doc: Pick<Doc, 'attribution' | 'date' | 'dateKind' | 'licence' | 'url' | 'lang'>): string {
  const parts = [`Source: ${doc.attribution} (${doc.lang}).`];
  if (doc.date) parts.push(`${DATE_LABEL[doc.dateKind]}: ${doc.date}.`);
  parts.push(`Licence: ${doc.licence}`.replace(/([^.”"])$/, '$1.'));
  parts.push(`Check: ${doc.url}`);
  parts.push(NO_ADVICE);
  return parts.join(' ');
}

/** The chronicle bodies of a document: one, or one per part when the text is long. */
export function docChronicles(doc: Doc): string[] {
  const parts = splitText(doc.text.trim());
  return parts.map((part, i) => [
    `# ${chronicleTitle(doc)}${parts.length > 1 ? ` (part ${i + 1}/${parts.length})` : ''}`,
    '',
    part.trim(),
    '',
    sourceLine(doc),
  ].join('\n'));
}

/** sourceRef of a chronicle: source, language, entry id, and the part when there are several. */
export function docRef(doc: Pick<Doc, 'source' | 'lang' | 'id'>, part?: number): string {
  return `mnemo-health:${doc.source}:${doc.lang}:${doc.id}${part === undefined ? '' : `#${part}`}`;
}
