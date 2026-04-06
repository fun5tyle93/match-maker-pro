import { Player, Match } from '@/types';
import {
  SwissPlayerStat, SwissRound, PlayoffMatch, PlayoffFormat, PlayoffStart,
} from '@/types/swiss';

function uuid() {
  return crypto.randomUUID();
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Stats computation ─────────────────────────────────────────────────────

export function computeSwissStats(
  players: Player[],
  rounds: SwissRound[]
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
      hasHadBye: false,
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
    return b.goalDifference - a.goalDifference;
  });

  return list;
}

// ─── Swiss round pairing ───────────────────────────────────────────────────

/**
 * Generate pairings for the next Swiss round.
 * Round 1: random. Subsequent rounds: match players with similar points.
 * No player meets the same opponent twice.
 * Handles BYE for odd player counts (lowest-ranked who hasn't had one yet).
 */
export function generateSwissRoundMatches(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number
): { matches: Match[]; byePlayerId?: string } {
  const stats = computeSwissStats(players, rounds);

  // Build set of already-played pairs
  const playedPairs = new Set<string>();
  rounds.flatMap(r => r.matches).forEach(m => {
    const key = [m.homePlayer.id, m.awayPlayer.id].sort().join('|');
    playedPairs.add(key);
  });

  // Determine BYE player if odd number
  let byePlayerId: string | undefined;
  let activePlayers: Player[];

  if (players.length % 2 === 1) {
    // Find lowest-ranked player who hasn't had a bye yet
    const reversed = [...stats].reverse(); // worst first
    const byeCandidate = reversed.find(s => !s.hasHadBye);
    if (byeCandidate) {
      byePlayerId = byeCandidate.player.id;
    } else {
      // All have had byes, pick the worst again
      byePlayerId = reversed[0].player.id;
    }
    activePlayers = players.filter(p => p.id !== byePlayerId);
  } else {
    activePlayers = [...players];
  }

  let orderedPlayers: Player[];

  if (targetRound === 1) {
    orderedPlayers = shuffle(activePlayers);
  } else {
    // Order by standings, shuffle within same-point groups
    const activeStats = stats.filter(s => s.player.id !== byePlayerId);
    orderedPlayers = shuffleWithinGroups(
      activeStats.map(s => s.player),
      activeStats
    );
  }

  const matches: Match[] = [];
  const paired = new Set<string>();

  // Greedy pairing: pair adjacent players not already matched
  for (let i = 0; i < orderedPlayers.length; i++) {
    const p1 = orderedPlayers[i];
    if (paired.has(p1.id)) continue;

    let paired2 = false;
    for (let j = i + 1; j < orderedPlayers.length; j++) {
      const p2 = orderedPlayers[j];
      if (paired.has(p2.id)) continue;
      const key = [p1.id, p2.id].sort().join('|');
      if (playedPairs.has(key)) continue;

      // Assign sides fairly
      const { home, away } = assignSides(p1, p2, rounds);

      matches.push({
        id: uuid(),
        round: targetRound,
        homePlayer: home,
        awayPlayer: away,
        homeScore: null,
        awayScore: null,
        isCompleted: false,
      });

      paired.add(p1.id);
      paired.add(p2.id);
      paired2 = true;
      break;
    }

    // Fallback: relax rematch constraint
    if (!paired2) {
      for (let j = i + 1; j < orderedPlayers.length; j++) {
        const p2 = orderedPlayers[j];
        if (paired.has(p2.id)) continue;

        const { home, away } = assignSides(p1, p2, rounds);
        matches.push({
          id: uuid(),
          round: targetRound,
          homePlayer: home,
          awayPlayer: away,
          homeScore: null,
          awayScore: null,
          isCompleted: false,
        });
        paired.add(p1.id);
        paired.add(p2.id);
        break;
      }
    }
  }

  return { matches, byePlayerId };
}

function assignSides(p1: Player, p2: Player, rounds: SwissRound[]): { home: Player; away: Player } {
  const p1w = countWhiteGames(p1.id, rounds);
  const p2w = countWhiteGames(p2.id, rounds);
  if (p1w < p2w) return { home: p1, away: p2 };
  if (p2w < p1w) return { home: p2, away: p1 };
  return Math.random() < 0.5 ? { home: p1, away: p2 } : { home: p2, away: p1 };
}

function shuffleWithinGroups(players: Player[], stats: SwissPlayerStat[]): Player[] {
  const groups = new Map<number, Player[]>();
  stats.forEach(s => {
    const pts = s.points;
    if (!groups.has(pts)) groups.set(pts, []);
    groups.get(pts)!.push(s.player);
  });
  const result: Player[] = [];
  Array.from(groups.entries())
    .sort(([a], [b]) => b - a)
    .forEach(([, group]) => result.push(...shuffle(group)));
  return result;
}

function countWhiteGames(playerId: string, rounds: SwissRound[]): number {
  return rounds.flatMap(r => r.matches).filter(m => m.homePlayer.id === playerId).length;
}

// ─── Referee-mode round generation ────────────────────────────────────────

/**
 * Referee mode: zigzag assignment.
 * Pairings sorted by rank → alternating shifts: P1 shift1, P2 shift2, P3 shift1...
 * Players playing in shift 1 referee shift 2 and vice versa.
 * refereeCount tracker ensures fairness.
 */
export function generateRefereeRound(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number
): { pass1: SwissRound; pass2: SwissRound; byePlayerId?: string } {
  const stats = computeSwissStats(players, rounds);

  // Handle BYE if odd
  let byePlayerId: string | undefined;
  let activePlayers: Player[];

  if (players.length % 2 === 1) {
    const reversed = [...stats].reverse();
    const byeCandidate = reversed.find(s => !s.hasHadBye);
    byePlayerId = byeCandidate ? byeCandidate.player.id : reversed[0].player.id;
    activePlayers = players.filter(p => p.id !== byePlayerId);
  } else {
    activePlayers = [...players];
  }

  const activeStats = stats.filter(s => activePlayers.some(p => p.id === s.player.id));

  // Build played pairs
  const playedPairs = new Set<string>();
  rounds.flatMap(r => r.matches).forEach(m => {
    playedPairs.add([m.homePlayer.id, m.awayPlayer.id].sort().join('|'));
  });

  // Create all pairings first (ordered by rank)
  const orderedPlayers = activeStats.map(s => s.player);
  const allPairings: { home: Player; away: Player }[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < orderedPlayers.length; i++) {
    const p1 = orderedPlayers[i];
    if (paired.has(p1.id)) continue;
    for (let j = i + 1; j < orderedPlayers.length; j++) {
      const p2 = orderedPlayers[j];
      if (paired.has(p2.id)) continue;
      const key = [p1.id, p2.id].sort().join('|');
      if (playedPairs.has(key)) continue;

      const sides = assignSides(p1, p2, rounds);
      allPairings.push(sides);
      paired.add(p1.id);
      paired.add(p2.id);
      break;
    }
  }

  // Fallback for unpaired
  for (let i = 0; i < orderedPlayers.length; i++) {
    const p1 = orderedPlayers[i];
    if (paired.has(p1.id)) continue;
    for (let j = i + 1; j < orderedPlayers.length; j++) {
      const p2 = orderedPlayers[j];
      if (paired.has(p2.id)) continue;
      const sides = assignSides(p1, p2, rounds);
      allPairings.push(sides);
      paired.add(p1.id);
      paired.add(p2.id);
      break;
    }
  }

  // Zigzag: even index → shift 1, odd index → shift 2
  const shift1Pairings: { home: Player; away: Player }[] = [];
  const shift2Pairings: { home: Player; away: Player }[] = [];
  allPairings.forEach((pairing, idx) => {
    if (idx % 2 === 0) shift1Pairings.push(pairing);
    else shift2Pairings.push(pairing);
  });

  // Players in shift1 matches
  const shift1PlayerIds = new Set(shift1Pairings.flatMap(p => [p.home.id, p.away.id]));
  const shift2PlayerIds = new Set(shift2Pairings.flatMap(p => [p.home.id, p.away.id]));

  // Referees: shift2 players referee shift1, shift1 players referee shift2
  // Use refereeCount to pick fairest referees
  const refereeCountMap = new Map<string, number>();
  activePlayers.forEach(p => refereeCountMap.set(p.id, 0));
  rounds.forEach(r => {
    if (r.referees) {
      r.referees.forEach(id => refereeCountMap.set(id, (refereeCountMap.get(id) ?? 0) + 1));
    }
  });

  // Shift1 referees come from shift2 players (sorted by fewest referee stints)
  const shift1Referees = [...shift2PlayerIds]
    .sort((a, b) => (refereeCountMap.get(a) ?? 0) - (refereeCountMap.get(b) ?? 0));

  const shift2Referees = [...shift1PlayerIds]
    .sort((a, b) => (refereeCountMap.get(a) ?? 0) - (refereeCountMap.get(b) ?? 0));

  const toMatches = (pairings: { home: Player; away: Player }[]): Match[] =>
    pairings.map((p, idx) => ({
      id: uuid(),
      round: targetRound,
      homePlayer: p.home,
      awayPlayer: p.away,
      homeScore: null,
      awayScore: null,
      isCompleted: false,
    }));

  const pass1: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 1,
    matches: toMatches(shift1Pairings),
    referees: shift1Referees,
    isCompleted: false,
    byePlayerId,
  };

  const pass2: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 2,
    matches: toMatches(shift2Pairings),
    referees: shift2Referees,
    isCompleted: false,
  };

  return { pass1, pass2, byePlayerId };
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

  const roundDepth = Math.log2(bracketSize);
  const matches: PlayoffMatch[] = [];

  for (let i = 0; i < bracketSize / 2; i++) {
    const topSeed = advancers[i];
    const bottomSeed = advancers[bracketSize - 1 - i];
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
