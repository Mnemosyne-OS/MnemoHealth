/**
 * healthAgent.ts — what an agent may do in MnemoHealth (doc 149), as plain functions over the
 * app's own state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `HealthAgentActions` while the window is open.
 *
 * 🚨 Every move is the one the person's own control makes: a sub-domain opens through `go` (a
 * home tile), a list or a search through `loadList` (« Load the list », « Search »), one entry
 * through `addOne` (its « Add »), the rest through the « Add all » button's `onAddAll`, the
 * language through the source's language menu, and Stop is the job line's Stop. The view moves
 * to the source's sub-domain first, so the person sees the list and the job line.
 *
 * ⛔ PubMed Central is listed but never added by an agent: its articles go in only under the
 * licences the person ticks on screen, and that choice is theirs.
 *
 * 🗣️ By voice (doc 149 §19) the orb never reads the app first: `add` takes an entry by its title
 * as the person says it (an id still works), several matches are refused AMBIGUOUS with their
 * names, and the paging, language and home moves are the buttons the person would press.
 *
 * Refusals throw `CODE: reason`. It quotes texts and gives no medical advice.
 */
import { DOMAINS, MEASURED_SIZE, SOURCES, sourcesOf } from '../sources/catalogue';
import { countedIn, recordKey, type LibStatus, type LibraryState } from '../lib/library';
import type { Domain, Entry, SourceDef, SourceId, SourceLang } from '../sources/types';
import { findNamed } from './agentFind';
import { entryAddable, listKey, type Job, type LoadedList, type VaultState, type View } from './types';

/** How long a call waits for a list or an entry before it answers « still running » (the host gives 60 s). */
export const AGENT_WAIT_MS = 45_000;
/** How many entries one page carries at most: what the manifest declares as `limit`'s maximum. */
export const ENTRIES_MAX = 200;
const ENTRIES_DEFAULT = 30;
/** The sources an agent may name: what the manifest declares as `source`'s enum. */
export const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];

/** The app's state and its own moves, read fresh at every call. */
export interface HealthAgentContext {
  view: View;
  libStatus: LibStatus;
  vault: VaultState;
  lib: LibraryState;
  lists: Record<string, LoadedList>;
  listError: string | null;
  job: Job | null;
  notice: string[];
  langOf: (def: SourceDef) => SourceLang;
  setLang: (source: SourceId, lang: SourceLang) => void;
  go: (next: View) => void;
  loadList: (source: SourceId, lang: SourceLang, query: string, offset: number) => Promise<void>;
  addOne: (source: SourceId, lang: SourceLang, entry: Entry, index: number) => Promise<void>;
  addAll: (source: SourceId, lang: SourceLang, entries: Entry[], mode: 'pack' | 'list') => void;
  stop: () => void;
}

/** The promise's end if it comes within `ms`, else `running` (the work goes on and is shown on screen). */
export async function within<T>(p: Promise<T>, ms: number): Promise<{ done: true } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ done: false }>((resolve) => { timer = setTimeout(() => resolve({ done: false }), ms); });
  try {
    return await Promise.race([p.then(() => ({ done: true as const })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A whole number within bounds, the default when absent. */
export function bounded(v: unknown, min: number, max: number, dflt: number, what: string): number {
  if (v === undefined) return dflt;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`BAD_ARG: ${what} must be a whole number from ${min} to ${max}`);
  return v;
}

/** The source and language of a call, checked against what the source is read in. */
export function resolveSource(args: Record<string, unknown>, langOf: (def: SourceDef) => SourceLang): { def: SourceDef; lang: SourceLang; key: string } {
  const id = args.source;
  if (typeof id !== 'string' || !(SOURCE_IDS as string[]).includes(id)) throw new Error(`NOT_FOUND: no source "${String(id)}"; sources: ${SOURCE_IDS.join(', ')}`);
  const def = SOURCES[id as SourceId];
  if (args.lang !== undefined && !(def.langs as readonly unknown[]).includes(args.lang)) throw new Error(`BAD_ARG: ${def.name} is read in ${def.langs.join(', ')}`);
  const lang = (args.lang as SourceLang | undefined) ?? langOf(def);
  return { def, lang, key: listKey(def.id, lang) };
}

/** A job, as an agent reads it. */
export function jobLine(job: Job | null) {
  if (!job) return null;
  const seconds = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
  if (job.kind === 'list') return { kind: 'listing', source: job.source, seconds };
  return { kind: 'adding', source: job.source, ...job.progress, seconds };
}

/** The handlers `sdk.onAgentActions` serves, over a context read fresh at every call. */
export function healthAgentHandlers(get: () => HealthAgentContext) {
  const loaded = (c: HealthAgentContext, key: string) => {
    const list = c.lists[key];
    if (!list) throw new Error(`NO_LIST: the list of ${key} is not loaded; call loadList first`);
    return list;
  };
  const canAdd = (c: HealthAgentContext, def: SourceDef) => {
    if (def.id === 'pmc') throw new Error('LICENCE_CHOICE: PubMed Central articles go into memory only under the licences the person ticks on screen; ask the person to add them');
    if (c.vault.kind !== 'ready') throw new Error(`NO_VAULT: the cartridge's vault is ${c.vault.kind === 'error' ? `unavailable (${c.vault.why})` : 'not ready yet'}`);
    if (c.libStatus.kind !== 'ready') throw new Error(`NOT_READY: the record of what is already in memory is ${c.libStatus.kind === 'error' ? `unreadable (${c.libStatus.why})` : 'still being read'}; nothing is added until it is read`);
    if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
  };
  /** The source's sub-domain on screen, in the language asked, so the person sees what happens. */
  const show = (c: HealthAgentContext, def: SourceDef, lang: SourceLang) => {
    if (c.view.kind !== 'domain' || c.view.domain !== def.domain) c.go({ kind: 'domain', domain: def.domain });
    if (c.langOf(def) !== lang) c.setLang(def.id, lang);
  };
  const entryLine = (c: HealthAgentContext, def: SourceDef, lang: SourceLang, list: LoadedList, e: Entry, index: number) => ({
    id: e.id,
    title: e.title,
    inMemory: countedIn(c.lib.records.find((r) => r.key === recordKey(def.id, lang)), list.entries, index),
    ...(entryAddable(def.id, e) ? {} : { addable: false }),
    ...(def.id === 'pmc' && e.extra?.licence ? { licence: e.extra.licence } : {}),
  });

  /** The app's own list read (« Load », « Search », « Next »), answered once the list is on screen. */
  const readList = async (c: HealthAgentContext, def: SourceDef, lang: SourceLang, key: string, query: string, offset: number) => {
    const end = await within(c.loadList(def.id, lang, query, offset), AGENT_WAIT_MS);
    if (!end.done) return { running: true, note: 'The list is still being read on screen; call status, then entries.' };
    const after = get();
    if (after.listError) throw new Error(`LIST_FAILED: ${after.listError}`);
    if (!after.lists[key]) throw new Error('STOPPED: the list was stopped before it was read');
    const list = loaded(after, key);
    return {
      source: key,
      entries: list.entries.length,
      ...(list.total !== null ? { total: list.total } : {}),
      ...(def.mode === 'search' ? { query: list.query, offset: list.offset, pageSize: def.pageSize ?? null } : {}),
      first: list.entries.slice(0, ENTRIES_DEFAULT).map((e, i) => entryLine(after, def, lang, list, e, i)),
    };
  };

  return {
    // agent-actions:begin
    status: () => {
      const c = get();
      return {
        screen: c.view.kind === 'domain' ? { domain: c.view.domain } : 'home',
        vault: c.vault.kind === 'error' ? `unavailable: ${c.vault.why}` : c.vault.kind,
        library: c.libStatus.kind === 'ready' ? 'read' : c.libStatus.kind === 'loading' ? 'reading' : `unreadable: ${c.libStatus.why}`,
        job: jobLine(c.job),
        onScreen: c.notice,
        folder: c.lib.folder,
        inMemory: c.lib.records.map((r) => ({
          source: r.source, lang: r.lang, inVault: r.inVault, failed: r.failed, skipped: r.skipped, updatedAt: r.updatedAt,
          ...(r.pack ? { addAll: { at: r.pack.cursor, of: r.pack.total } } : {}),
        })),
      };
    },

    sources: () => {
      const c = get();
      return DOMAINS.map((domain) => ({
        domain,
        sources: sourcesOf(domain).map((def) => ({
          source: def.id, name: def.name, kind: def.mode === 'catalogue' ? 'a whole catalogue' : 'searched by words',
          langs: [...def.langs], langOnScreen: c.langOf(def), licence: def.licence,
          ...(MEASURED_SIZE[def.id] ? { measuredSize: MEASURED_SIZE[def.id]!.n } : {}),
        })),
      }));
    },

    openDomain: (args: Record<string, unknown>) => {
      const d = args.domain;
      if (typeof d !== 'string' || !(DOMAINS as readonly string[]).includes(d)) throw new Error(`NOT_FOUND: no domain "${String(d)}"; domains: ${DOMAINS.join(', ')}`);
      const c = get();
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      c.go({ kind: 'domain', domain: d as Domain });
      return { shown: d };
    },

    loadList: async (args: Record<string, unknown>) => {
      const c = get();
      const { def, lang, key } = resolveSource(args, c.langOf);
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (def.mode === 'search' && !query) throw new Error(`BAD_ARG: ${def.name} is searched by words: give query`);
      if (def.mode === 'catalogue' && (query || args.offset !== undefined)) throw new Error(`BAD_ARG: ${def.name} is a whole catalogue: load it without query or offset, then narrow it with entries`);
      const offset = bounded(args.offset, 0, 100_000, 0, 'offset');
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      show(c, def, lang);
      const prior = c.lists[key];
      if (def.mode === 'catalogue' && prior) {
        return { source: key, alreadyLoaded: true, entries: prior.entries.length, first: prior.entries.slice(0, ENTRIES_DEFAULT).map((e, i) => entryLine(c, def, lang, prior, e, i)) };
      }
      return readList(c, def, lang, key, query, offset);
    },

    turnPage: async (args: Record<string, unknown>) => {
      const c = get();
      const { def, lang, key } = resolveSource(args, c.langOf);
      if (def.mode !== 'search') throw new Error(`BAD_ARG: ${def.name} is a whole catalogue on one page: narrow it with entries`);
      if (!def.pageSize) throw new Error(`BAD_ARG: ${def.name} answers a search in one page: search other words with loadList`);
      const dir = args.direction;
      if (dir !== 'next' && dir !== 'previous') throw new Error('BAD_ARG: direction is next or previous');
      const list = loaded(c, key);
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      // The same bounds as the « Previous » / « Next » buttons, which are not drawn past them.
      if (dir === 'previous' && list.offset <= 0) throw new Error(`FIRST_PAGE: this is the first page of "${list.query}" in ${def.name}`);
      if (dir === 'next' && (list.total === null || list.offset + def.pageSize >= list.total)) throw new Error(`LAST_PAGE: no page after this one for "${list.query}" in ${def.name}`);
      const offset = dir === 'next' ? list.offset + def.pageSize : Math.max(0, list.offset - def.pageSize);
      show(c, def, lang);
      return readList(c, def, lang, key, list.query, offset);
    },

    setLanguage: (args: Record<string, unknown>) => {
      const c = get();
      if (args.lang === undefined) throw new Error('BAD_ARG: give lang');
      const { def, lang } = resolveSource(args, c.langOf);
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      // Through the source's language menu: its domain on screen first, so the person sees it change.
      if (c.view.kind !== 'domain' || c.view.domain !== def.domain) c.go({ kind: 'domain', domain: def.domain });
      if (c.langOf(def) !== lang) c.setLang(def.id, lang);
      return { source: def.id, lang, loaded: !!c.lists[listKey(def.id, lang)] };
    },

    showHome: () => {
      const c = get();
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      c.go({ kind: 'home' });
      return { shown: 'home' };
    },

    entries: (args: Record<string, unknown>) => {
      const c = get();
      const { def, lang, key } = resolveSource(args, c.langOf);
      const limit = bounded(args.limit, 1, ENTRIES_MAX, ENTRIES_DEFAULT, 'limit');
      const offset = bounded(args.offset, 0, 1_000_000, 0, 'offset');
      const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
      const list = loaded(c, key);
      const all = list.entries.map((e, i) => ({ e, i }));
      const matching = q ? all.filter(({ e }) => e.title.toLowerCase().includes(q) || e.id.toLowerCase() === q) : all;
      return {
        source: key,
        total: list.entries.length,
        matching: matching.length,
        entries: matching.slice(offset, offset + limit).map(({ e, i }) => entryLine(c, def, lang, list, e, i)),
      };
    },

    add: async (args: Record<string, unknown>) => {
      const c = get();
      const { def, lang, key } = resolveSource(args, c.langOf);
      const ref = typeof args.entryId === 'string' ? args.entryId : '';
      const list = loaded(c, key);
      // An id, or the title as the person says it (« la mucoviscidose »); several titles are refused by name.
      const entry = findNamed(list.entries.map((e) => ({ item: e, id: e.id, names: [e.title], label: `${e.title} (${e.id})` })), ref,
        { code: 'NO_ENTRY', noun: `entry in the list of ${key}`, plural: 'entries' });
      const index = list.entries.indexOf(entry);
      const id = entry.id;
      canAdd(c, def);
      if (!entryAddable(def.id, entry)) throw new Error(`NO_TEXT: "${entry.title}" has nothing the source lets us put in memory`);
      show(c, def, lang);
      const end = await within(c.addOne(def.id, lang, entry, index), AGENT_WAIT_MS);
      if (!end.done) return { running: true, title: entry.title, note: 'Still being added on screen; call status.' };
      const after = get();
      // A run that ended without the entry in memory (no text at the source, a refused write) is said, never reported done.
      if (!countedIn(after.lib.records.find((r) => r.key === recordKey(def.id, lang)), list.entries, index)) {
        throw new Error(`WRITE_FAILED: "${entry.title}" did not reach memory${after.notice.length ? `; on screen: ${after.notice.join(' ')}` : ''}`);
      }
      return { id, title: entry.title, inMemory: true, onScreen: after.notice };
    },

    addAll: (args: Record<string, unknown>) => {
      const c = get();
      const { def, lang, key } = resolveSource(args, c.langOf);
      const list = loaded(c, key);
      canAdd(c, def);
      const batch = def.mode === 'catalogue' ? list.entries : list.entries.filter((e) => entryAddable(def.id, e));
      if (batch.length === 0) throw new Error(`NOTHING_TO_ADD: no entry of this list of ${key} has a text to put in memory`);
      show(c, def, lang);
      c.addAll(def.id, lang, batch, def.mode === 'catalogue' ? 'pack' : 'list');
      return {
        started: true, source: key, entries: batch.length,
        note: def.mode === 'catalogue'
          ? 'The whole catalogue runs on screen while MnemoHealth stays open, from where it last stopped; call status for progress, stop to stop.'
          : 'This page of results runs on screen; call status for progress, stop to stop.',
      };
    },

    stop: () => {
      const c = get();
      if (!c.job) return { stopped: false, note: 'nothing is running' };
      c.stop();
      return { stopped: true, was: jobLine(c.job) };
    },
    // agent-actions:end
  };
}
