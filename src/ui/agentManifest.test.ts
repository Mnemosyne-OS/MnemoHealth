/**
 * MnemoHealth's agent actions (doc 149): the manifest's declaration passes the HOST's own check,
 * every declared action has its handler (a declared action without one would be offered to
 * agents and fail), and the enums and limits it declares are the app's own.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest, agentGuideFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { voiceCommandsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeVoiceCommands';
import { DOMAINS } from '../sources/catalogue';
import { ENTRIES_MAX, SOURCE_IDS } from './healthAgent';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'ui', 'healthAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("MnemoHealth's agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
  });

  it('declares the app\'s own domains, sources and limits', () => {
    expect(declared().find((a) => a.id === 'loadList')!.params.lang).toMatchObject({ enum: ['en', 'fr', 'es'] });
    for (const a of declared()) {
      if (a.params.domain) expect(a.params.domain).toMatchObject({ enum: [...DOMAINS] });
      if (a.params.source) expect(a.params.source).toMatchObject({ enum: [...SOURCE_IDS] });
    }
    expect(declared().find((a) => a.id === 'entries')!.params.limit).toMatchObject({ minimum: 1, maximum: ENTRIES_MAX });
  });

  it('carries a guide the host keeps (a too-long one is dropped in silence)', () => {
    expect(agentGuideFromManifest(manifest)).toMatch(/AMBIGUOUS/);
  });

  it("says 5 to 8 sentences in French, English and Spanish, none with the assistant's name", () => {
    for (const lang of ['fr', 'en', 'es']) {
      const said = voiceCommandsFromManifest(manifest, lang);
      expect(said.length, lang).toBeGreaterThanOrEqual(5);
      expect(said.length, lang).toBeLessThanOrEqual(8);
      for (const line of said) expect(line).not.toMatch(/irina|mnemosyne/i);
    }
  });
});
