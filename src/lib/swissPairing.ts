import { Player, Match } from '@/types';
import {
  SwissPlayerStat, SwissRound, PlayoffMatch, PlayoffFormat, PlayoffStart,
} from '@/types/swiss';
import { headToHead } from './ranking';
import { BYE_ID, maxSwissRounds, pairKey, pairRound, Rng, SwissPairingError } from './swissPairingEngine';

function uuid() {
  return crypto.randomUUID();
}

function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Stats computation ─────────────────────────────────────────────────────

/**
 * Standings of the Swiss phase. Order (club rule, see docs/UMSETZUNGSPLAN.md 6.6): points per game,
 * Buchholz, goal difference, goals scored, direct comparison, then the lot (drawn once per player and stored
 * with the tournament, so the order does not change when the page is reloaded).
 */
export function computeSwissStats(
  players: Player[],
  rounds: SwissRound[],
  lot?: Record<string, number>
): SwissPlayerStat[] {
  const statsMap = new Map<string, SwissPlayerStat>();

  players.forEach(p => {
    statsMap.set(p.id, {
      player: p,
      points: 0,
      gamesPlayed: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      buchholz: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      avgPoints: 0,
      opponentIds: [],
      hasHadBye: p.hasHadBye ?? false,
    });
  });

  // Check bye rounds
  rounds.forEach(r => {
    if (r.byePlayerId) {
      const stat = statsMap.get(r.byePlayerId);
      if (stat) {
        stat.hasHadBye = true;
        stat.byeRound = r.roundNumber;
      }
    }
  });

  const completedMatches = rounds.flatMap(r => r.matches).filter(m => m.isCompleted);

  completedMatches.forEach(m => {
    const h = statsMap.get(m.homePlayer.id);
    const a = statsMap.get(m.awayPlayer.id);
    if (!h || !a || m.homeScore === null || m.awayScore === null) return;

    h.gamesPlayed++;
    a.gamesPlayed++;
    h.goalsFor += m.homeScore;
    h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore;
    a.goalsAgainst += m.homeScore;
    h.opponentIds.push(m.awayPlayer.id);
    a.opponentIds.push(m.homePlayer.id);

    if (m.homeScore > m.awayScore) {
      h.points += 2; h.wins++;
      a.losses++;
    } else if (m.homeScore < m.awayScore) {
      a.points += 2; a.wins++;
      h.losses++;
    } else {
      h.points += 1; h.draws++;
      a.points += 1; a.draws++;
    }
  });

  // Buchholz: average points of opponents (0.0 – 2.0 range)
  statsMap.forEach(stat => {
    stat.goalDifference = stat.goalsFor - stat.goalsAgainst;
    stat.avgPoints = stat.gamesPlayed > 0 ? stat.points / stat.gamesPlayed : 0;

    if (stat.opponentIds.length > 0) {
      const oppPointsSum = stat.opponentIds.reduce((sum, oppId) => {
        const opp = statsMap.get(oppId);
        if (!opp || opp.gamesPlayed === 0) return sum;
        return sum + opp.points / opp.gamesPlayed;
      }, 0);
      stat.buchholz = parseFloat((oppPointsSum / stat.opponentIds.length).toFixed(4));
    } else {
      stat.buchholz = 0;
    }
  });

  const list = Array.from(statsMap.values());

  list.sort((a, b) => {
    // 1. Average points (desc)
    if (Math.abs(b.avgPoints - a.avgPoints) > 0.0001) return b.avgPoints - a.avgPoints;
    // 2. Buchholz (desc)
    if (Math.abs(b.buchholz - a.buchholz) > 0.0001) return b.buchholz - a.buchholz;
    // 3. Goal difference (desc)
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    // 4. Goals scored (desc)
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // 5. Direct comparison, if the two played each other
    const direct = headToHead(b.player.id, a.player.id, completedMatches);
    if (direct !== 0) return direct;
    // 6. The lot
    const lotA = lot?.[a.player.id];
    const lotB = lot?.[b.player.id];
    if (lotA !== undefined && lotB !== undefined && lotA !== lotB) return lotA - lotB;
    return 0;
  });

  return list;
}

// ─── Swiss round pairing ───────────────────────────────────────────────────

/** Pairs that were played in the group phase, and the byes (as pairs against BYE_ID). */
function playedPairsOf(rounds: SwissRound[]): Set<string> {
  const played = new Set<string>();
  rounds.forEach(r => {
    r.matches.forEach(m => played.add(pairKey(m.homePlayer.id, m.awayPlayer.id)));
    if (r.byePlayerId) played.add(pairKey(r.byePlayerId, BYE_ID));
  });
  return played;
}

/** Player ids in ranking order for the next round: round 1 shuffled, later by the standings (ties shuffled). */
function rankingFor(players: Player[], rounds: SwissRound[], targetRound: number, rng: Rng, lot?: Record<string, number>): string[] {
  if (targetRound === 1) return shuffle(players, rng).map(p => p.id);
  const stats = computeSwissStats(players, rounds, lot);
  return shuffleWithinGroups(stats.map(s => s.player), stats, rng).map(p => p.id);
}

/** Draws a whole round (all matches plus the bye) with the pairing engine. Throws SwissPairingError if impossible. */
function drawRound(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number,
  totalRounds: number,
  rng: Rng,
  lot?: Record<string, number>,
): { matches: Match[]; byePlayerId?: string } {
  const ranking = rankingFor(players, rounds, targetRound, rng, lot);
  const rank = new Map(ranking.map((id, i) => [id, i]));
  const byId = new Map(players.map(p => [p.id, p]));
  // More rounds than players can meet cannot be drawn; the tournament is shortened to what is possible
  const plannedRounds = Math.min(totalRounds, maxSwissRounds(players.length));

  const pairs = pairRound({
    ranking,
    played: playedPairsOf(rounds),
    roundsAfter: Math.max(0, plannedRounds - targetRound),
  });
  if (!pairs) {
    throw new SwissPairingError(
      `Für Runde ${targetRound} ist keine Auslosung ohne Wiederholung möglich. Bitte die Rundenzahl prüfen.`,
    );
  }

  let byePlayerId: string | undefined;
  const matches: Match[] = [];
  pairs.forEach(([a, b]) => {
    if (a === BYE_ID || b === BYE_ID) {
      byePlayerId = a === BYE_ID ? b : a;
      return;
    }
    const { home, away } = assignSides(byId.get(a) as Player, byId.get(b) as Player, rounds, rng);
    matches.push({
      id: uuid(),
      round: targetRound,
      homePlayer: home,
      awayPlayer: away,
      homeScore: null,
      awayScore: null,
      isCompleted: false,
    });
  });
  // Best-ranked pairing first
  matches.sort((m, n) =>
    Math.min(rank.get(m.homePlayer.id) as number, rank.get(m.awayPlayer.id) as number) -
    Math.min(rank.get(n.homePlayer.id) as number, rank.get(n.awayPlayer.id) as number));
  return { matches, byePlayerId };
}

/**
 * Generate pairings for the next Swiss round.
 * Round 1: random. Later rounds: players of similar rank meet. In the group phase of a tournament no pair meets
 * twice and nobody has a second bye; a round is only drawn when the rounds that are still planned stay drawable.
 * Throws SwissPairingError when no such round exists.
 */
export function generateSwissRoundMatches(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number,
  totalRounds: number,
  rng: Rng = Math.random,
  lot?: Record<string, number>,
): { matches: Match[]; byePlayerId?: string } {
  return drawRound(players, rounds, targetRound, totalRounds, rng, lot);
}

// ─── Referee-mode round generation ────────────────────────────────────────

/**
 * Referee mode: the whole round is drawn like a normal round, then the matches are spread over two passes in a
 * zigzag by rank (best match in pass 1, next in pass 2, ...). The referees of a pass are the players who play in the
 * other pass, plus the player who has the bye (he does not play this round, so he can referee in both passes).
 * The passes may differ by one match.
 */
export function generateRefereeRound(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number,
  totalRounds: number,
  rng: Rng = Math.random,
  lot?: Record<string, number>,
): { pass1: SwissRound; pass2: SwissRound; byePlayerId?: string } {
  const { matches, byePlayerId } = drawRound(players, rounds, targetRound, totalRounds, rng, lot);

  const matchesOf = (offset: 0 | 1) => matches.filter((_, i) => i % 2 === offset);
  const playersOf = (ms: Match[]) => ms.flatMap(m => [m.homePlayer.id, m.awayPlayer.id]);
  const matches1 = matchesOf(0);
  const matches2 = matchesOf(1);
  const withBye = (ids: string[]) => (byePlayerId ? [...ids, byePlayerId] : ids);

  const pass1: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 1,
    matches: matches1,
    referees: withBye(playersOf(matches2)),
    isCompleted: false,
    byePlayerId,
  };
  const pass2: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 2,
    matches: matches2,
    referees: withBye(playersOf(matches1)),
    isCompleted: false,
  };
  return { pass1, pass2, byePlayerId };
}

function assignSides(p1: Player, p2: Player, rounds: SwissRound[], rng: Rng): { home: Player; away: Player } {
  const p1w = countWhiteGames(p1.id, rounds);
  const p2w = countWhiteGames(p2.id, rounds);
  if (p1w < p2w) return { home: p1, away: p2 };
  if (p2w < p1w) return { home: p2, away: p1 };
  return rng() < 0.5 ? { home: p1, away: p2 } : { home: p2, away: p1 };
}

function shuffleWithinGroups(players: Player[], stats: SwissPlayerStat[], rng: Rng): Player[] {
  const groups = new Map<number, Player[]>();
  stats.forEach(s => {
    const pts = s.points;
    if (!groups.has(pts)) groups.set(pts, []);
    groups.get(pts)!.push(s.player);
  });
  const result: Player[] = [];
  Array.from(groups.entries())
    .sort(([a], [b]) => b - a)
    .forEach(([, group]) => result.push(...shuffle(group, rng)));
  return result;
}

function countWhiteGames(playerId: string, rounds: SwissRound[]): number {
  return rounds.flatMap(r => r.matches).filter(m => m.homePlayer.id === playerId).length;
}

// ─── Playoff bracket generation ────────────────────────────────────────────

export function generatePlayoff(
  stats: SwissPlayerStat[],
  format: PlayoffFormat,
  startRound: PlayoffStart
): PlayoffMatch[] {
  let bracketSize: number;

  if (format === 'standard') {
    bracketSize = startRound === 'r16' ? 16 : startRound === 'qf' ? 8 : 4;
  } else {
    const n = stats.length;
    bracketSize = n >= 16 ? 16 : n >= 8 ? 8 : 4;
  }

  const advancers = stats.slice(0, Math.min(bracketSize, stats.length));

  // Pad with BYEs
  while (advancers.length < bracketSize) {
    advancers.push({
      player: { id: `BYE-${uuid()}`, name: 'Freilos' },
      points: 0, gamesPlayed: 0, goalsFor: 0, goalsAgainst: 0,
      goalDifference: 0, buchholz: 0, wins: 0, draws: 0, losses: 0,
      avgPoints: 0, opponentIds: [], hasHadBye: false,
    });
  }

  // Build seed order so #1 and #2 are in different halves
  function buildSeedOrder(n: number): number[] {
    if (n === 2) return [0, 1];
    const prev = buildSeedOrder(n / 2);
    const result: number[] = [];
    for (const s of prev) {
      result.push(s);
      result.push(n - 1 - s);
    }
    return result;
  }

  const seedOrder = buildSeedOrder(bracketSize);
  const roundDepth = Math.log2(bracketSize);
  const matches: PlayoffMatch[] = [];

  for (let i = 0; i < bracketSize / 2; i++) {
    const idxA = seedOrder[i * 2];
    const idxB = seedOrder[i * 2 + 1];
    const topSeed = advancers[idxA];
    const bottomSeed = advancers[idxB];
    const isBye = bottomSeed.player.name === 'Freilos' || topSeed.player.name === 'Freilos';

    matches.push({
      id: uuid(),
      round: roundDepth,
      matchNumber: i + 1,
      homePlayer: topSeed.player.name === 'Freilos' ? null : topSeed.player,
      awayPlayer: bottomSeed.player.name === 'Freilos' ? null : bottomSeed.player,
      homeScore: null,
      awayScore: null,
      isCompleted: isBye,
      isBye,
    });
  }

  let roundMatches = bracketSize / 2;
  for (let r = roundDepth - 1; r >= 1; r--) {
    roundMatches = roundMatches / 2;
    for (let m = 0; m < roundMatches; m++) {
      matches.push({
        id: uuid(),
        round: r,
        matchNumber: m + 1,
        homePlayer: null,
        awayPlayer: null,
        homeScore: null,
        awayScore: null,
        isCompleted: false,
      });
    }
  }

  return matches;
}

export function getRoundName(round: number): string {
  switch (round) {
    case 1: return 'Finale';
    case 2: return 'Halbfinale';
    case 3: return 'Viertelfinale';
    case 4: return 'Achtelfinale';
    default: return `Runde ${round}`;
  }
}

// ─── Advance playoff bracket after a result ────────────────────────────────

export function advancePlayoffBracket(matches: PlayoffMatch[]): PlayoffMatch[] {
  const updated = [...matches];

  updated
    .filter(m => m.isCompleted && !m.isBye)
    .forEach(m => {
      const winner = getPlayoffWinner(m);
      if (!winner) return;
      const nextRound = m.round - 1;
      const nextMatchNumber = Math.ceil(m.matchNumber / 2);
      const slot = updated.find(nm => nm.round === nextRound && nm.matchNumber === nextMatchNumber);
      if (!slot) return;
      const isHomeSlot = m.matchNumber % 2 === 1;
      const idx = updated.indexOf(slot);
      updated[idx] = {
        ...slot,
        homePlayer: isHomeSlot ? winner : slot.homePlayer,
        awayPlayer: !isHomeSlot ? winner : slot.awayPlayer,
      };
    });

  updated
    .filter(m => m.isBye)
    .forEach(m => {
      const winner = m.homePlayer ?? m.awayPlayer;
      if (!winner) return;
      const nextRound = m.round - 1;
      const nextMatchNumber = Math.ceil(m.matchNumber / 2);
      const slot = updated.find(nm => nm.round === nextRound && nm.matchNumber === nextMatchNumber);
      if (!slot) return;
      const isHomeSlot = m.matchNumber % 2 === 1;
      const idx = updated.indexOf(slot);
      updated[idx] = {
        ...slot,
        homePlayer: isHomeSlot ? winner : slot.homePlayer,
        awayPlayer: !isHomeSlot ? winner : slot.awayPlayer,
      };
    });

  return updated;
}

export function getPlayoffWinner(m: PlayoffMatch): Player | null {
  if (m.isBye) return m.homePlayer ?? m.awayPlayer;
  if (!m.isCompleted || m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return m.homePlayer;
  if (m.awayScore > m.homeScore) return m.awayPlayer;
  return null;
}
