import {
  ATTRIBUTION_FILE, EMPTY_LIBRARY, countedIn, newRecord, parseLibrary, persistLibrary, resumeIndex, runEntries, withRecord,
  type HostPort, type SourceRecord,
} from './library';
import type { Entry, ReadResult, ReaderDeps, SourceDef } from '../sources/types';

const entries: Entry[] = ['1', '2', '3', '4', '5'].map((id) => ({ id, title: `Disease ${id}` }));
const now = () => new Date('2026-10-04T10:00:00.000Z');

function fakeDef(read: (e: Entry) => Promise<ReadResult>): SourceDef {
  return {
    id: 'orphanet', domain: 'rare', langs: ['en'], mode: 'catalogue', name: 'Orphanet', licence: 'L', licenceUrl: 'https://l', pauseMs: 10,
    list: async () => ({ entries, total: entries.length }),
    read: async (_d, e) => read(e),
  };
}
const doc = (e: Entry): ReadResult => ({
  kind: 'doc',
  doc: { source: 'orphanet', id: e.id, lang: 'en', title: e.title, ref: `ORPHA:${e.id}`, text: 'Definition.', date: null, dateKind: 'record', licence: 'L', url: 'https://x', attribution: 'Orphanet' },
});

function port(over: Partial<HostPort> = {}) {
  const files: string[] = [];
  const ingested: string[] = [];
  const p: HostPort = {
    writeFile: async (path) => { files.push(path); return { success: true }; },
    mkdir: async () => ({ success: true }),
    ingest: async (e) => { ingested.push(e.sourceRef); },
    ...over,
  };
  return { p, files, ingested };
}
const reader: ReaderDeps = { fetchJson: async () => null, fetchText: async () => '', hostText: async () => '', sleep: async () => undefined };

describe('parseLibrary', () => {
  it('reads the host shape { state: { library } } (MnemoLaw forgot everything on restart without this)', () => {
    const rec = newRecord('who', 'fr', now());
    const lib = parseLibrary({ state: { library: { folder: 'C:\\Docs\\MnemoHealth', records: [{ ...rec, inVault: 3 }] } }, updatedAt: 1 });
    expect(lib.folder).toBe('C:\\Docs\\MnemoHealth');
    expect(lib.records[0]).toMatchObject({ key: 'who|fr', inVault: 3 });
  });

  it('drops what it cannot read instead of inventing it', () => {
    const lib = parseLibrary({ state: { library: { records: [{ source: 'nope', lang: 'en' }, { source: 'who', lang: 'en', inVault: -1 }] } } });
    expect(lib).toEqual(EMPTY_LIBRARY);
  });
});

describe('persistLibrary', () => {
  it('refuses to write while the stored library is unread or unreadable, so it is never overwritten', async () => {
    const setState = vi.fn(async () => undefined);
    expect(await persistLibrary({ kind: 'loading' }, EMPTY_LIBRARY, setState)).toBe('refused');
    expect(await persistLibrary({ kind: 'error', why: 'TIMEOUT' }, EMPTY_LIBRARY, setState)).toBe('refused');
    expect(setState).not.toHaveBeenCalled();
    expect(await persistLibrary({ kind: 'ready' }, EMPTY_LIBRARY, setState)).toBe('saved');
    expect(setState).toHaveBeenCalledWith({ state: { library: EMPTY_LIBRARY } });
  });
});

describe('runEntries', () => {
  it('writes the attribution and a file per entry, counts skips apart, and saves the cursor', async () => {
    const { p, files, ingested } = port();
    const saves: SourceRecord[] = [];
    const def = fakeDef(async (e) => (e.id === '3' ? { kind: 'skip', reason: 'NO_DEFINITION' } : doc(e)));
    const { record, progress } = await runEntries({
      reader, def, lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now,
      save: async (r) => { saves.push(r); },
    }, entries, 'pack');
    expect(progress).toMatchObject({ done: 5, inVault: 4, skipped: 1, failed: 0 });
    expect(record).toMatchObject({ inVault: 4, skipped: 1, pack: { cursor: 5, total: 5, lastId: '5' } });
    expect(files.filter((f) => f.endsWith(ATTRIBUTION_FILE))).toHaveLength(1);
    expect(files).toContain('/m/Orphanet/en/1.json');
    expect(ingested).toEqual(['mnemo-health:orphanet:en:1', 'mnemo-health:orphanet:en:2', 'mnemo-health:orphanet:en:4', 'mnemo-health:orphanet:en:5']);
    expect(saves.at(-1)?.pack?.cursor).toBe(5);
  });

  it('a stop keeps what was written, and the next run resumes after the last entry read', async () => {
    const { p } = port();
    const ctrl = new AbortController();
    const def = fakeDef(async (e) => { if (e.id === '2') ctrl.abort(); return doc(e); });
    const first = await runEntries({
      reader, def, lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, signal: ctrl.signal, save: async () => undefined,
    }, entries, 'pack');
    expect(first.record.pack).toMatchObject({ cursor: 1, lastId: '1' });
    expect(first.record.inVault).toBe(1);
    const seen: string[] = [];
    const second = await runEntries({
      reader, def: fakeDef(async (e) => { seen.push(e.id); return doc(e); }), lang: 'en', port: p, vault: 'V', folder: '/m', record: first.record, now, save: async () => undefined,
    }, entries, 'pack');
    expect(seen).toEqual(['2', '3', '4', '5']);
    expect(second.record.inVault).toBe(5);
  });

  it('resumes by the last id when the list changed in between', () => {
    expect(resumeIndex([{ id: '0', title: '' }, ...entries], { cursor: 2, total: 5, lastId: '2', startedAt: '' })).toBe(3);
    expect(resumeIndex(entries, { cursor: 2, total: 5, lastId: 'gone', startedAt: '' })).toBe(2);
  });

  it('an entry whose chronicle the vault refused is counted as failed, not in memory', async () => {
    const { p } = port({ ingest: async () => { throw new Error('VAULT_LOCKED'); } });
    const { record } = await runEntries({
      reader, def: fakeDef(async (e) => doc(e)), lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async () => undefined,
    }, entries.slice(0, 2), 'list');
    expect(record).toMatchObject({ inVault: 0, failed: 2, done: [] });
  });

  it('retries a rate limit, then gives up with the cursor ON the entry', async () => {
    const { p } = port();
    let calls = 0;
    const def = fakeDef(async (e) => { if (e.id === '2') { calls++; throw new Error('HTTP_429'); } return doc(e); });
    let saved: SourceRecord | null = null;
    await expect(runEntries({
      reader, def, lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async (r) => { saved = r; },
    }, entries, 'pack')).rejects.toThrow('HTTP_429');
    expect(calls).toBe(4);
    expect(saved!.pack).toMatchObject({ cursor: 1, lastId: '1' });
  });

  it('adding one entry twice counts it once; "add all" skips what was added alone', async () => {
    const { p, ingested } = port();
    let rec = newRecord('orphanet', 'en', now());
    const def = fakeDef(async (e) => doc(e));
    const deps = { reader, def, lang: 'en' as const, port: p, vault: 'V', folder: '/m', now, save: async () => undefined };
    rec = (await runEntries({ ...deps, record: rec }, [entries[2]!], 'list')).record;
    rec = (await runEntries({ ...deps, record: rec }, [entries[2]!], 'list')).record;
    expect(rec.inVault).toBe(1);
    expect(countedIn(rec, entries, 2)).toBe(true);
    const all = await runEntries({ ...deps, record: rec }, entries, 'pack');
    expect(all.record.inVault).toBe(5);
    expect(all.progress.already).toBe(1);
    expect(ingested.filter((r) => r.endsWith(':3'))).toHaveLength(2);
  });

  it('pauses between two reads, never before the first', async () => {
    const { p } = port();
    const events: string[] = [];
    const def = fakeDef(async (e) => { events.push(`read ${e.id}`); return doc(e); });
    const sleepy: ReaderDeps = { ...reader, sleep: async (ms) => { events.push(`sleep ${ms}`); } };
    await runEntries({
      reader: sleepy, def, lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async () => undefined,
    }, entries.slice(0, 3), 'pack');
    expect(events).toEqual(['read 1', 'sleep 10', 'read 2', 'sleep 10', 'read 3']);
  });

  it('a file the host refuses to write stops the run and the entry is NOT counted in memory', async () => {
    const { p, ingested } = port({ writeFile: async (path) => (path.endsWith('.json') ? { success: false, error: 'EACCES' } : { success: true }) });
    let saved: SourceRecord | null = null;
    await expect(runEntries({
      reader, def: fakeDef(async (e) => doc(e)), lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async (r) => { saved = r; },
    }, entries, 'pack')).rejects.toThrow('WRITE_FAILED: EACCES');
    expect(ingested).toEqual([]);
    expect(saved!.inVault).toBe(0);
    expect(saved!.pack?.cursor).toBe(0);
  });

  it('a stop while the parts of a long article are written leaves the cursor ON that entry, and Resume reads it again', async () => {
    const ctrl = new AbortController();
    let parts = 0;
    const { p } = port({ ingest: async () => { parts++; if (parts === 1) ctrl.abort(); } });
    const long = (e: Entry): ReadResult => {
      const r = doc(e);
      if (r.kind === 'doc') r.doc.text = Array.from({ length: 3000 }, (_, i) => `Line ${i} of a long article body.`).join(' ');
      return r;
    };
    const first = await runEntries({
      reader, def: fakeDef(async (e) => long(e)), lang: 'en', port: p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, signal: ctrl.signal, save: async () => undefined,
    }, entries, 'pack');
    expect(parts).toBe(1);
    expect(first.record.inVault).toBe(0);
    expect(first.record.pack).toMatchObject({ cursor: 0, lastId: null });
    const seen: string[] = [];
    await runEntries({
      reader, def: fakeDef(async (e) => { seen.push(e.id); return doc(e); }), lang: 'en', port: port().p, vault: 'V', folder: '/m', record: first.record, now, save: async () => undefined,
    }, entries, 'pack');
    expect(seen[0]).toBe('1');
  });

  it.each(['HTTP_404', 'HOST_FETCH_TRUNCATED', 'ORPHANET_UNEXPECTED_LIST'])('does not retry a non-retryable error (%s)', async (code) => {
    let calls = 0;
    await expect(runEntries({
      reader, def: fakeDef(async () => { calls++; throw new Error(code); }), lang: 'en', port: port().p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async () => undefined,
    }, entries, 'pack')).rejects.toThrow(code);
    expect(calls).toBe(1);
  });

  it('does not retry a parse error (SyntaxError)', async () => {
    let calls = 0;
    await expect(runEntries({
      reader, def: fakeDef(async () => { calls++; return JSON.parse('<html>'); }), lang: 'en', port: port().p, vault: 'V', folder: '/m', record: newRecord('orphanet', 'en', now()), now, save: async () => undefined,
    }, entries, 'pack')).rejects.toThrow(SyntaxError);
    expect(calls).toBe(1);
  });

  it('withRecord replaces the record of the same source and language', () => {
    const a = { ...newRecord('who', 'en', now()), inVault: 1 };
    const b = { ...a, inVault: 2 };
    expect(withRecord(withRecord(EMPTY_LIBRARY, a), b).records).toEqual([b]);
  });
});
