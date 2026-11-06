/**
 * MnemoHealth's agent handlers (doc 149): each one goes through the app's own move, shows the
 * domain first, never adds what the person must choose (PubMed Central's licences), and refuses
 * by name.
 */
import { describe, it, expect, vi } from 'vitest';
import { bounded, healthAgentHandlers, resolveSource, within, type HealthAgentContext } from './healthAgent';
import type { LibraryState } from '../lib/library';
import { SOURCES } from '../sources/catalogue';
import type { SourceDef } from '../sources/types';

const orpha = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `O${i}`, title: `Disease ${i}` }));
const lib = (done: string[] = []): LibraryState => ({
  folder: 'D:/K/mnemo-health',
  records: [{ key: 'orphanet|fr', source: 'orphanet', lang: 'fr', inVault: done.length, failed: 0, skipped: 0, updatedAt: '2026-10-12', done }],
});

function ctx(over: Partial<HealthAgentContext> = {}): HealthAgentContext {
  return {
    view: { kind: 'home' },
    libStatus: { kind: 'ready' },
    vault: { kind: 'ready', vault: 'v', unlocked: true },
    lib: lib(['O1']),
    lists: { 'orphanet|fr': { entries: orpha(3), total: 3, query: '', offset: 0 } },
    listError: null,
    job: null,
    notice: [],
    langOf: (def: SourceDef) => (def.id === 'orphanet' ? 'fr' : 'en'),
    setLang: vi.fn(),
    go: vi.fn(),
    loadList: vi.fn(async () => undefined),
    addOne: vi.fn(async () => undefined),
    addAll: vi.fn(),
    stop: vi.fn(),
    ...over,
  };
}
const H = (c: HealthAgentContext) => healthAgentHandlers(() => c);

describe('resolveSource and bounded', () => {
  it('takes the language on screen when none is given, and refuses one the source is not read in', () => {
    const c = ctx();
    expect(resolveSource({ source: 'orphanet' }, c.langOf)).toMatchObject({ lang: 'fr', key: 'orphanet|fr' });
    expect(() => resolveSource({ source: 'nimh', lang: 'fr' }, c.langOf)).toThrow(/^BAD_ARG: NIMH is read in en/);
    expect(() => resolveSource({ source: 'cochrane' }, c.langOf)).toThrow(/^NOT_FOUND: .*orphanet, nimh, who, mesh, pmc/);
  });
  it('bounded never takes a negative or oversized number', () => {
    expect(() => bounded(-1, 0, 10, 0, 'offset')).toThrow(/^BAD_ARG/);
    expect(() => bounded(11, 0, 10, 0, 'offset')).toThrow(/^BAD_ARG/);
    expect(bounded(10, 0, 10, 0, 'offset')).toBe(10);
  });
  it('within answers running when the work outlasts the wait', async () => {
    vi.useFakeTimers();
    const slow = within(new Promise(() => undefined), 10);
    vi.advanceTimersByTime(11);
    await expect(slow).resolves.toEqual({ done: false });
    vi.useRealTimers();
  });
});

describe('loadList', () => {
  it('shows the domain, switches the language, and searches MeSH through the app\'s loadList', async () => {
    const c = ctx({ lists: {} });
    c.loadList = vi.fn(async () => { c.lists = { 'mesh|en': { entries: [{ id: 'D1', title: 'Anxiety', extra: { scope: 'x' } }], total: 41, query: 'anxiety', offset: 0 } }; });
    const out = await H(c).loadList({ source: 'mesh', query: ' anxiety ' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'domain', domain: 'vocab' });
    expect(c.loadList).toHaveBeenCalledWith('mesh', 'en', 'anxiety', 0);
    expect(out).toMatchObject({ entries: 1, total: 41 });
    const fr = ctx({ lists: {} });
    // A list stopped before it was read leaves nothing: said, never « call loadList first ».
    await expect(H(fr).loadList({ source: 'who', lang: 'fr' })).rejects.toThrow(/^STOPPED/);
    expect(fr.setLang).toHaveBeenCalledWith('who', 'fr');
    expect(fr.loadList).toHaveBeenCalledWith('who', 'fr', '', 0);
  });

  it('refuses a search without words, a catalogue with words, a running job, and says a failed list', async () => {
    await expect(H(ctx()).loadList({ source: 'pmc' })).rejects.toThrow(/^BAD_ARG: .*give query/);
    await expect(H(ctx()).loadList({ source: 'who', query: 'malaria' })).rejects.toThrow(/^BAD_ARG: .*whole catalogue/);
    const busy = ctx({ job: { kind: 'list', startedAt: 0, source: 'who' } });
    await expect(H(busy).loadList({ source: 'nimh' })).rejects.toThrow(/^BUSY/);
    expect(busy.loadList).not.toHaveBeenCalled();
    const failing = ctx({ lists: {} });
    failing.loadList = vi.fn(async () => { failing.listError = 'HTTP 503'; });
    await expect(H(failing).loadList({ source: 'nimh' })).rejects.toThrow(/^LIST_FAILED: HTTP 503/);
  });

  it('a catalogue already on screen is answered without reading it again', async () => {
    const c = ctx();
    await expect(H(c).loadList({ source: 'orphanet' })).resolves.toMatchObject({ alreadyLoaded: true, entries: 3 });
    expect(c.loadList).not.toHaveBeenCalled();
  });
});

describe('entries, add, addAll, stop', () => {
  it('entries pages with each entry\'s state', () => {
    const out = H(ctx()).entries({ source: 'orphanet', limit: 2, offset: 1 });
    expect(out.entries).toEqual([{ id: 'O1', title: 'Disease 1', inMemory: true }, { id: 'O2', title: 'Disease 2', inMemory: false }]);
    expect(() => H(ctx()).entries({ source: 'who' })).toThrow(/^NO_LIST/);
    expect(() => H(ctx()).entries({ source: 'orphanet', limit: 0 })).toThrow(/^BAD_ARG/);
  });

  it('add goes through addOne with the row\'s index and says what reached memory', async () => {
    const c = ctx({ lib: lib([]) });
    c.addOne = vi.fn(async () => { c.lib = lib(['O2']); c.notice = ['1 in memory']; });
    await expect(H(c).add({ source: 'orphanet', entryId: 'O2' })).resolves.toEqual({ id: 'O2', title: 'Disease 2', inMemory: true, onScreen: ['1 in memory'] });
    expect(c.addOne).toHaveBeenCalledWith('orphanet', 'fr', { id: 'O2', title: 'Disease 2' }, 2);
    expect(c.go).toHaveBeenCalledWith({ kind: 'domain', domain: 'rare' });
  });

  it('add refuses PubMed Central, no vault, an unread library, a running job, a row with no text, an unknown id', async () => {
    const pmc = ctx({ lists: { 'pmc|en': { entries: [{ id: 'P1', title: 'A', extra: { version: '1', retracted: '0', licence: 'CC BY' } }], total: 1, query: 'a', offset: 0 } } });
    await expect(H(pmc).add({ source: 'pmc', entryId: 'P1' })).rejects.toThrow(/^LICENCE_CHOICE/);
    expect(() => H(pmc).addAll({ source: 'pmc' })).toThrow(/^LICENCE_CHOICE/);
    expect(pmc.addOne).not.toHaveBeenCalled();
    await expect(H(ctx({ vault: { kind: 'loading' } })).add({ source: 'orphanet', entryId: 'O2' })).rejects.toThrow(/^NO_VAULT/);
    await expect(H(ctx({ libStatus: { kind: 'error', why: 'EIO' } })).add({ source: 'orphanet', entryId: 'O2' })).rejects.toThrow(/^NOT_READY: .*EIO/);
    const busy = ctx({ job: { kind: 'list', startedAt: 0, source: 'who' } });
    await expect(H(busy).add({ source: 'orphanet', entryId: 'O2' })).rejects.toThrow(/^BUSY/);
    expect(busy.addOne).not.toHaveBeenCalled();
    const mesh = ctx({ lists: { 'mesh|en': { entries: [{ id: 'D1', title: 'Fear' }], total: 1, query: 'fear', offset: 0 } } });
    await expect(H(mesh).add({ source: 'mesh', entryId: 'D1' })).rejects.toThrow(/^NO_TEXT/);
    await expect(H(ctx()).add({ source: 'orphanet', entryId: 'O9' })).rejects.toThrow(/^NO_ENTRY: .*Disease 0 \(O0\)/);
  });

  it('addAll runs a catalogue as a pack and a search page as a list of what has a text', () => {
    const c = ctx();
    expect(H(c).addAll({ source: 'orphanet' })).toMatchObject({ started: true, entries: 3 });
    expect(c.addAll).toHaveBeenCalledWith('orphanet', 'fr', orpha(3), 'pack');
    const mesh = ctx({ lists: { 'mesh|en': { entries: [{ id: 'D1', title: 'Fear' }, { id: 'D2', title: 'Joy', extra: { scope: 's' } }], total: 2, query: 'f', offset: 0 } } });
    H(mesh).addAll({ source: 'mesh' });
    expect(mesh.addAll).toHaveBeenCalledWith('mesh', 'en', [{ id: 'D2', title: 'Joy', extra: { scope: 's' } }], 'list');
    const empty = ctx({ lists: { 'mesh|en': { entries: [{ id: 'D1', title: 'Fear' }], total: 1, query: 'f', offset: 0 } } });
    expect(() => H(empty).addAll({ source: 'mesh' })).toThrow(/^NOTHING_TO_ADD/);
  });

  it('openDomain refuses during a job; stop stops only what runs', () => {
    const busy = ctx({ job: { kind: 'list', startedAt: 0, source: 'who' } });
    expect(() => H(busy).openDomain({ domain: 'who' })).toThrow(/^BUSY/);
    expect(H(busy).stop()).toMatchObject({ stopped: true });
    const idle = ctx();
    expect(H(idle).stop()).toMatchObject({ stopped: false });
    expect(idle.stop).not.toHaveBeenCalled();
    expect(H(idle).openDomain({ domain: 'who' })).toEqual({ shown: 'who' });
  });
});

describe('by voice: titles, pages, language, home (doc 149 §19)', () => {
  const rare = { entries: [{ id: '586', title: 'Mucoviscidose' }, { id: '558', title: 'Syndrome de Marfan' }, { id: '2849', title: 'Syndrome de Marfan néonatal' }], total: 3, query: '', offset: 0 };

  it('add takes the title as the person says it, through the same addOne', async () => {
    const c = ctx({ lists: { 'orphanet|fr': rare }, lib: lib([]) });
    c.addOne = vi.fn(async () => { c.lib = lib(['586']); });
    await expect(H(c).add({ source: 'orphanet', entryId: 'la mucoviscidose' })).resolves.toMatchObject({ id: '586', inMemory: true });
    expect(c.addOne).toHaveBeenCalledWith('orphanet', 'fr', rare.entries[0], 0);
  });

  it('add refuses a title several entries hold, with their titles and ids, and adds nothing', async () => {
    const c = ctx({ lists: { 'orphanet|fr': rare } });
    await expect(H(c).add({ source: 'orphanet', entryId: 'Marfan' })).rejects.toThrow(
      /^AMBIGUOUS: "Marfan" names several entries: Syndrome de Marfan \(558\), Syndrome de Marfan néonatal \(2849\); say which/,
    );
    expect(c.addOne).not.toHaveBeenCalled();
  });

  it('add never reports done when the entry did not reach memory', async () => {
    const c = ctx({ lists: { 'orphanet|fr': rare }, lib: lib([]) });
    c.addOne = vi.fn(async () => { c.notice = ['Nothing was added: the vault refused the write']; });
    await expect(H(c).add({ source: 'orphanet', entryId: '586' })).rejects.toThrow(/^WRITE_FAILED: "Mucoviscidose" did not reach memory; on screen: Nothing was added/);
  });

  it("turnPage reads the next and previous page with the search's own words, within the buttons' bounds", async () => {
    const page = (offset: number) => ({ entries: [{ id: 'P1', title: 'Anxiety in teens', extra: { version: '1', retracted: '0' } }], total: 450, query: 'anxiety', offset });
    const c = ctx({ lists: { 'pmc|en': page(0) } });
    c.loadList = vi.fn(async (_s, _l, _q, offset: number) => { c.lists = { 'pmc|en': page(offset) }; });
    const size = SOURCES.pmc.pageSize!;
    await expect(H(c).turnPage({ source: 'pmc', direction: 'next' })).resolves.toMatchObject({ offset: size });
    expect(c.loadList).toHaveBeenCalledWith('pmc', 'en', 'anxiety', size);
    expect(c.go).toHaveBeenCalledWith({ kind: 'domain', domain: 'research' });
    c.loadList = vi.fn(async (_s, _l, _q, offset: number) => { c.lists = { 'pmc|en': page(offset) }; });
    await expect(H(c).turnPage({ source: 'pmc', direction: 'previous' })).resolves.toMatchObject({ offset: 0 });
    await expect(H(ctx({ lists: { 'pmc|en': page(0) } })).turnPage({ source: 'pmc', direction: 'previous' })).rejects.toThrow(/^FIRST_PAGE/);
    const last = ctx({ lists: { 'pmc|en': { ...page(0), total: 1 } } });
    await expect(H(last).turnPage({ source: 'pmc', direction: 'next' })).rejects.toThrow(/^LAST_PAGE/);
    expect(last.loadList).not.toHaveBeenCalled();
    await expect(H(ctx()).turnPage({ source: 'orphanet', direction: 'next' })).rejects.toThrow(/^BAD_ARG: .*whole catalogue/);
    await expect(H(ctx()).turnPage({ source: 'mesh', direction: 'next' })).rejects.toThrow(/^BAD_ARG: MeSH answers a search in one page/);
    const busy = ctx({ lists: { 'pmc|en': page(0) }, job: { kind: 'list', startedAt: 0, source: 'who' } });
    await expect(H(busy).turnPage({ source: 'pmc', direction: 'next' })).rejects.toThrow(/^BUSY/);
  });

  it('setLanguage goes through the language menu, shows the domain, refuses a language the source lacks or a running job', () => {
    const c = ctx();
    expect(H(c).setLanguage({ source: 'who', lang: 'es' })).toEqual({ source: 'who', lang: 'es', loaded: false });
    expect(c.go).toHaveBeenCalledWith({ kind: 'domain', domain: 'who' });
    expect(c.setLang).toHaveBeenCalledWith('who', 'es');
    expect(() => H(ctx()).setLanguage({ source: 'nimh', lang: 'fr' })).toThrow(/^BAD_ARG: NIMH is read in en/);
    const busy = ctx({ job: { kind: 'list', startedAt: 0, source: 'who' } });
    expect(() => H(busy).setLanguage({ source: 'who', lang: 'es' })).toThrow(/^BUSY/);
    expect(busy.setLang).not.toHaveBeenCalled();
  });

  it('showHome is the Back button, refused while a job runs', () => {
    const c = ctx({ view: { kind: 'domain', domain: 'rare' } });
    expect(H(c).showHome()).toEqual({ shown: 'home' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'home' });
    expect(() => H(ctx({ job: { kind: 'list', startedAt: 0, source: 'who' } })).showHome()).toThrow(/^BUSY/);
  });
});
