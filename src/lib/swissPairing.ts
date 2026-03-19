import { Player, Match } from '@/types';
import { SwissPlayerStat, SwissRound, SwissSession, PlayoffMatch, PlayoffFormat, PlayoffStart } from '@/types/swiss';

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
    });
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

  // Buchholz: sum of opponents' points
  statsMap.forEach(stat => {
    stat.goalDifference = stat.goalsFor - stat.goalsAgainst;
    stat.avgPoints = stat.gamesPlayed > 0 ? stat.points / stat.gamesPlayed : 0;
    stat.buchholz = stat.opponentIds.reduce((sum, oppId) => {
      return sum + (statsMap.get(oppId)?.points ?? 0);
    }, 0);
  });

  const list = Array.from(statsMap.values());

  list.sort((a, b) => {
    // 1. Average points
    if (Math.abs(b.avgPoints - a.avgPoints) > 0.0001) return b.avgPoints - a.avgPoints;
    // 2. Buchholz
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    // 3. Goal difference
    return b.goalDifference - a.goalDifference;
  });

  return list;
}

// ─── Swiss round pairing ───────────────────────────────────────────────────

/**
 * Generate pairings for next Swiss round.
 * Round 1: random. Subsequent rounds: match players with similar points.
 * No player meets the same opponent twice.
 */
export function generateSwissRoundMatches(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number
): Match[] {
  const stats = computeSwissStats(players, rounds);

  // Build a set of already-played pair keys
  const playedPairs = new Set<string>();
  rounds.flatMap(r => r.matches).forEach(m => {
    const key = [m.homePlayer.id, m.awayPlayer.id].sort().join('|');
    playedPairs.add(key);
  });

  let orderedPlayers: Player[];

  if (targetRound === 1) {
    // Round 1: random pairings
    orderedPlayers = shuffle(players);
  } else {
    // Sort by current standings (similar points should face each other)
    orderedPlayers = stats.map(s => s.player);
    // Add small random shuffle within same-point groups
    orderedPlayers = shuffleWithinGroups(orderedPlayers, stats);
  }

  const matches: Match[] = [];
  const paired = new Set<string>();

  // Greedy pairing: pair adjacent players not already matched
  for (let i = 0; i < orderedPlayers.length; i++) {
    const p1 = orderedPlayers[i];
    if (paired.has(p1.id)) continue;

    // Find the nearest unpaired player p1 hasn't played yet
    let paired2 = false;
    for (let j = i + 1; j < orderedPlayers.length; j++) {
      const p2 = orderedPlayers[j];
      if (paired.has(p2.id)) continue;
      const key = [p1.id, p2.id].sort().join('|');
      if (playedPairs.has(key)) continue;

      // Assign sides fairly (white count tracking)
      const p1WhiteCount = countWhiteGames(p1.id, rounds);
      const p2WhiteCount = countWhiteGames(p2.id, rounds);

      let home: Player, away: Player;
      if (p1WhiteCount < p2WhiteCount) {
        home = p1; away = p2;
      } else if (p2WhiteCount < p1WhiteCount) {
        home = p2; away = p1;
      } else {
        home = Math.random() < 0.5 ? p1 : p2;
        away = home.id === p1.id ? p2 : p1;
      }

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

    // If no unpaired opponent found (all already played), relax rematch constraint
    if (!paired2) {
      for (let j = i + 1; j < orderedPlayers.length; j++) {
        const p2 = orderedPlayers[j];
        if (paired.has(p2.id)) continue;

        const p1WhiteCount = countWhiteGames(p1.id, rounds);
        const p2WhiteCount = countWhiteGames(p2.id, rounds);
        const home = p1WhiteCount <= p2WhiteCount ? p1 : p2;
        const away = home.id === p1.id ? p2 : p1;

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

  return matches;
}

function shuffleWithinGroups(players: Player[], stats: SwissPlayerStat[]): Player[] {
  const groups = new Map<number, Player[]>();
  stats.forEach(s => {
    const pts = s.points;
    if (!groups.has(pts)) groups.set(pts, []);
    groups.get(pts)!.push(s.player);
  });
  const result: Player[] = [];
  // Process groups from highest to lowest points
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
 * In referee mode, each round has two passes:
 *   Pass 1: half the players play, the other half referee
 *   Pass 2: roles swap
 * We aim for equal table counts across both passes.
 */
export function generateRefereeRound(
  players: Player[],
  rounds: SwissRound[],
  targetRound: number
): { pass1: SwissRound; pass2: SwissRound } {
  const n = players.length;
  const stats = computeSwissStats(players, rounds);

  // Split into two groups as evenly as possible, alternating by ranking
  // (top-ranked players should ideally play against similar players in same pass)
  const groupA: Player[] = [];
  const groupB: Player[] = [];
  stats.forEach((s, i) => {
    if (i % 2 === 0) groupA.push(s.player);
    else groupB.push(s.player);
  });

  const pass1Matches = buildPassMatches(groupA, rounds, targetRound);
  const pass2Matches = buildPassMatches(groupB, rounds, targetRound);

  const pass1: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 1,
    matches: pass1Matches,
    referees: groupB.map(p => p.id),
    isCompleted: false,
  };

  const pass2: SwissRound = {
    roundNumber: targetRound,
    phase: 'referee',
    pass: 2,
    matches: pass2Matches,
    referees: groupA.map(p => p.id),
    isCompleted: false,
  };

  return { pass1, pass2 };
}

function buildPassMatches(
  group: Player[],
  rounds: SwissRound[],
  targetRound: number
): Match[] {
  // Use same Swiss pairing within the group
  const playedPairs = new Set<string>();
  rounds.flatMap(r => r.matches).forEach(m => {
    const key = [m.homePlayer.id, m.awayPlayer.id].sort().join('|');
    playedPairs.add(key);
  });

  const shuffled = shuffle(group);
  const matches: Match[] = [];
  const paired = new Set<string>();

  for (let i = 0; i < shuffled.length; i++) {
    const p1 = shuffled[i];
    if (paired.has(p1.id)) continue;

    for (let j = i + 1; j < shuffled.length; j++) {
      const p2 = shuffled[j];
      if (paired.has(p2.id)) continue;
      const key = [p1.id, p2.id].sort().join('|');
      if (playedPairs.has(key)) continue;

      const p1w = countWhiteGames(p1.id, rounds);
      const p2w = countWhiteGames(p2.id, rounds);
      const home = p1w <= p2w ? p1 : p2;
      const away = home.id === p1.id ? p2 : p1;

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
  return matches;
}

// ─── Playoff bracket generation ────────────────────────────────────────────

export function generatePlayoff(
  stats: SwissPlayerStat[],
  format: PlayoffFormat,
  startRound: PlayoffStart
): PlayoffMatch[] {
  let bracketSize: number;
  let advancers: SwissPlayerStat[];

  if (format === 'standard') {
    bracketSize = startRound === 'r16' ? 16 : startRound === 'qf' ? 8 : 4;
  } else {
    // Progressive: use natural bracket of 16, 8, or 4 closest to player count
    const n = stats.length;
    bracketSize = n >= 16 ? 16 : n >= 8 ? 8 : 4;
  }

  advancers = stats.slice(0, Math.min(bracketSize, stats.length));

  // Pad with BYEs if necessary
  while (advancers.length < bracketSize) {
    advancers.push({
      player: { id: `BYE-${uuid()}`, name: 'Freilos' },
      points: 0, gamesPlayed: 0, goalsFor: 0, goalsAgainst: 0,
      goalDifference: 0, buchholz: 0, wins: 0, draws: 0, losses: 0,
      avgPoints: 0, opponentIds: [],
    });
  }

  const roundDepth = Math.log2(bracketSize); // e.g. 16→4, 8→3, 4→2
  const matches: PlayoffMatch[] = [];

  // Generate first round (highest seed vs lowest seed, standard seeding)
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

  // Generate empty slots for subsequent rounds
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

  // For each completed match, put the winner into the next round slot
  updated
    .filter(m => m.isCompleted && !m.isBye)
    .forEach(m => {
      const winner = getPlayoffWinner(m);
      if (!winner) return;

      // Find the correct next-round slot
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

  // Handle BYEs: advance immediately
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
  return null; // draw – should not happen in KO
}
