import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { NIMH } from '../sources/nimh';
import { Footer } from './Footer';
import { Home } from './Home';
import { DomainView } from './DomainView';
import { translate, type Key } from '../i18n/strings';
import { EMPTY_LIBRARY, newRecord, type LibraryState } from '../lib/library';
import type { SourceActions } from './types';

const t = (key: Key, vars?: Record<string, string | number>) => translate('en', key, vars);
const actions = (): SourceActions => ({ onLoad: vi.fn(), onAddOne: vi.fn(), onAddAll: vi.fn(), onStop: vi.fn(), onOpenLicence: vi.fn(), onLang: vi.fn() });

describe('Home', () => {
  it('shows the five sub-domains and what is in memory for each, from the durable state', () => {
    const lib: LibraryState = { ...EMPTY_LIBRARY, records: [{ ...newRecord('orphanet', 'fr', new Date('2026-10-04T10:00:00Z')), inVault: 12 }] };
    render(<Home t={t} lang="en" lib={lib} libStatus={{ kind: 'ready' }} onOpen={vi.fn()} />);
    for (const name of ['Rare diseases', 'Mental health', 'WHO fact sheets', 'Medical vocabulary', 'Research (articles)']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText(/^12 in memory/)).toBeInTheDocument();
    expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(4);
  });
});

describe('DomainView', () => {
  it('shows the source tile with its licence verbatim, and the WHO note that the page states none', () => {
    render(<DomainView t={t} lang="en" domain="who" lib={EMPTY_LIBRARY} vault={{ kind: 'loading' }} libReady lists={{}} listError={null}
      job={null} now={0} notice={[]} langOf={() => 'en'} actions={actions()} onBack={vi.fn()} />);
    expect(screen.getByText(/^Licence of the fact sheets not stated by the page\./)).toBeInTheDocument();
    expect(screen.getByText(/does not state its licence/)).toBeInTheDocument();
    expect(screen.getByText('Load the list')).toBeInTheDocument();
  });

  it('without a vault (permission refused, no bridge) the list shows but nothing can be added', () => {
    const lists = { 'orphanet|en': { entries: [{ id: '58', title: 'Alexander disease' }], total: 11645, query: '', offset: 0 } };
    render(<DomainView t={t} lang="en" domain="rare" lib={EMPTY_LIBRARY} vault={{ kind: 'error', why: 'No Mnemosyne host' }} libReady lists={lists} listError={null}
      job={null} now={0} notice={[]} langOf={() => 'en'} actions={actions()} onBack={vi.fn()} />);
    expect(screen.getByText('Alexander disease')).toBeInTheDocument();
    expect(screen.getByText('Add to memory')).toBeDisabled();
    expect(screen.getByText('Add all 1 to memory')).toBeDisabled();
  });

  it('PMC: each row shows its own licence, a retracted article cannot be added, and "add the listed" waits for a licence choice', () => {
    const lists = {
      'pmc|en': {
        entries: [
          { id: 'PMC1', title: 'Open article', extra: { version: 'PMC1.1', licence: 'CC0', retracted: '0' } },
          { id: 'PMC2', title: 'Withdrawn article', extra: { version: 'PMC2.1', licence: 'CC BY', retracted: '1' } },
        ],
        total: 2, query: 'x', offset: 0,
      },
    };
    const a = actions();
    render(<DomainView t={t} lang="en" domain="research" lib={EMPTY_LIBRARY} vault={{ kind: 'ready', vault: 'V', unlocked: true }} libReady lists={lists} listError={null}
      job={null} now={0} notice={[]} langOf={() => 'en'} actions={a} onBack={vi.fn()} />);
    expect(screen.getByText(/Licence: CC0/)).toBeInTheDocument();
    expect(screen.getByText(/retracted: not added/)).toBeInTheDocument();
    const buttons = screen.getAllByText('Add to memory');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(screen.getByText('Add the 0 listed to memory')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('CC0'));
    fireEvent.click(screen.getByText('Add the 1 listed to memory'));
    expect(a.onAddAll).toHaveBeenCalledWith('pmc', 'en', [lists['pmc|en'].entries[0]], 'list');
  });
});

describe('Home before the state is read', () => {
  it('never says "nothing in memory" while nobody has read the state', () => {
    const { rerender } = render(<Home t={t} lang="en" lib={EMPTY_LIBRARY} libStatus={{ kind: 'loading' }} onOpen={vi.fn()} />);
    expect(screen.queryByText('Nothing in memory yet')).not.toBeInTheDocument();
    expect(screen.getAllByText('Reading what is in memory…')).toHaveLength(5);
    rerender(<Home t={t} lang="en" lib={EMPTY_LIBRARY} libStatus={{ kind: 'error', why: 'x' }} onOpen={vi.fn()} />);
    expect(screen.getAllByText('What is in memory could not be read')).toHaveLength(5);
  });
});

describe('Footer', () => {
  it('says why the buttons are grey while the vault opens', () => {
    render(<Footer t={t} vault={{ kind: 'loading' }} folder={null} onRetryVault={vi.fn()} onOpenFolder={vi.fn()} />);
    expect(screen.getByText(/Opening the vault/)).toBeInTheDocument();
  });
});

describe('App with a host that answers', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** A fake bridge: answers per action, records every call (and its payload in `log`). */
  function fakeHost(answers: Record<string, (payload?: unknown) => Promise<unknown>>, log: { action: string; payload: unknown }[] = []) {
    const calls: string[] = [];
    vi.spyOn(MnemoCartridgeSDK.prototype, 'invoke').mockImplementation(async (action: string, payload?: unknown) => {
      calls.push(action);
      log.push({ action, payload });
      const a = answers[action];
      return a ? a(payload) : undefined;
    });
    return calls;
  }

  /** NIMH with one topic, read without the network. */
  function oneTopic() {
    vi.spyOn(NIMH, 'list').mockResolvedValue({ entries: [{ id: 'depression', title: 'Depression' }], total: 1 });
    vi.spyOn(NIMH, 'read').mockResolvedValue({
      kind: 'doc',
      doc: { source: 'nimh', id: 'depression', lang: 'en', title: 'Depression', ref: 'depression', text: 'Text.', date: null, dateKind: 'reviewed', licence: 'Public domain', url: 'https://x', attribution: 'NIMH' },
    });
  }

  it('an addition never asks for a folder: it writes under the folder vault.pack.ensure gives, into the pack vault', async () => {
    oneTopic();
    const log: { action: string; payload: unknown }[] = [];
    const calls = fakeHost({
      // An older chosen folder is stored: new copies still go to the pack folder.
      'state.get': async () => ({ state: { library: { folder: '/old/picked', records: [] } } }),
      'vault.sandbox.ensure': async () => ({ vault: 'V', created: false, unlocked: true }),
      'vault.pack.ensure': async () => ({ vault: 'PACK_NIMH', folder: '/knowledge/mnemo-health', created: true }),
      'dialog.mkdir': async () => ({ success: true }),
      'dialog.writeFile': async () => ({ success: true }),
      'mnemosyne.ingest': async () => ({}),
      'state.set': async () => ({}),
    }, log);
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    fireEvent.click(screen.getByText('Mental health'));
    fireEvent.click(screen.getByText('Load the list'));
    await waitFor(() => expect(screen.getByText('Add to memory')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Add to memory'));
    await waitFor(() => expect(screen.getByText(/1 entries in memory/)).toBeInTheDocument());
    expect(calls).not.toContain('dialog.selectFolder');
    expect(log.find((c) => c.action === 'vault.pack.ensure')?.payload).toEqual({ pack: 'NIMH', lexicalOnly: false });
    const written = log.filter((c) => c.action === 'dialog.writeFile').map((c) => (c.payload as { filePath: string }).filePath);
    expect(written.length).toBeGreaterThan(0);
    for (const path of written) expect(path.startsWith('/knowledge/mnemo-health/')).toBe(true);
    const ingests = log.filter((c) => c.action === 'mnemosyne.ingest').map((c) => (c.payload as { vault: string }).vault);
    expect(ingests).toEqual(['PACK_NIMH']);
    expect(screen.getByText('The copies are kept in /knowledge/mnemo-health')).toBeInTheDocument();
  });

  it('with no knowledge folder chosen yet, says to choose it in the Hub and writes nothing', async () => {
    oneTopic();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const calls = fakeHost({
      'state.get': async () => ({ state: { library: { records: [] } } }),
      'vault.sandbox.ensure': async () => ({ vault: 'V', created: false, unlocked: true }),
      'vault.pack.ensure': async () => { throw new Error('NO_KNOWLEDGE_ROOT'); },
    });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    fireEvent.click(screen.getByText('Mental health'));
    fireEvent.click(screen.getByText('Load the list'));
    await waitFor(() => expect(screen.getByText('Add to memory')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Add to memory'));
    await waitFor(() => expect(screen.getByText(/Choose where knowledge goes in the Hub/)).toBeInTheDocument());
    expect(calls).not.toContain('dialog.selectFolder');
    expect(calls).not.toContain('dialog.writeFile');
    expect(calls).not.toContain('mnemosyne.ingest');
  });

  it('an unreadable state is SAID, nothing can be added, nothing is written, and it can be read again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let stateOk = false;
    const calls = fakeHost({
      'state.get': async () => { if (!stateOk) throw new Error('STATE_TIMEOUT'); return { state: { library: { folder: '/m', records: [] } } }; },
      'vault.sandbox.ensure': async () => ({ vault: 'V', created: false, unlocked: true }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be read \(STATE_TIMEOUT\)/));
    expect(screen.getAllByText('What is in memory could not be read')).toHaveLength(5);
    expect(screen.queryByText('Nothing in memory yet')).not.toBeInTheDocument();
    expect(calls).not.toContain('state.set');
    stateOk = true;
    fireEvent.click(screen.getByText('Try again', { selector: '[role=alert] button' }));
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('changing the language does not read the state or open the vault again', async () => {
    const calls = fakeHost({
      'state.get': async () => ({ state: { library: { records: [] } } }),
      'vault.sandbox.ensure': async () => ({ vault: 'V', created: false, unlocked: true }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Nothing in memory yet')).toHaveLength(5));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'MNEMO_CONFIG_UPDATE', lang: 'fr' }, source: window }));
    await waitFor(() => expect(screen.getByText('Maladies rares')).toBeInTheDocument());
    expect(calls.filter((c) => c === 'state.get')).toHaveLength(1);
    expect(calls.filter((c) => c === 'vault.sandbox.ensure')).toHaveLength(1);
  });
});

describe('App without a host bridge', () => {
  it('says the vault is unavailable, keeps the medical disclaimer visible, and opens a domain', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/The vault is not available/)).toBeInTheDocument());
    expect(screen.getByText(/It gives no medical advice/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mental health'));
    expect(screen.getByText('NIMH')).toBeInTheDocument();
    expect(screen.getByText('Load the list')).toBeInTheDocument();
  });
});
