/**
 * Pairing engine of the Swiss system. Pure functions, no React and no database.
 *
 * Rules (docs/UMSETZUNGSPLAN.md 7.2):
 *  - R1 no pair meets twice in the group phase of a tournament (the playoff is not part of this)
 *  - R2 a bye (Freilos) is a pairing against the virtual player BYE_ID, so nobody gets a second one
 *  - R3 every round is complete: everybody plays exactly once, or has the bye
 *  - R4 players of similar rank meet: the best unpaired player gets the nearest-ranked opponent that is allowed
 *  - R6 a round is only accepted when all rounds that are still planned can be drawn without a rematch afterwards,
 *       so the tournament never ends up in a dead end
 *
 * Reference with a simulation: scripts/swiss-pairing-prototype.mjs
 */

/** The virtual player that stands for "has a bye this round". */
export const BYE_ID = '__BYE__';

/** Random number source, injectable so that tests are reproducible. */
export type Rng = () => number;

/** The search ran longer than the budget allows. Should not happen for realistic tournaments (up to 24 players). */
export class PairingBudgetError extends Error {
  constructor() {
    super('Die Auslosung hat zu lange gedauert.');
    this.name = 'PairingBudgetError';
  }
}

/** No round without a rematch can be drawn. */
export class SwissPairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SwissPairingError';
  }
}

export interface PairingInput {
  /** Player ids in ranking order, best first. Round 1: shuffled. Without the bye; it is added for an odd field. */
  ranking: string[];
  /** Pairs that were played already (and byes as pairKey(id, BYE_ID)). */
  played: Set<string>;
  /** How many planned rounds come after this one (for R6). */
  roundsAfter: number;
  /** Protection against endless searching (search steps). */
  budget?: number;
}

/** Key of an unordered pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Most rounds a tournament of `playerCount` players can have without a rematch: everybody meets everybody once
 * (n - 1 rounds); with an odd number every player also has exactly one bye (n rounds).
 */
export function maxSwissRounds(playerCount: number): number {
  if (playerCount < 2) return 0;
  return playerCount % 2 === 0 ? playerCount - 1 : playerCount;
}

interface Search {
  nodes: string[];
  counter: { left: number };
  memo: Map<string, boolean>;
}

const step = (search: Search) => {
  if (--search.counter.left < 0) throw new PairingBudgetError();
};

/** Can `rounds` further complete rounds be drawn without a rematch, given what was played? */
function canSchedule(search: Search, played: Set<string>, rounds: number): boolean {
  if (rounds === 0) return true;
  const memoKey = `${rounds}#${[...played].sort().join(',')}`;
  const known = search.memo.get(memoKey);
  if (known !== undefined) return known;

  const unpaired = new Set(search.nodes);
  const pairs: [string, string][] = [];
  let ok = false;

  const dfs = () => {
    if (ok) return;
    step(search);
    if (unpaired.size === 0) {
      const next = new Set(played);
      pairs.forEach(([a, b]) => next.add(pairKey(a, b)));
      if (canSchedule(search, next, rounds - 1)) ok = true;
      return;
    }
    const a = unpaired.values().next().value as string;
    unpaired.delete(a);
    for (const b of [...unpaired]) {
      if (played.has(pairKey(a, b))) continue;
      unpaired.delete(b);
      pairs.push([a, b]);
      dfs();
      pairs.pop();
      unpaired.add(b);
      if (ok) break;
    }
    unpaired.add(a);
  };

  dfs();
  search.memo.set(memoKey, ok);
  return ok;
}

/**
 * Draws one round. Returns the pairs (a pair with BYE_ID means that player has the bye), the best-ranked
 * player's pair first, or null when no round without a rematch is possible that keeps the planned rounds drawable.
 */
export function pairRound(input: PairingInput): [string, string][] | null {
  const { ranking, played, roundsAfter, budget = 3_000_000 } = input;
  const nodes = ranking.length % 2 === 1 ? [...ranking, BYE_ID] : [...ranking];
  const search: Search = { nodes, counter: { left: budget }, memo: new Map() };

  const unpaired = new Set(nodes);
  const pairs: [string, string][] = [];
  let result: [string, string][] | null = null;

  const dfs = () => {
    if (result) return;
    step(search);
    if (unpaired.size === 0) {
      const next = new Set(played);
      pairs.forEach(([a, b]) => next.add(pairKey(a, b)));
      if (canSchedule(search, next, roundsAfter)) result = pairs.map(p => [...p] as [string, string]);
      return;
    }
    // The best-ranked player that is not paired yet
    const a = nodes.find(id => unpaired.has(id)) as string;
    unpaired.delete(a);
    // `a` is the best-ranked unpaired player, so the unpaired set is already in order of distance from him (R4)
    const candidates = [...unpaired].filter(b => !played.has(pairKey(a, b)));
    for (const b of candidates) {
      unpaired.delete(b);
      pairs.push([a, b]);
      dfs();
      pairs.pop();
      unpaired.add(b);
      if (result) break;
    }
    unpaired.add(a);
  };

  dfs();
  return result;
}
