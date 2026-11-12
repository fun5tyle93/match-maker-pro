/**
 * The list of known players (table players) as far as the app needs it to recognise a person. Pure helpers, the
 * database access is in storage.ts (loadPlayerRegistry).
 */

/** Comparable form of a name for lookups: trimmed, single spaces, lower case. */
export function playerKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

export interface PlayerRegistry {
  /** players.id -> display name */
  names: Map<string, string>;
  /** playerKey(display name or alias) -> players.id */
  refByName: Map<string, string>;
}

export const EMPTY_REGISTRY: PlayerRegistry = { names: new Map(), refByName: new Map() };

export function buildRegistry(
  players: { id: string; display_name: string }[],
  aliases: { alias: string; player_id: string }[],
): PlayerRegistry {
  const names = new Map<string, string>();
  const refByName = new Map<string, string>();
  for (const p of players) {
    names.set(p.id, p.display_name);
    refByName.set(playerKey(p.display_name), p.id);
  }
  // A name that is also an alias belongs to the alias's player (the person decided that)
  for (const a of aliases) refByName.set(playerKey(a.alias), a.player_id);
  return { names, refByName };
}
