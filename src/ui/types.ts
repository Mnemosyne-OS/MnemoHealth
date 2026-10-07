/**
 * Shared types of the MnemoHealth screens. Types only (plus one pure helper),
 * so the .tsx files keep exporting components alone (Fast Refresh).
 */
import type { Key } from '../i18n/strings';
import type { RunProgress } from '../lib/library';
import type { Domain, Entry, ListResult, SourceId, SourceLang } from '../sources/types';

/** The translator handed down from App. */
export type T = (key: Key, vars?: Record<string, string | number>) => string;

export type View = { kind: 'home' } | { kind: 'domain'; domain: Domain };

/** A long step in progress, shown with what it measured so far, never a percentage. */
export type Job =
  | { kind: 'list'; startedAt: number; source: SourceId }
  | { kind: 'run'; startedAt: number; source: SourceId; startDone: number; progress: RunProgress };

export type VaultState =
  | { kind: 'loading' }
  | { kind: 'ready'; vault: string; unlocked: boolean }
  | { kind: 'error'; why: string };

/** A loaded list, with the query and page that produced it (search sources). */
export interface LoadedList extends ListResult {
  query: string;
  offset: number;
}

/** Key of a list or a record: a source in one language. */
export function listKey(source: SourceId, lang: SourceLang): string {
  return `${source}|${lang}`;
}

/** The callbacks a source panel needs from App. */
export interface SourceActions {
  onLoad: (source: SourceId, lang: SourceLang, query: string, offset: number) => void;
  onAddOne: (source: SourceId, lang: SourceLang, entry: Entry, index: number) => void;
  onAddAll: (source: SourceId, lang: SourceLang, entries: Entry[], mode: 'pack' | 'list') => void;
  onStop: () => void;
  onOpenLicence: (url: string) => void;
  onLang: (source: SourceId, lang: SourceLang) => void;
}
