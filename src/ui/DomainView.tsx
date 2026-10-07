/**
 * DomainView — one sub-domain: a tile per wired source (size, licence as the
 * source writes it, language), and under it the source's entries with a
 * search, "add to memory" for one entry, and "add all".
 *
 * Nothing downloads before a gesture. The running job shows what it measured
 * (entries read, seconds), never an invented percentage.
 */
import { useMemo, useState } from 'react';
import { S } from './styles';
import { listKey, type Job, type LoadedList, type SourceActions, type T, type VaultState } from './types';
import { DOMAIN_ICON, MEASURED_SIZE, sourcesOf } from '../sources/catalogue';
import { countedIn, recordKey, resumeIndex, type LibraryState } from '../lib/library';
import { formatDuration, remainingSeconds } from '../lib/eta';
import type { Domain, Entry, SourceDef, SourceLang } from '../sources/types';

/** Rows shown at once in a catalogue list: the rest is reached by the filter. */
const SHOWN = 60;

/** One sub-domain: its source tiles, each with its list, search and "add to memory". */
export function DomainView(props: {
  t: T;
  lang: string;
  domain: Domain;
  lib: LibraryState;
  vault: VaultState;
  /** False until the durable state was read: adding would overwrite what is stored. */
  libReady: boolean;
  lists: Record<string, LoadedList>;
  listError: string | null;
  job: Job | null;
  now: number;
  notice: string[];
  langOf: (def: SourceDef) => SourceLang;
  actions: SourceActions;
  onBack: () => void;
}) {
  const { t, domain } = props;
  return (
    <>
      <div><button style={S.link} disabled={!!props.job} onClick={props.onBack}>{props.t('nav.back')}</button></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }} aria-hidden="true">{DOMAIN_ICON[domain]}</span>
        <div style={S.tileName}>{t(`home.domain.${domain}` as const)}</div>
      </div>
      {sourcesOf(domain).map((def) => <SourcePanel key={def.id} {...props} def={def} />)}
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}

function JobCard({ t, lang, job, now, onStop }: { t: T; lang: string; job: Job; now: number; onStop: () => void }) {
  const seconds = Math.max(0, Math.round((now - job.startedAt) / 1000));
  let line: string;
  if (job.kind === 'list') {
    line = t('job.listing', { elapsed: formatDuration(seconds) });
  } else {
    const p = job.progress;
    line = t('job.reading', { done: p.done.toLocaleString(lang), total: p.total.toLocaleString(lang), elapsed: formatDuration(seconds) });
    const left = remainingSeconds(p.done - job.startDone, p.total - job.startDone, (now - job.startedAt) / 1000);
    if (left !== null) line = `${line} · ${t('job.eta', { left: formatDuration(left) })}`;
  }
  return (
    <section style={S.card} aria-live="polite">
      <div>{line}</div>
      <button style={{ ...S.ghost, alignSelf: 'flex-start' }} onClick={onStop}>{t('job.stop')}</button>
    </section>
  );
}

function SourcePanel(props: Parameters<typeof DomainView>[0] & { def: SourceDef }) {
  const { t, lang, def, lib, job, actions } = props;
  const srcLang = props.langOf(def);
  const key = listKey(def.id, srcLang);
  const list = props.lists[key] ?? null;
  const rec = lib.records.find((r) => r.key === recordKey(def.id, srcLang));
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState(list?.query ?? '');
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const busy = !!job;
  const canWrite = props.vault.kind === 'ready' && props.libReady && !busy;
  const size = MEASURED_SIZE[def.id];

  const filtered = useMemo(() => {
    if (!list) return [] as Array<{ entry: Entry; index: number }>;
    const all = list.entries.map((entry, index) => ({ entry, index }));
    const q = filter.trim().toLowerCase();
    return q ? all.filter(({ entry }) => entry.title.toLowerCase().includes(q) || entry.id.toLowerCase() === q) : all;
  }, [list, filter]);
  const shown = def.mode === 'catalogue' ? filtered.slice(0, SHOWN) : filtered;

  // PMC: the licences present on the page, for the person to accept or not.
  const licences = useMemo(() => {
    if (def.id !== 'pmc' || !list) return [] as string[];
    return [...new Set(list.entries.map((e) => e.extra?.licence).filter((l): l is string => !!l))].sort();
  }, [def.id, list]);
  const pmcAddable = (e: Entry) => !!e.extra?.version && e.extra?.retracted === '0' && !!e.extra?.licence && accepted.has(e.extra.licence);

  const resumeAt = rec?.pack && list ? resumeIndex(list.entries, rec.pack) : 0;
  const packComplete = !!rec?.pack && !!list && resumeAt >= list.entries.length;

  const rowNote = (e: Entry): string | null => {
    if (def.id === 'mesh' && !e.extra?.scope) return t('entry.noScope');
    if (def.id !== 'pmc') return null;
    if (e.extra?.error) return t('entry.noRecord', { why: e.extra.error });
    if (e.extra?.missing) return t('entry.missing');
    if (e.extra?.retracted === '1') return t('entry.retracted');
    return e.extra?.licence ? t('entry.licence', { licence: e.extra.licence }) : t('entry.noLicence');
  };
  const rowAddable = (e: Entry): boolean => {
    if (def.id === 'mesh') return !!e.extra?.scope;
    if (def.id === 'pmc') return !!e.extra?.version && e.extra?.retracted === '0';
    return true;
  };

  return (
    <>
      <section style={S.card}>
        <h2 style={S.h2}>{def.name}</h2>
        <div style={S.small}>{size ? t(`source.size.${def.id}` as const, { n: size.n.toLocaleString(lang), extra: (size.extra ?? 0).toLocaleString(lang) }) : t(`source.size.${def.id}` as const)}</div>
        {def.id === 'who' && <div style={S.small}>{t('source.whoNote')}</div>}
        <div style={S.small}>{t('source.licence')}</div>
        <div style={S.licence}>{def.licence}</div>
        <button style={S.link} onClick={() => actions.onOpenLicence(def.licenceUrl)}>{t('source.licenceRead')}</button>
        {def.langs.length > 1 ? (
          <label style={{ ...S.small, display: 'flex', gap: 8, alignItems: 'center' }}>
            {t('source.lang')}
            <select style={S.select} value={srcLang} disabled={busy} onChange={(e) => actions.onLang(def.id, e.target.value as SourceLang)}>
              {def.langs.map((l) => <option key={l} value={l}>{t(`lang.${l}` as const)}</option>)}
            </select>
          </label>
        ) : <div style={S.small}>{t('source.langOnly')}</div>}
      </section>

      {job && job.source === def.id && <JobCard t={t} lang={lang} job={job} now={props.now} onStop={actions.onStop} />}
      {props.notice.length > 0 && <section style={S.card} role="status">{props.notice.map((n, i) => <div key={i}>{n}</div>)}</section>}

      <section style={S.card}>
        {def.mode === 'catalogue' && !list && (
          <button style={S.button} disabled={busy} onClick={() => actions.onLoad(def.id, srcLang, '', 0)}>{t('list.load')}</button>
        )}
        {def.mode === 'search' && (
          <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (query.trim()) actions.onLoad(def.id, srcLang, query.trim(), 0); }}>
            <input style={{ ...S.input, flex: 1 }} value={query} placeholder={t(def.id === 'mesh' ? 'search.placeholder.mesh' : 'search.placeholder.pmc')} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit" style={S.button} disabled={busy || !query.trim()}>{t('search.button')}</button>
          </form>
        )}
        {props.listError && <div style={S.error}>{t('list.failed', { why: props.listError })}</div>}

        {list && def.mode === 'catalogue' && (
          <>
            <div style={S.small}>{t('list.count', { n: list.entries.length.toLocaleString(lang) })}</div>
            <button style={S.button} disabled={!canWrite} onClick={() => actions.onAddAll(def.id, srcLang, list.entries, 'pack')}>
              {rec?.pack && !packComplete
                ? t('all.resume', { cursor: resumeAt.toLocaleString(lang), total: list.entries.length.toLocaleString(lang) })
                : t('all.button', { n: list.entries.length.toLocaleString(lang) })}
            </button>
            {packComplete && <div style={S.small}>{t('all.complete', { total: list.entries.length.toLocaleString(lang) })}</div>}
            <div style={S.small}>{t('all.hint')}</div>
            <input style={S.input} value={filter} placeholder={t('list.filter')} onChange={(e) => setFilter(e.target.value)} />
            {filter.trim() && filtered.length === 0 && <div style={S.muted}>{t('list.none', { q: filter.trim() })}</div>}
          </>
        )}

        {list && def.mode === 'search' && (
          <>
            {list.entries.length === 0 && <div style={S.muted}>{t('search.none', { q: list.query })}</div>}
            {list.total !== null && list.entries.length > 0 && <div style={S.small}>{t('search.total', { n: list.total.toLocaleString(lang) })}</div>}
            {def.id === 'pmc' && licences.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={S.small}>{t('pmc.choose')}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {licences.map((l) => (
                    <label key={l} style={{ ...S.small, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="checkbox" checked={accepted.has(l)} onChange={(e) => setAccepted((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(l); else next.delete(l);
                        return next;
                      })} />
                      {l}
                    </label>
                  ))}
                </div>
                {accepted.size === 0 && <div style={S.small}>{t('pmc.chooseNone')}</div>}
              </div>
            )}
            {list.entries.length > 0 && (() => {
              const batch = def.id === 'pmc' ? list.entries.filter(pmcAddable) : list.entries.filter(rowAddable);
              return (
                <button style={S.button} disabled={!canWrite || batch.length === 0} onClick={() => actions.onAddAll(def.id, srcLang, batch, 'list')}>
                  {t('all.listed', { n: batch.length })}
                </button>
              );
            })()}
          </>
        )}

        {list && (
          <ul style={S.list}>
            {shown.map(({ entry, index }) => {
              const counted = countedIn(rec, list.entries, index);
              const note = rowNote(entry);
              return (
                <li key={entry.id} style={S.row}>
                  <span>
                    {entry.title}
                    {def.id === 'pmc' && entry.extra?.journal && <span style={S.muted}> · {entry.extra.journal}{entry.extra.pubdate ? `, ${entry.extra.pubdate}` : ''}</span>}
                    {note && <span style={S.muted}> · {note}</span>}
                    {counted && <span style={S.muted}> · ✓ {t('entry.inMemory')}</span>}
                  </span>
                  <button style={S.ghost} disabled={!canWrite || !rowAddable(entry)} onClick={() => actions.onAddOne(def.id, srcLang, entry, index)}>
                    {counted ? t('entry.addAgain') : t('entry.add')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list && def.mode === 'catalogue' && filtered.length > SHOWN && (
          <div style={S.small}>{t('list.more', { n: (filtered.length - SHOWN).toLocaleString(lang) })}</div>
        )}
        {list && def.mode === 'search' && def.pageSize && list.entries.length > 0 && (
          <div style={{ display: 'flex', gap: 10 }}>
            {list.offset > 0 && (
              <button style={S.ghost} disabled={busy} onClick={() => actions.onLoad(def.id, srcLang, list.query, Math.max(0, list.offset - def.pageSize!))}>{t('search.prev')}</button>
            )}
            {list.total !== null && list.offset + def.pageSize < list.total && (
              <button style={S.ghost} disabled={busy} onClick={() => actions.onLoad(def.id, srcLang, list.query, list.offset + def.pageSize!)}>{t('search.next', { n: def.pageSize })}</button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
