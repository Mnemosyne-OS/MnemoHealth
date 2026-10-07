/**
 * library — what the person put in memory, where its copy lives, and the run
 * that reads entries and writes them.
 *
 * Two copies, two jobs (same contract as MnemoLaw, doc 134 §3.3):
 *  - one JSON file per entry in the cartridge's knowledge folder (given by
 *    the host with the Memory Pack, never asked of the person), filed by source
 *    and language, next to an ATTRIBUTION.md (CC BY wants the attribution
 *    where the data lives);
 *  - one chronicle per entry (several for a long article) in the Memory Pack
 *    vault of its source, each closed by its source line.
 *
 * The durable state (doc 73, 256 KB cap) holds COUNTS per source and language,
 * the resume point of an "add all" run, and the ids added one by one (capped):
 * never one record per Orphanet disease, 11 645 of them would not fit.
 *
 * The host is reached through a port so all of this is testable without a bridge.
 */
import { NO_ADVICE, docChronicles, docRef } from './entryText';
import { ORPHANET_ATTRIBUTION, ORPHANET_LICENCE_URL, ORPHANET_TILE_LICENCE } from '../sources/orphanet';
import { NIMH_ATTRIBUTION, NIMH_LICENCE, NIMH_LICENCE_URL } from '../sources/nimh';
import { WHO_ATTRIBUTION, WHO_LICENCE, WHO_POLICY_URL } from '../sources/who';
import { MESH_ATTRIBUTION, MESH_LICENCE, MESH_LICENCE_URL } from '../sources/mesh';
import { PMC_ATTRIBUTION, PMC_LICENCE_URL } from '../sources/pmc';
import type { Doc, Entry, ReaderDeps, SourceDef, SourceId, SourceLang } from '../sources/types';

/** Spine type of every MnemoHealth chronicle (free text for the host, `^[A-Z][A-Z0-9_]{2,39}$`). */
export const SPINE = 'MEDICAL_TEXT';
export const ATTRIBUTION_FILE = 'ATTRIBUTION.md';
/** Ids remembered for entries added one by one, per source and language. Past it the oldest are forgotten. */
export const DONE_CAP = 2_000;

/** Resume point of an "add all" run over a catalogue. */
export interface PackState {
  /** Index of the next entry to read in the sorted list. */
  cursor: number;
  /** Entries in the list when the run last saved. */
  total: number;
  /** The last entry read: the resume point if the list changed in between. */
  lastId: string | null;
  startedAt: string;
}

export interface SourceRecord {
  /** `<source>|<lang>`. */
  key: string;
  source: SourceId;
  lang: SourceLang;
  /** Entries whose every chronicle reached the vault. */
  inVault: number;
  /** Entries the vault refused (one part or more). */
  failed: number;
  /** Entries the source had nothing for (no definition, retracted, no text), counted. */
  skipped: number;
  updatedAt: string;
  /** Ids added one by one (or by "add all listed"), newest last. */
  done: string[];
  pack?: PackState;
}

export interface LibraryState {
  folder: string | null;
  records: SourceRecord[];
}

/** A library nothing was added to. Never written over a stored one that was not read (see `persistLibrary`). */
export const EMPTY_LIBRARY: LibraryState = { folder: null, records: [] };

/** Key of the record of one source in one language: `<source>|<lang>`. */
export function recordKey(source: SourceId, lang: SourceLang): string {
  return `${source}|${lang}`;
}

/** An empty record for a source and language: zero counted, no resume point. */
export function newRecord(source: SourceId, lang: SourceLang, now: Date): SourceRecord {
  return { key: recordKey(source, lang), source, lang, inVault: 0, failed: 0, skipped: 0, updatedAt: now.toISOString(), done: [] };
}

/** Replaces the record of the same source and language, or adds it. */
export function withRecord(lib: LibraryState, rec: SourceRecord): LibraryState {
  return { ...lib, records: [...lib.records.filter((r) => r.key !== rec.key), rec] };
}

const SOURCE_IDS: readonly SourceId[] = ['orphanet', 'nimh', 'who', 'mesh', 'pmc'];
const LANG_IDS: readonly SourceLang[] = ['en', 'fr', 'es'];
const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parsePackState(v: unknown): PackState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  if (!count(p.cursor) || !count(p.total) || typeof p.startedAt !== 'string') return undefined;
  return { cursor: p.cursor as number, total: p.total as number, lastId: typeof p.lastId === 'string' ? p.lastId : null, startedAt: p.startedAt };
}

/** Reads a stored library defensively: anything unreadable is dropped, never invented. */
export function parseLibrary(raw: unknown): LibraryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // 🪤 `state.get` answers `{ state: { library }, updatedAt }` (host
  // cartridgeState.ts), not `{ library }`: reading `library` at the root was
  // MnemoLaw's "everything forgotten at every restart" bug (2026-10-03).
  const holder = (r.state && typeof r.state === 'object' ? r.state : r) as Record<string, unknown>;
  const lib = (holder.library && typeof holder.library === 'object' ? holder.library : {}) as Record<string, unknown>;
  const records: SourceRecord[] = [];
  if (Array.isArray(lib.records)) {
    for (const v of lib.records) {
      if (!v || typeof v !== 'object') continue;
      const x = v as Record<string, unknown>;
      if (!SOURCE_IDS.includes(x.source as SourceId) || !LANG_IDS.includes(x.lang as SourceLang)) continue;
      if (!count(x.inVault) || !count(x.failed) || !count(x.skipped) || typeof x.updatedAt !== 'string') continue;
      const source = x.source as SourceId;
      const lang = x.lang as SourceLang;
      const pack = parsePackState(x.pack);
      records.push({
        key: recordKey(source, lang), source, lang,
        inVault: x.inVault as number, failed: x.failed as number, skipped: x.skipped as number,
        updatedAt: x.updatedAt,
        done: Array.isArray(x.done) ? x.done.filter((d): d is string => typeof d === 'string').slice(-DONE_CAP) : [],
        ...(pack ? { pack } : {}),
      });
    }
  }
  return { folder: typeof lib.folder === 'string' && lib.folder ? lib.folder : null, records };
}

/** Joins a folder and a name with the folder's own separator (Windows or POSIX). */
export function joinPath(folder: string, file: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + file;
}

/** Folder of a source inside the cartridge's knowledge folder. English names, so the tree does not change with the app's language. */
export const SOURCE_FOLDER: Record<SourceId, string> = { orphanet: 'Orphanet', nimh: 'NIMH', who: 'WHO', mesh: 'MeSH', pmc: 'PMC' };

/** File name of one entry: readable and unique per source and language. */
export function entryFileName(id: string): string {
  return `${id.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}.json`;
}

/** The ATTRIBUTION.md written in the cartridge's knowledge folder: every source, its licence and its policy page. */
export function attributionText(): string {
  const block = (title: string, attribution: string, licence: string, url: string) => [
    `## ${title}`, '', `- Attribution: ${attribution}`, `- Licence: ${licence}`, `- Licence or reuse policy: ${url}`, '',
  ];
  return [
    '# Medical texts in this folder',
    '',
    'These files were downloaded by MnemoHealth. Each file names its source, its date when the source gives one, its licence and the address where the text can be checked.',
    '',
    ...block('Rare diseases: Orphanet', ORPHANET_ATTRIBUTION, `${ORPHANET_TILE_LICENCE} (as written in the __licence field of each API answer)`, ORPHANET_LICENCE_URL),
    ...block('Mental health: NIMH', NIMH_ATTRIBUTION, NIMH_LICENCE, NIMH_LICENCE_URL),
    ...block('WHO fact sheets', WHO_ATTRIBUTION, WHO_LICENCE, WHO_POLICY_URL),
    ...block('Medical vocabulary: MeSH', MESH_ATTRIBUTION, MESH_LICENCE, MESH_LICENCE_URL),
    ...block('Research articles: PMC Open Access', PMC_ATTRIBUTION, 'per article, the license_code of its PMC record, written in each file', PMC_LICENCE_URL),
    NO_ADVICE,
    '',
  ].join('\n');
}

/** The host operations a run needs. */
export interface HostPort {
  writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>;
  mkdir(path: string): Promise<{ success: boolean; error?: string }>;
  ingest(entry: { vault: string; content: string; sourceRef: string }): Promise<void>;
}

/** Writes the entry's file, then its chronicles. True when EVERY part reached the vault. */
export async function writeDoc(port: HostPort, args: { folder: string; vault: string; doc: Doc; signal?: AbortSignal }): Promise<boolean> {
  const dir = joinPath(joinPath(args.folder, SOURCE_FOLDER[args.doc.source]), args.doc.lang);
  const made = await port.mkdir(dir);
  if (!made.success) throw new Error(`WRITE_FAILED: ${made.error ?? 'unknown'}`);
  const wrote = await port.writeFile(joinPath(dir, entryFileName(args.doc.id)), JSON.stringify(args.doc, null, 1));
  if (!wrote.success) throw new Error(`WRITE_FAILED: ${wrote.error ?? 'unknown'}`);
  const bodies = docChronicles(args.doc);
  let whole = true;
  for (let p = 0; p < bodies.length; p++) {
    if (args.signal?.aborted) return false;
    try {
      await port.ingest({ vault: args.vault, content: bodies[p]!, sourceRef: bodies.length > 1 ? docRef(args.doc, p + 1) : docRef(args.doc) });
    } catch (err) {
      // A source missing its second half would be cited as if it were whole: the entry is not counted.
      whole = false;
      console.error('[mnemo-health] chronicle refused', args.doc.source, args.doc.id, p, err);
    }
  }
  return whole;
}

const RETRY = /^(HTTP_(429|5\d\d)|FETCH_TIMEOUT|TypeError|Failed to fetch|NetworkError|network|TimeoutError|The operation was aborted due to timeout|signal timed out)/i;
const BACKOFF_MS = [2_000, 5_000, 15_000];

/** Where an "add all" run starts: after the last entry it read, or at its cursor if that entry is gone. */
export function resumeIndex(entries: readonly Entry[], pack: PackState | undefined): number {
  if (!pack) return 0;
  if (pack.lastId) {
    const i = entries.findIndex((e) => e.id === pack.lastId);
    if (i >= 0) return i + 1;
  }
  return Math.min(pack.cursor, entries.length);
}

export interface RunProgress {
  done: number;
  total: number;
  inVault: number;
  skipped: number;
  failed: number;
  already: number;
}

/**
 * Reads entries and writes them, one at a time with a pause between two reads.
 *
 *  - `mode: 'pack'` walks a whole catalogue from its resume point and saves
 *    the cursor every `saveEvery` entries and at the end, so a stop, a closed
 *    window or a restart resumes at the next entry. Entries already added one
 *    by one are not written twice (counted as `already`).
 *  - `mode: 'list'` writes the given entries and remembers their ids.
 *
 * A source with nothing for an entry (no definition, retracted) is a skip,
 * counted, never a stop. A read that still fails after its retries ends the
 * run with the cursor ON that entry, and the error is thrown to the caller.
 */
export async function runEntries(deps: {
  reader: ReaderDeps;
  def: SourceDef;
  lang: SourceLang;
  port: HostPort;
  vault: string;
  folder: string;
  record: SourceRecord;
  save: (rec: SourceRecord) => Promise<void>;
  signal?: AbortSignal;
  onProgress?: (p: RunProgress) => void;
  now?: () => Date;
  saveEvery?: number;
  /** For a single entry of a catalogue the pack already passed: already counted, written again on request. */
  counted?: (id: string) => boolean;
}, entries: readonly Entry[], mode: 'pack' | 'list'): Promise<{ record: SourceRecord; progress: RunProgress }> {
  const now = deps.now ?? (() => new Date());
  const saveEvery = deps.saveEvery ?? 10;
  let rec: SourceRecord = { ...deps.record, done: [...deps.record.done] };
  const start = mode === 'pack' ? resumeIndex(entries, rec.pack) : 0;
  if (mode === 'pack') {
    rec.pack = { cursor: start, total: entries.length, lastId: rec.pack?.lastId ?? null, startedAt: rec.pack?.startedAt ?? now().toISOString() };
  }
  const progress: RunProgress = { done: start, total: entries.length, inVault: 0, skipped: 0, failed: 0, already: 0 };
  const doneSet = new Set(rec.done);
  let sinceSave = 0;
  let wroteAttribution = false;
  try {
    for (let i = start; i < entries.length; i++) {
      if (deps.signal?.aborted) break;
      const entry = entries[i]!;
      if (mode === 'pack' && doneSet.has(entry.id)) {
        progress.already++;
      } else {
        if (i > start && deps.def.pauseMs > 0) await deps.reader.sleep(deps.def.pauseMs, deps.signal);
        let result;
        for (let attempt = 0; ; attempt++) {
          try {
            result = await deps.def.read(deps.reader, entry, deps.lang, deps.signal);
            break;
          } catch (err) {
            const msg = err instanceof Error ? `${err.name === 'TypeError' ? 'TypeError ' : ''}${err.message}` : String(err);
            if (deps.signal?.aborted || attempt >= BACKOFF_MS.length || !RETRY.test(msg)) throw err;
            console.warn('[mnemo-health] read failed, retrying', deps.def.id, entry.id, msg);
            await deps.reader.sleep(BACKOFF_MS[attempt]!, deps.signal);
          }
        }
        if (deps.signal?.aborted) break;
        if (result.kind === 'skip') {
          progress.skipped++;
          rec.skipped++;
        } else {
          if (!wroteAttribution) {
            const attr = await deps.port.writeFile(joinPath(deps.folder, ATTRIBUTION_FILE), attributionText());
            if (!attr.success) throw new Error(`WRITE_FAILED: ${attr.error ?? 'unknown'}`);
            wroteAttribution = true;
          }
          const whole = await writeDoc(deps.port, { folder: deps.folder, vault: deps.vault, doc: result.doc, signal: deps.signal });
          // A stop in the middle of an entry leaves it unread: the cursor does not move past it.
          if (deps.signal?.aborted) break;
          const already = doneSet.has(entry.id) || (deps.counted?.(entry.id) ?? false);
          if (whole) {
            progress.inVault++;
            if (already) progress.already++;
            else rec.inVault++;
            if (mode === 'list' && !doneSet.has(entry.id)) {
              doneSet.add(entry.id);
              rec.done.push(entry.id);
              if (rec.done.length > DONE_CAP) rec.done = rec.done.slice(-DONE_CAP);
            }
          } else {
            progress.failed++;
            rec.failed++;
          }
        }
      }
      progress.done = i + 1;
      rec.updatedAt = now().toISOString();
      if (mode === 'pack') rec.pack = { ...rec.pack!, cursor: i + 1, total: entries.length, lastId: entry.id };
      deps.onProgress?.({ ...progress });
      if (++sinceSave >= saveEvery) { sinceSave = 0; await deps.save(rec); }
    }
  } finally {
    await deps.save(rec);
  }
  return { record: rec, progress };
}

/** True when the entry at `index` of `entries` is already counted in memory (added alone, or passed by an "add all" run). */
export function countedIn(rec: SourceRecord | undefined, entries: readonly Entry[], index: number): boolean {
  if (!rec) return false;
  const entry = entries[index];
  if (!entry) return false;
  if (rec.done.includes(entry.id)) return true;
  return !!rec.pack && index < resumeIndex(entries, rec.pack);
}

/**
 * Whether the durable state has been READ. Until it has, the screen does not
 * know what is in memory, and writing would overwrite the folder, the counts
 * and the resume points that may be stored there.
 */
export type LibStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; why: string };

/**
 * Writes the library to the durable state ONLY once it was read. A failed or
 * pending read refuses the write: an empty library saved over an unread one
 * would erase everything this person added (the gap MnemoLaw still has).
 */
export async function persistLibrary(
  status: LibStatus,
  next: LibraryState,
  setState: (payload: { state: { library: LibraryState } }) => Promise<unknown>,
): Promise<'saved' | 'refused'> {
  if (status.kind !== 'ready') return 'refused';
  await setState({ state: { library: next } });
  return 'saved';
}
