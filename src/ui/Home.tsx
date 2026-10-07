/**
 * Home — one tile per sub-domain. A tile says what is already in memory for
 * it (entries and the date of the last addition), read from the durable
 * state. Nothing in memory says so; it is never a zero dressed as a measure
 * of the source.
 */
import { S } from './styles';
import type { T } from './types';
import { DOMAINS, DOMAIN_ICON, SOURCES } from '../sources/catalogue';
import type { LibStatus, LibraryState } from '../lib/library';
import type { Domain } from '../sources/types';

/** Entries in memory for a domain, and the latest update; null when nothing was ever added. */
function domainSummary(lib: LibraryState, domain: Domain): { n: number; at: string } | null {
  const recs = lib.records.filter((r) => SOURCES[r.source].domain === domain);
  if (recs.length === 0) return null;
  const n = recs.reduce((sum, r) => sum + r.inVault, 0);
  if (n === 0) return null;
  const at = recs.map((r) => r.updatedAt).sort().at(-1)!;
  return { n, at };
}

/** The home screen: one tile per sub-domain, with what is in memory once the state was read. */
export function Home({ t, lang, lib, libStatus, onOpen }: {
  t: T;
  lang: string;
  lib: LibraryState;
  /** Until the state is read, a tile never says "nothing in memory": nobody looked yet. */
  libStatus: LibStatus;
  onOpen: (domain: Domain) => void;
}) {
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang);
  };
  return (
    <>
      <p style={S.p}>{t('home.lead')}</p>
      <div style={S.grid}>
        {DOMAINS.map((domain) => {
          const sum = domainSummary(lib, domain);
          return (
            <button key={domain} style={S.tile} onClick={() => onOpen(domain)}>
              <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">{DOMAIN_ICON[domain]}</span>
              <span style={S.tileName}>{t(`home.domain.${domain}` as const)}</span>
              <span style={S.small}>{t(`home.hint.${domain}` as const)}</span>
              <span style={S.small}>{libStatus.kind === 'loading' ? t('home.reading')
                : libStatus.kind === 'error' ? t('home.unreadable')
                  : sum ? t('home.inMemory', { n: sum.n.toLocaleString(lang), date: fmtDate(sum.at) }) : t('home.nothingYet')}</span>
            </button>
          );
        })}
      </div>
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}
