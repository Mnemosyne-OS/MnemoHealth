/**
 * catalogue — the sub-domains of the home screen and the sources wired into
 * each. A tile exists ONLY for a source that is wired and was tested
 * (doc 135 §3quinquies): no "coming soon".
 *
 * Sizes are what was MEASURED on 2026-10-04, shown as such; the live list of a
 * catalogue source states its own count once loaded.
 */
import { ORPHANET } from './orphanet';
import { NIMH } from './nimh';
import { WHO } from './who';
import { MESH } from './mesh';
import { PMC } from './pmc';
import type { Domain, SourceDef, SourceId } from './types';

/** The sub-domains, in home order. */
export const DOMAINS: readonly Domain[] = ['rare', 'mental', 'who', 'vocab', 'research'];

/** Every wired source, by id. */
export const SOURCES: Record<SourceId, SourceDef> = { orphanet: ORPHANET, nimh: NIMH, who: WHO, mesh: MESH, pmc: PMC };

/** Icon of each sub-domain tile. */
export const DOMAIN_ICON: Record<Domain, string> = { rare: '🧬', mental: '🧠', who: '🌍', vocab: '📖', research: '🔬' };

/** The sources of a sub-domain, in the order their tiles are shown. */
export function sourcesOf(domain: Domain): SourceDef[] {
  return Object.values(SOURCES).filter((s) => s.domain === domain);
}

/** Size measured on 2026-10-04, as numbers the screen formats in its language. */
export const MEASURED_SIZE: Partial<Record<SourceId, { n: number; extra?: number }>> = {
  orphanet: { n: 11_645 },
  nimh: { n: 25 },
  who: { n: 244, extra: 240 },
  pmc: { n: 8_272_453 },
};
