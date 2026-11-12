/**
 * Logic of the player entry field: which known players fit what was typed, and what happens on "add".
 * Pure functions; the field itself is components/PlayerNameField.tsx.
 */
import { findNameCandidates, normalizeName, sameName, NameCandidate } from './nameMatching';
import { PlayerRegistry } from './playerRegistry';

export interface KnownPlayer {
  ref: string;
  name: string;
}

/** Name as it is stored for a new player: trimmed, single spaces. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

const knownPlayers = (registry: PlayerRegistry): KnownPlayer[] =>
  [...registry.names].map(([ref, name]) => ({ ref, name }));

/**
 * Known players that fit the typed text, best first: names that start with it, then names that contain it
 * (also through an alias). Case, spacing, umlauts and accents do not matter.
 */
export function suggestPlayers(registry: PlayerRegistry, text: string, limit = 6): KnownPlayer[] {
  const query = normalizeName(text);
  if (query === '') return [];
  const aliasesOf = new Map<string, string[]>();
  for (const [key, ref] of registry.refByName) {
    if (registry.names.get(ref) && normalizeName(registry.names.get(ref) as string) !== normalizeName(key)) {
      aliasesOf.set(ref, [...(aliasesOf.get(ref) ?? []), key]);
    }
  }
  const scored: { player: KnownPlayer; rank: number }[] = [];
  for (const player of knownPlayers(registry)) {
    const forms = [normalizeName(player.name), ...(aliasesOf.get(player.ref) ?? []).map(normalizeName)];
    const words = forms.flatMap(f => f.split(' '));
    let rank = -1;
    if (forms.some(f => f.startsWith(query))) rank = 0;
    else if (words.some(w => w.startsWith(query))) rank = 1;
    else if (forms.some(f => f.includes(query))) rank = 2;
    if (rank >= 0) scored.push({ player, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.player.name.localeCompare(b.player.name, 'de'));
  return scored.slice(0, limit).map(s => s.player);
}

export type Resolved =
  /** The typed name is a known player (display name or alias, spelling differences ignored) */
  | { kind: 'known'; player: KnownPlayer }
  /** Not known: the person has to confirm a new player; `similar` are known players with a similar name */
  | { kind: 'new'; name: string; similar: (NameCandidate & { ref: string })[] };

/** What "add" does for the typed text. */
export function resolvePlayer(registry: PlayerRegistry, text: string): Resolved {
  const name = cleanName(text);
  for (const [key, ref] of registry.refByName) {
    if (sameName(key, name)) return { kind: 'known', player: { ref, name: registry.names.get(ref) ?? name } };
  }
  const rows = knownPlayers(registry).map(p => ({ name: p.name, points: 0, championships: 0, ref: p.ref }));
  const similar = findNameCandidates(name, rows).map(c => ({ ...c, ref: rows.find(r => r.name === c.name)!.ref }));
  return { kind: 'new', name, similar };
}
