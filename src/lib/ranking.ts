import { Match, Player, PlayerStats } from '@/types';
import { PLAYOFF_PLACEHOLDER_PREFIX } from './tournamentPhases';

/**
 * Rankings. Pure functions, no React and no database.
 *
 * - 'legacy'   : the order the app used until the DTKV rules were introduced. Evenings played before
 *                keep it, so winners that were already counted in the league tables never change.
 * - 'dtkv2026' : DTKV Spielordnung 2026 § 8 Absatz 3 (tie-break inside a group), see rankPlayers.
 *
 * Reference implementation with worked examples: scripts/dtkv-ranking-reference.mjs
 */

export type RankingRule = 'legacy' | 'dtkv2026';

/** Result of a decider (Entscheidungsspiel/-runde) for a complete tie: the players involved, best first. */
export interface DeciderResult {
  players: string[];
  order: string[];
}

export interface Ranked {
  /** Players, best first. */
  stats: PlayerStats[];
  /** places[i] is the place of stats[i]; players that are still level share a place (1, 2, 2, 4 ...). */
  places: number[];
}

// ─── Numbers ───────────────────────────────────────────────────────────────

const isPlayed = (m: Match) => m.isCompleted && m.homeScore !== null && m.awayScore !== null;

/** Wins, draws, goals and points of every player; not sorted. Win 2, draw 1, loss 0 points. */
export function computeStats(players: Player[], matches: Match[]): PlayerStats[] {
  const stats = players.map(player => ({
    player,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    pointsAgainst: 0,
    goalDifference: 0,
    championships: 0,
    viceChampionships: 0,
  }));

  matches.filter(m => m.isCompleted).forEach(match => {
    const homeStats = stats.find(s => s.player.id === match.homePlayer.id);
    const awayStats = stats.find(s => s.player.id === match.awayPlayer.id);

    if (!homeStats || !awayStats || match.homeScore === null || match.awayScore === null) return;

    homeStats.goalsFor += match.homeScore;
    homeStats.goalsAgainst += match.awayScore;
    awayStats.goalsFor += match.awayScore;
    awayStats.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      homeStats.wins += 1;
      awayStats.losses += 1;
    } else if (match.homeScore < match.awayScore) {
      awayStats.wins += 1;
      homeStats.losses += 1;
    } else {
      homeStats.draws += 1;
      awayStats.draws += 1;
    }
  });

  stats.forEach(s => {
    s.points = s.wins * 2 + s.draws * 1;
    s.pointsAgainst = s.losses * 2 + s.draws * 1;
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  });

  return stats;
}

/** Points of A minus points of B in the games between the two (win 2, draw 1 each). */
export function headToHead(aId: string, bId: string, matches: Match[]): number {
  let pointsA = 0;
  let pointsB = 0;
  matches.filter(isPlayed).forEach(m => {
    const aHome = m.homePlayer.id === aId && m.awayPlayer.id === bId;
    const bHome = m.homePlayer.id === bId && m.awayPlayer.id === aId;
    if (!aHome && !bHome) return;
    const homeGoals = m.homeScore as number;
    const awayGoals = m.awayScore as number;
    const [goalsA, goalsB] = aHome ? [homeGoals, awayGoals] : [awayGoals, homeGoals];
    if (goalsA > goalsB) pointsA += 2;
    else if (goalsA < goalsB) pointsB += 2;
    else { pointsA += 1; pointsB += 1; }
  });
  return pointsA - pointsB;
}

// ─── Legacy rule ───────────────────────────────────────────────────────────

/**
 * The ranking used before the DTKV rules: points, goal difference, goals scored, goals against,
 * head-to-head (pairwise). Kept exactly as it was, for evenings that were played under it.
 */
export function rankLegacy(stats: PlayerStats[], matches: Match[]): PlayerStats[] {
  return [...stats].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
    return -headToHead(a.player.id, b.player.id, matches);
  });
}

// ─── DTKV rule: Spielordnung 2026 § 8 Absatz 3 ─────────────────────────────

interface Tally { pts: number; gf: number; ga: number }

/**
 * Splits players into blocks, best first. Players that are level after every criterion stay together in
 * one block (a tie that needs a Entscheidungsspiel/-runde).
 *
 * Rule: sort by points in the group. Players level on points form a sub-group; their points are recomputed
 * from the games among them only (for two players this is the direct comparison). Players still level form
 * a sub-sub-group, and so on. When the points inside a (sub-)group cannot separate the players any more,
 * goal difference and then goals scored decide, taken from the next higher group first and then from the
 * groups above, up to the whole group (Hauptgruppe).
 *
 * Interpretations: "Torverhältnis" means goal difference, then goals scored (as in the second sentence of
 * the rule). If the goals of a higher group separate only some of the level players, no new sub-group is
 * formed for the rest; the chain simply continues with the next higher group.
 */
export function rankBlocksDtkv(playerIds: string[], matches: Match[]): string[][] {
  const games = matches.filter(isPlayed);

  const tally = (set: Set<string>): Map<string, Tally> => {
    const t = new Map<string, Tally>([...set].map(id => [id, { pts: 0, gf: 0, ga: 0 }]));
    games.forEach(m => {
      const h = t.get(m.homePlayer.id);
      const a = t.get(m.awayPlayer.id);
      if (!h || !a) return;
      const hs = m.homeScore as number;
      const as = m.awayScore as number;
      h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) h.pts += 2;
      else if (hs < as) a.pts += 2;
      else { h.pts += 1; a.pts += 1; }
    });
    return t;
  };

  const groupBy = (ids: string[], key: (id: string) => number[]): string[][] => {
    const sorted = [...ids].sort((x, y) => {
      const kx = key(x);
      const ky = key(y);
      for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return ky[i] - kx[i];
      return 0;
    });
    const blocks: string[][] = [];
    sorted.forEach(id => {
      const last = blocks[blocks.length - 1];
      if (last && key(last[0]).every((v, i) => v === key(id)[i])) last.push(id);
      else blocks.push([id]);
    });
    return blocks;
  };

  // ancestors: the groups above `set`, nearest first, the whole group last
  const rank = (set: Set<string>, ancestors: Set<string>[]): string[][] => {
    const t = tally(set);
    const out: string[][] = [];
    groupBy([...set], id => [t.get(id)!.pts]).forEach(block => {
      if (block.length === 1) {
        out.push(block);
      } else if (block.length < set.size) {
        out.push(...rank(new Set(block), [set, ...ancestors]));
      } else {
        // Points cannot separate them here: goals of the next higher group, then the groups above
        const chain = ancestors.length > 0 ? ancestors : [set];
        const tallies = chain.map(g => tally(g));
        const key = (id: string) => tallies.flatMap(x => {
          const v = x.get(id)!;
          return [v.gf - v.ga, v.gf];
        });
        out.push(...groupBy(block, key));
      }
    });
    return out;
  };

  return rank(new Set(playerIds), []);
}

/** Applies the results of deciders: a tied block whose members match a decider is put in the decided order. */
function applyDeciders(blocks: string[][], deciders: DeciderResult[]): string[][] {
  return blocks.flatMap(block => {
    if (block.length < 2) return [block];
    const decider = deciders.find(d =>
      d.order.length === block.length &&
      block.every(id => d.order.includes(id)) &&
      d.players.length === block.length &&
      block.every(id => d.players.includes(id)));
    return decider ? decider.order.map(id => [id]) : [block];
  });
}

// ─── Ranking of an evening ─────────────────────────────────────────────────

/** Ranks the players of a group (a training evening, round robin) under the given rule. */
export function rankPlayers(
  players: Player[],
  matches: Match[],
  rule: RankingRule = 'legacy',
  deciders: DeciderResult[] = [],
): Ranked {
  if (rule === 'legacy') {
    const sorted = rankLegacy(computeStats(players, matches), matches);
    return { stats: sorted, places: sorted.map((_, i) => i + 1) };
  }

  // One entry per player id (the DTKV rule works on ids)
  const unique = players.filter((p, i) => players.findIndex(q => q.id === p.id) === i);
  const stats = computeStats(unique, matches);
  const byId = new Map(stats.map(s => [s.player.id, s]));
  const blocks = applyDeciders(rankBlocksDtkv(unique.map(p => p.id), matches), deciders);

  const ordered: PlayerStats[] = [];
  const places: number[] = [];
  blocks.forEach(block => {
    const place = ordered.length + 1;
    block.forEach(id => {
      ordered.push(byId.get(id)!);
      places.push(place);
    });
  });
  return { stats: ordered, places };
}

/** Tie blocks that still need a decider because they reach place 1 or 2: [{ place, players }]. */
export function pendingDeciders(ranked: Ranked): { place: number; players: Player[] }[] {
  const result: { place: number; players: Player[] }[] = [];
  let i = 0;
  while (i < ranked.stats.length) {
    let j = i;
    while (j + 1 < ranked.stats.length && ranked.places[j + 1] === ranked.places[i]) j++;
    if (j > i && ranked.places[i] <= 2) {
      result.push({ place: ranked.places[i], players: ranked.stats.slice(i, j + 1).map(s => s.player) });
    }
    i = j + 1;
  }
  return result;
}

/** Winner and runner-up of an evening; a name is only given when the place is not shared. */
export function winnerAndRunnerUp(ranked: Ranked): { winner?: Player; runnerUp?: Player } {
  const { stats, places } = ranked;
  const winner = stats.length > 0 && places[1] !== 1 ? stats[0].player : undefined;
  const runnerUp = stats.length > 1 && places[1] === 2 && places[2] !== 2 ? stats[1].player : undefined;
  return { winner, runnerUp };
}

/**
 * "Außer Konkurrenz": a player whose name ends in "a.K." takes part but can never win a league title
 * (decision of the club, 13.11.2026). The name is the only marker there is.
 */
export const isOutOfCompetition = (name: string) => /(^|\s)a\.?\s?k\.?$/i.test(name.trim());

/**
 * Champion and runner-up for the league tables: like winnerAndRunnerUp, but players out of competition are
 * skipped, so the next player moves up. A place that is shared still gives no title.
 */
export function leagueTitleHolders(ranked: Ranked): { winner?: Player; runnerUp?: Player } {
  const eligible = ranked.stats
    .map((s, i) => ({ player: s.player, place: ranked.places[i] }))
    .filter(e => !isOutOfCompetition(e.player.name));
  const [first, second, third] = eligible;
  const winner = first && second?.place !== first.place ? first.player : undefined;
  const runnerUp = winner && second && third?.place !== second.place ? second.player : undefined;
  return { winner, runnerUp };
}

/**
 * Champion and runner-up for the leagues from an order without shared places (Swiss system): players out of
 * competition are skipped, so the next players move up.
 */
export function titleHoldersFromOrder(order: Player[]): { winner?: Player; runnerUp?: Player } {
  const eligible = order.filter(p => !isOutOfCompetition(p.name));
  return { winner: eligible[0], runnerUp: eligible[1] };
}

// ─── League tables ─────────────────────────────────────────────────────────

/**
 * Annual league (SO § 2 Absatz 6, individual ranking): points won, fewer points lost, goal difference,
 * goals scored. 0 means level.
 */
export function compareLeagueRows(a: PlayerStats, b: PlayerStats): number {
  return (
    b.points - a.points ||
    a.pointsAgainst - b.pointsAgainst ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor
  );
}

/** Eternal table (club rule): points, then championships. 0 means level. */
export function compareEternalRows(a: PlayerStats, b: PlayerStats): number {
  return b.points - a.points || (b.championships ?? 0) - (a.championships ?? 0);
}

/** Sorts rows; the sort is stable, so rows that are level keep their order and share a place. */
export function sortRows(rows: PlayerStats[], isEternal: boolean): PlayerStats[] {
  return [...rows].sort(isEternal ? compareEternalRows : compareLeagueRows);
}

/** Places for rows that are already sorted: rows that compare as level share a place. */
export function placesFor(sorted: PlayerStats[], isEternal: boolean): number[] {
  const compare = isEternal ? compareEternalRows : compareLeagueRows;
  const places: number[] = [];
  sorted.forEach((row, i) => places.push(i > 0 && compare(sorted[i - 1], row) === 0 ? places[i - 1] : i + 1));
  return places;
}

// ─── Swiss system ──────────────────────────────────────────────────────────

export interface FinalRow {
  place: number;
  player: Player;
  /** 'final' | 'semi' | 'quarter' | 'round16' | 'swiss' (did not qualify for the playoff) */
  outIn: 'winner' | 'final' | 'semi' | 'quarter' | 'round16' | 'round32' | 'swiss';
  /** Points of the Swiss phase plus the playoff points (sudden-death games count 1.5 / 0.5). */
  points: number;
  playoffPoints: number;
  goalDifference: number;
}

const OUT_IN: Record<number, FinalRow['outIn']> = { 1: 'final', 2: 'semi', 3: 'quarter', 4: 'round16', 5: 'round32' };

/**
 * Final ranking of a Swiss tournament with a playoff, Spielordnung 2026 § 9 Absatz 6.
 *
 * Points = points of the Swiss phase + playoff points (win 2, win after sudden death 1.5, loss after sudden
 * death 0.5, loss 0); goal difference = Swiss phase + playoff. Players are placed by the round they were
 * eliminated in, the last round first; within a round by points, then goal difference, then the final place
 * of the opponent they lost to. Players that did not reach the playoff follow in the order of `swissOrder`.
 * Every playoff pairing is a single game.
 *
 * Reference: finalRankingSwiss in scripts/dtkv-ranking-reference.mjs
 */
export function finalRankingSwiss(
  players: Player[],
  swissMatches: Match[],
  playoffMatches: Match[],
  swissOrder: string[],
): FinalRow[] {
  const totals = new Map(computeStats(players, swissMatches).map(s => [s.player.id, { points: s.points, goalDifference: s.goalDifference }]));
  return finalRankingFromTotals(players, totals, playoffMatches, swissOrder);
}

/** Same as finalRankingSwiss, with the totals of the Swiss phase (points, goal difference) given directly. */
export function finalRankingFromTotals(
  players: Player[],
  swissTotals: Map<string, { points: number; goalDifference: number }>,
  playoffMatches: Match[],
  swissOrder: string[],
): FinalRow[] {
  const byId = new Map(players.map(p => [p.id, p]));
  const isReal = (p: Player | undefined) => !!p && !p.id.startsWith(PLAYOFF_PLACEHOLDER_PREFIX) && p.name !== '–';

  const real = playoffMatches.filter(m => m.phase === 'playoff');
  const played = real.filter(m => !m.isBye && isPlayed(m));
  const winnerOf = (m: Match): string | null =>
    m.isBye ? (isReal(m.homePlayer) ? m.homePlayer.id : isReal(m.awayPlayer) ? m.awayPlayer.id : null)
      : !isPlayed(m) || m.homeScore === m.awayScore ? null
        : (m.homeScore as number) > (m.awayScore as number) ? m.homePlayer.id : m.awayPlayer.id;
  const loserOf = (m: Match): string | null => {
    const w = winnerOf(m);
    return w === null || m.isBye ? null : w === m.homePlayer.id ? m.awayPlayer.id : m.homePlayer.id;
  };

  const gamesOf = (id: string) => played.filter(m => m.homePlayer.id === id || m.awayPlayer.id === id);
  const playoffPoints = (id: string) => gamesOf(id).reduce((sum, m) => {
    const won = winnerOf(m) === id;
    return sum + (won ? (m.suddenDeath ? 1.5 : 2) : (m.suddenDeath ? 0.5 : 0));
  }, 0);
  const playoffDiff = (id: string) => gamesOf(id).reduce((sum, m) =>
    sum + (m.homePlayer.id === id ? 1 : -1) * ((m.homeScore as number) - (m.awayScore as number)), 0);
  const points = (id: string) => (swissTotals.get(id)?.points ?? 0) + playoffPoints(id);
  const diff = (id: string) => (swissTotals.get(id)?.goalDifference ?? 0) + playoffDiff(id);

  const order: { id: string; outIn: FinalRow['outIn'] }[] = [];
  const place = new Map<string, number>();
  const add = (id: string, outIn: FinalRow['outIn']) => {
    if (place.has(id)) return;
    order.push({ id, outIn });
    place.set(id, order.length);
  };

  const final = real.find(m => m.playoffRound === 1);
  const champion = final ? winnerOf(final) : null;
  const runnerUp = final ? loserOf(final) : null;
  if (champion) add(champion, 'winner');
  if (runnerUp) add(runnerUp, 'final');

  const rounds = [...new Set(real.map(m => m.playoffRound ?? 1))].filter(r => r > 1).sort((a, b) => a - b);
  rounds.forEach(round => {
    const out = real
      .filter(m => (m.playoffRound ?? 1) === round && !m.isBye)
      .map(m => ({ id: loserOf(m), by: winnerOf(m) }))
      .filter((o): o is { id: string; by: string | null } => o.id !== null);
    out.sort((a, b) =>
      (points(b.id) - points(a.id)) ||
      (diff(b.id) - diff(a.id)) ||
      ((place.get(a.by ?? '') ?? Infinity) - (place.get(b.by ?? '') ?? Infinity)));
    out.forEach(o => add(o.id, OUT_IN[round] ?? 'swiss'));
  });

  swissOrder.forEach(id => add(id, 'swiss'));
  players.forEach(p => add(p.id, 'swiss'));

  return order.map(({ id, outIn }, i) => ({
    place: i + 1,
    player: byId.get(id) as Player,
    outIn,
    points: points(id),
    playoffPoints: playoffPoints(id),
    goalDifference: diff(id),
  })).filter(r => r.player);
}
