/**
 * MnemoHealth (doc 135 §3quinquies): medical texts from public sources, in
 * memory, by sub-domain. Built on MnemoLaw's shape: home tiles, a view per
 * sub-domain, a source line under every memory, a JSON copy in the knowledge
 * folder the host gives the cartridge (never a folder the person is asked
 * for) with its ATTRIBUTION.md, and a resumable "add all". Each source is its
 * own Memory Pack vault ("MnemoHealth · Orphanet"), ticked under Knowledge
 * in the chat scope.
 *
 * The host calls live here; the screens only draw and call back. Nothing
 * downloads before a gesture. It quotes texts and gives no medical advice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';
import { useI18n } from './i18n/useI18n';
import { translate } from './i18n/strings';
import { fetchJson, fetchText, hostTextReader, HOST_FETCH_TIMEOUT_MS, sleep } from './lib/fetchers';
import {
  EMPTY_LIBRARY, SPINE, countedIn, newRecord, parseLibrary, persistLibrary, recordKey, resumeIndex, runEntries, withRecord,
  type HostPort, type LibStatus, type LibraryState, type SourceRecord,
} from './lib/library';
import { useClock } from './lib/useClock';
import { SOURCES } from './sources/catalogue';
import type { Entry, ReaderDeps, SourceDef, SourceId, SourceLang } from './sources/types';
import { S } from './ui/styles';
import { Home } from './ui/Home';
import { DomainView } from './ui/DomainView';
import { Footer } from './ui/Footer';
import { listKey, type Job, type LoadedList, type SourceActions, type VaultState, type View } from './ui/types';

// Must match "name" in mnemo-plugin.json: the host keys the sandbox and pack vaults on it.
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-health');

/** A chronicle write is a local IPC; 15 s is the house default (rule 9). */
const INGEST_TIMEOUT_MS = 15_000;
/** Same default for the small host calls (state, folder). */
const HOST_TIMEOUT_MS = 15_000;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const reader: ReaderDeps = {
  fetchJson,
  fetchText,
  hostText: hostTextReader((url) => sdk.invoke('social.fetch', { url }, HOST_FETCH_TIMEOUT_MS)),
  sleep,
};

const port: HostPort = {
  writeFile: (path, content) => sdk.writeFile(path, content),
  // Read like MnemoLaw: only an explicit `success: false` is a failure.
  mkdir: async (dirPath) => {
    const made = await sdk.invoke<{ success?: boolean; error?: string }>('dialog.mkdir', { dirPath }, HOST_TIMEOUT_MS);
    return { success: made?.success !== false, ...(made?.error ? { error: made.error } : {}) };
  },
  ingest: async (entry) => {
    await sdk.invoke('mnemosyne.ingest', { ...entry, spineType: SPINE }, INGEST_TIMEOUT_MS);
  },
};

export default function App() {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [lib, setLib] = useState<LibraryState>(EMPTY_LIBRARY);
  const [libStatus, setLibStatus] = useState<LibStatus>({ kind: 'loading' });
  const [vault, setVault] = useState<VaultState>({ kind: 'loading' });
  const [lists, setLists] = useState<Record<string, LoadedList>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [langBy, setLangBy] = useState<Partial<Record<SourceId, SourceLang>>>({});
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // The library as last saved, read by async steps that would otherwise write
  // back a copy taken before an await (two saves racing).
  const libRef = useRef(lib);
  libRef.current = lib;
  // Read by the saves, so a save never runs against a library nobody read.
  const libStatusRef = useRef(libStatus);
  libStatusRef.current = libStatus;
  // The language read by boot steps through a ref: changing it must not boot again.
  const langRef = useRef(lang);
  langRef.current = lang;
  // A boot answer that arrives after a newer boot or after unmount is dropped.
  const mountedRef = useRef(true);
  const vaultGenRef = useRef(0);
  const libGenRef = useRef(0);
  // Pack → vault name and folder, for this window's life (the host answers the same).
  const packVaults = useRef(new Map<string, { vault: string; folder: string | null }>());

  /**
   * The Memory Pack vault of a source, and the cartridge's folder under the
   * knowledge root. The person is never asked for a folder (Tony, 07/10).
   * Throws NO_KNOWLEDGE_ROOT when no knowledge folder was chosen yet: the
   * host then opens the Hub on Memory Packs, which asks.
   */
  const packVault = useCallback(async (pack: string): Promise<{ vault: string; folder: string | null }> => {
    const known = packVaults.current.get(pack);
    if (known) return known;
    // Medical texts are short and asked about in the person's own words: vectors stay on.
    const res = await sdk.invoke<{ vault?: string; folder?: string }>('vault.pack.ensure', { pack, lexicalOnly: false }, HOST_TIMEOUT_MS);
    if (!res || typeof res.vault !== 'string' || !res.vault) throw new Error('NO_PACK_VAULT');
    const found = { vault: res.vault, folder: typeof res.folder === 'string' && res.folder ? res.folder : null };
    packVaults.current.set(pack, found);
    return found;
  }, []);

  // ── Boot: durable library + the sandbox vault ─────────────────────────
  const bootVault = useCallback(() => {
    const gen = ++vaultGenRef.current;
    const current = () => mountedRef.current && gen === vaultGenRef.current;
    setVault({ kind: 'loading' });
    sdk.ensureSandbox()
      .then(({ vault: name, unlocked }) => {
        if (!current()) return undefined;
        setVault({ kind: 'ready', vault: name, unlocked });
        return sdk.describeVaultTile({ icon: '🩺', metrics: [{ label: translate(langRef.current, 'vault.metric'), spine: SPINE }] });
      })
      .catch((err) => {
        console.error('[mnemo-health] sandbox vault failed', err);
        if (current()) setVault({ kind: 'error', why: errText(err) });
      });
  }, []);

  const bootLibrary = useCallback(() => {
    const gen = ++libGenRef.current;
    const current = () => mountedRef.current && gen === libGenRef.current;
    setLibStatus({ kind: 'loading' });
    sdk.invoke('state.get', undefined, HOST_TIMEOUT_MS)
      .then((raw) => {
        if (!current()) return;
        setLib(parseLibrary(raw));
        setLibStatus({ kind: 'ready' });
      })
      .catch((err) => {
        console.error('[mnemo-health] state.get failed', err);
        if (current()) setLibStatus({ kind: 'error', why: errText(err) });
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    bootLibrary();
    bootVault();
    return () => { mountedRef.current = false; };
  }, [bootLibrary, bootVault]);

  // Cancel any running read when the window goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const saveLib = useCallback(async (next: LibraryState) => {
    try {
      const done = await persistLibrary(libStatusRef.current, next, (payload) => sdk.invoke('state.set', payload, HOST_TIMEOUT_MS));
      if (done === 'refused') {
        setNotice((n) => [...n, translate(langRef.current, 'lib.notSaved')]);
        return;
      }
      setLib(next);
      libRef.current = next;
    } catch (err) {
      console.error('[mnemo-health] state.set failed', err);
      setNotice((n) => [...n, translate(langRef.current, 'run.failed', { why: errText(err) })]);
    }
  }, []);

  const now = useClock(job !== null);

  /** The language a source is read in: the one chosen, else the interface's when the source has it, else English. */
  const langOf = useCallback((def: SourceDef): SourceLang => {
    const chosen = langBy[def.id];
    if (chosen && def.langs.includes(chosen)) return chosen;
    return (def.langs as readonly string[]).includes(lang) ? lang as SourceLang : def.langs[0]!;
  }, [langBy, lang]);

  const openExternal = (url: string) => {
    sdk.invoke('shell.openExternal', { url }, HOST_TIMEOUT_MS)
      .catch((err) => setNotice([t('run.failed', { why: errText(err) })]));
  };

  /** A failure, worded when it is one the person can act on. */
  const failureText = (err: unknown): string => {
    const why = errText(err);
    return why.includes('NO_KNOWLEDGE_ROOT') ? t('run.noKnowledgeRoot') : t('run.failed', { why });
  };

  // ── A list: a whole catalogue, or one page of a search ────────────────
  const loadList = async (source: SourceId, srcLang: SourceLang, query: string, offset: number) => {
    const def = SOURCES[source];
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setListError(null);
    setNotice([]);
    setJob({ kind: 'list', startedAt: Date.now(), source });
    try {
      const res = await def.list(reader, srcLang, query, ctrl.signal, offset);
      setLists((m) => ({ ...m, [listKey(source, srcLang)]: { ...res, query, offset } }));
    } catch (err) {
      if (!ctrl.signal.aborted) setListError(errText(err));
    } finally {
      setJob(null);
    }
  };

  // ── One entry, all of a catalogue, or all of a search page ────────────
  const runAdd = async (source: SourceId, srcLang: SourceLang, entries: Entry[], mode: 'pack' | 'list', counted?: (id: string) => boolean) => {
    if (vault.kind !== 'ready' || libStatusRef.current.kind !== 'ready' || entries.length === 0) return;
    setNotice([]);
    const def = SOURCES[source];
    let target: string;
    let folder: string;
    try {
      const pack = await packVault(def.name);
      // An older host answers no folder: said, never a guessed path.
      if (!pack.folder) throw new Error('NO_PACK_FOLDER');
      target = pack.vault;
      folder = pack.folder;
      const made = await port.mkdir(folder);
      if (!made.success) throw new Error(`MKDIR_FAILED: ${made.error ?? 'unknown'}`);
    } catch (err) {
      console.error('[mnemo-health] memory pack unavailable', def.id, err);
      setNotice([failureText(err)]);
      return;
    }
    // The footer shows where the copies go now. Files from an older chosen
    // folder stay where they are; new ones go to the pack folder.
    if (libRef.current.folder !== folder) await saveLib({ ...libRef.current, folder });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const key = recordKey(source, srcLang);
    let record: SourceRecord = libRef.current.records.find((r) => r.key === key) ?? newRecord(source, srcLang, new Date());
    // A finished run read everything: pressing again starts a fresh pass.
    // Same rule as the screen's "all read" line (resumeIndex), so the two never disagree.
    if (mode === 'pack' && record.pack && resumeIndex(entries, record.pack) >= entries.length) {
      const { pack: _done, ...rest } = record;
      record = rest;
    }
    const startedAt = Date.now();
    setJob({ kind: 'run', startedAt, source, startDone: 0, progress: { done: 0, total: entries.length, inVault: 0, skipped: 0, failed: 0, already: 0 } });
    let firstDone: number | null = null;
    try {
      const { record: end, progress } = await runEntries({
        reader, def, lang: srcLang, port, vault: target, folder, record, signal: ctrl.signal,
        save: (rec) => saveLib(withRecord(libRef.current, rec)),
        ...(counted ? { counted } : {}),
        onProgress: (p) => {
          if (firstDone === null) firstDone = p.done - 1;
          setJob({ kind: 'run', startedAt, source, startDone: firstDone, progress: p });
        },
      }, entries, mode);
      const lines = [t('run.done', { inVault: progress.inVault, skipped: progress.skipped, failed: progress.failed })];
      if (progress.already > 0) lines.push(t('run.already', { n: progress.already }));
      if (ctrl.signal.aborted) {
        lines.push(mode === 'pack' && end.pack
          ? t('run.stopped', { cursor: end.pack.cursor.toLocaleString(lang), total: end.pack.total.toLocaleString(lang) })
          : t('run.stoppedList'));
      }
      setNotice(lines);
    } catch (err) {
      setNotice([ctrl.signal.aborted ? t('run.stoppedList') : failureText(err)]);
    } finally {
      setJob(null);
    }
  };

  const actions: SourceActions = {
    onLoad: (source, srcLang, query, offset) => { void loadList(source, srcLang, query, offset); },
    onAddOne: (source, srcLang, entry, index) => {
      const list = lists[listKey(source, srcLang)];
      const rec = libRef.current.records.find((r) => r.key === recordKey(source, srcLang));
      // An entry already in memory (added alone, or passed by an "add all" run) is counted once, even when added again.
      const passed = !!list && countedIn(rec, list.entries, index);
      void runAdd(source, srcLang, [entry], 'list', passed ? (id) => id === entry.id : undefined);
    },
    onAddAll: (source, srcLang, entries, mode) => { void runAdd(source, srcLang, entries, mode); },
    onStop: () => abortRef.current?.abort(),
    onOpenLicence: openExternal,
    onLang: (source, l) => { setListError(null); setLangBy((m) => ({ ...m, [source]: l })); },
  };

  const go = (next: View) => { setNotice([]); setListError(null); setView(next); };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.title}>🩺 MnemoHealth</div>
        <div style={S.muted}>{t('app.subtitle')}</div>
      </header>

      {libStatus.kind === 'error' && (
        <section style={S.card} role="alert">
          <div style={S.error}>{t('lib.unreadable', { why: libStatus.why })}</div>
          <button style={S.link} onClick={bootLibrary}>{t('vault.retry')}</button>
        </section>
      )}

      {view.kind === 'home' && <Home t={t} lang={lang} lib={lib} libStatus={libStatus} onOpen={(domain) => go({ kind: 'domain', domain })} />}

      {view.kind === 'domain' && (
        <DomainView
          t={t}
          lang={lang}
          domain={view.domain}
          lib={lib}
          vault={vault}
          libReady={libStatus.kind === 'ready'}
          lists={lists}
          listError={listError}
          job={job}
          now={now}
          notice={notice}
          langOf={langOf}
          actions={actions}
          onBack={() => go({ kind: 'home' })}
        />
      )}

      <Footer
        t={t}
        vault={vault}
        folder={lib.folder}
        onRetryVault={bootVault}
        onOpenFolder={() => {
          if (!lib.folder) return;
          sdk.openInOS(lib.folder).then((r) => { if (!r?.success) console.error('[mnemo-health] open folder refused', r?.error); })
            .catch((err) => console.error('[mnemo-health] open folder failed', err));
        }}
      />
    </div>
  );
}
