/**
 * The shape every MnemoHealth source fits: a list of entries, and one entry
 * read into a document that carries its own provenance.
 *
 * Types only, no logic: the readers live one per source next to this file.
 */
import type { FetchJson, FetchText } from '../lib/fetchers';

export type SourceId = 'orphanet' | 'nimh' | 'who' | 'mesh' | 'pmc';

/** The sub-domains of the home screen, one tile each. */
export type Domain = 'rare' | 'mental' | 'who' | 'vocab' | 'research';

/** A language a source text can be read in. */
export type SourceLang = 'en' | 'fr' | 'es';

/** One entry of a list: a disease, a topic, a fact sheet, a descriptor, an article. */
export interface Entry {
  id: string;
  title: string;
  /** Source-specific facts read while listing (PMC: version, licence, retraction; MeSH: scope note). */
  extra?: Record<string, string>;
}

/** What a list call returns. `total` is the source's own count when it gives one, never a guess. */
export interface ListResult {
  entries: Entry[];
  total: number | null;
}

/** When the date of a text is, according to its source. */
export type DateKind = 'record' | 'reviewed' | 'published' | 'updated';

/**
 * One text, ready to become memory. Every field of provenance is what the
 * source said. `date` is null when the source gave none: ABSENT, never today.
 */
export interface Doc {
  source: SourceId;
  id: string;
  lang: SourceLang;
  /** The entry's name as the source spells it. */
  title: string;
  /** A short reference shown after the title (`ORPHA:58`, `D003920`, `PMC13632730.1`). */
  ref: string;
  text: string;
  date: string | null;
  dateKind: DateKind;
  /** The licence as recopied, never filtered or judged. */
  licence: string;
  /** Where a reader can check the text. */
  url: string;
  /** Who published it, in the words a citation needs. */
  attribution: string;
}

/** A read that produced no document, with its reason (counted, never a stop). */
export interface Skip {
  kind: 'skip';
  reason: 'NO_DEFINITION' | 'NO_TEXT' | 'NO_SCOPE_NOTE' | 'RETRACTED' | 'NOT_FOUND';
}

export type ReadResult = { kind: 'doc'; doc: Doc } | Skip;

/** The network a reader may use, injected so each reader is testable on recorded answers. */
export interface ReaderDeps {
  fetchJson: FetchJson;
  fetchText: FetchText;
  /** Text read by the host (`social.fetch`), for sources without CORS. Truncated bodies are already refused. */
  hostText: (url: string, signal?: AbortSignal) => Promise<string>;
  /** Pause between two requests to the same service (politeness, NCBI quota). */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** A source wired into the cartridge. */
export interface SourceDef {
  id: SourceId;
  domain: Domain;
  /** Languages the source really serves, at real URLs. */
  langs: readonly SourceLang[];
  /** `catalogue`: the whole list is loaded once and filtered here. `search`: the source is queried. */
  mode: 'catalogue' | 'search';
  /** Display name of the source (a proper noun, not translated). */
  name: string;
  /** The licence text shown on the source tile, recopied. */
  licence: string;
  /** Where the licence or the reuse policy is written. */
  licenceUrl: string;
  /** Pause between two reads during "add all", in ms. */
  pauseMs: number;
  /** `offset` pages a search source (PMC); catalogue sources ignore it. */
  list(deps: ReaderDeps, lang: SourceLang, query: string, signal?: AbortSignal, offset?: number): Promise<ListResult>;
  /** Entries per search page, when the source pages. */
  pageSize?: number;
  read(deps: ReaderDeps, entry: Entry, lang: SourceLang, signal?: AbortSignal): Promise<ReadResult>;
}
