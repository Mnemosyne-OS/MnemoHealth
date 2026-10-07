/**
 * eta — how long the vault write still needs, from what was measured.
 *
 * The rate is MEASURED on this run (articles done / seconds elapsed), never
 * assumed: vectorizing one article takes ~0.1 s on one machine and several
 * times that on another. Two floors before any estimate is printed, because
 * the first articles pay the embedder warm-up and a rate taken over three of
 * them would promise an hour or a minute at random: at least
 * `MIN_DONE` articles AND `MIN_SECONDS` seconds. Below that the screen shows
 * the elapsed clock only, which is a measure, never a guess.
 */

export const MIN_DONE = 20;
export const MIN_SECONDS = 10;

/** Seconds left, or null while the rate is not measured yet (or nothing is left to do). */
export function remainingSeconds(done: number, total: number, elapsedSeconds: number): number | null {
  if (!(done >= MIN_DONE) || !(elapsedSeconds >= MIN_SECONDS)) return null;
  if (!(total > done)) return null;
  const rate = done / elapsedSeconds;
  return Math.round((total - done) / rate);
}

/** "45 s", "3 min", "1 h 05" — rounded to the NEAREST unit, never floored (doc 112 §7: a floored clock reads as stuck). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
