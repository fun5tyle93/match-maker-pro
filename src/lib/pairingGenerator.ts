import { Player, Match, PlayerStats } from '@/types';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Calculate matches per round based on player count (optimized for odd numbers)
function getMatchesPerRound(playerCount: number): number {
  return Math.floor(playerCount / 2);
}

/**
 * Round-Robin Pairing Generator
 *
 * Goals:
 *  1. Every player meets every other player exactly once per repetition (circle method).
 *  2. Side (home = Weiß, away = Schwarz) is balanced as evenly as possible across the
 *     entire session, taking both total count AND the last-used role into account.
 *  3. Table assignment is randomized each round so that, over the session, every player
 *     ends up on every table roughly equally often.
 */
export function generatePairings(
  players: Player[],
  matchesPerPairing: number = 1
): { matches: Match[]; roundCount: number } {
  if (players.length < 2) {
    return { matches: [], roundCount: 0 };
  }

  const n = players.length;
  const isOdd = n % 2 === 1;

  // Add a dummy "BYE" slot when player count is odd so the circle method works
  const allPlayers = isOdd ? [...players, { id: 'BYE', name: 'BYE' }] : [...players];
  const numPlayers = allPlayers.length;
  const numRounds = numPlayers - 1;

  const matches: Match[] = [];
  const matchId = () => crypto.randomUUID();

  // --- Tracking state for balanced side & table distribution ---
  // whiteCount: how many times each player was home (= Weiß)
  // lastRole:   the role a player had in the most recent game (to avoid streaks)
  // tableCount: how many times each player appeared on each table index
  const whiteCount: Record<string, number> = {};
  const lastRole: Record<string, 'home' | 'away' | null> = {};
  const tableCount: Record<string, Record<number, number>> = {};

  const numTables = Math.floor(numPlayers / 2);

  // Initialize tracking for ALL players (including BYE)
  allPlayers.forEach(p => {
    whiteCount[p.id] = 0;
    lastRole[p.id] = null;
    tableCount[p.id] = {};
    for (let t = 0; t < numTables; t++) tableCount[p.id][t] = 0;
  });

  // Circle method: keep allPlayers[0] fixed, rotate the rest
  const fixed = allPlayers[0];
  const rotating = allPlayers.slice(1);

  for (let repetition = 0; repetition < matchesPerPairing; repetition++) {
    const rotatingCopy = [...rotating];

    for (let round = 0; round < numRounds; round++) {
      const roundNumber = repetition * numRounds + round + 1;
      const roundPlayers = [fixed, ...rotatingCopy];

      // Build raw pairings for this round (circle method)
      const rawPairs: [Player, Player][] = [];
      for (let i = 0; i < numPlayers / 2; i++) {
        const p1 = roundPlayers[i];
        const p2 = roundPlayers[numPlayers - 1 - i];
        if (p1.id === 'BYE' || p2.id === 'BYE') continue;
        rawPairs.push([p1, p2]);
      }

      // --- Assign sides (home = Weiß) fairly ---
      // Scoring: prefer the player with fewer white games; break ties by last role.
      const sidesAssigned: { home: Player; away: Player }[] = rawPairs.map(([p1, p2]) => {
        // Score > 0 means p1 should be home, < 0 means p2 should be home
        let score = whiteCount[p2.id] - whiteCount[p1.id]; // p1 home if p2 had more white

        // Tiebreak by last role: prefer not repeating the same side
        if (score === 0) {
          const p1Bonus = lastRole[p1.id] === 'away' ? 1 : lastRole[p1.id] === 'home' ? -1 : 0;
          const p2Bonus = lastRole[p2.id] === 'away' ? 1 : lastRole[p2.id] === 'home' ? -1 : 0;
          score = p1Bonus - p2Bonus;
        }

        // Coin flip if still tied
        if (score === 0) score = Math.random() < 0.5 ? 1 : -1;

        return score > 0
          ? { home: p1, away: p2 }
          : { home: p2, away: p1 };
      });

      // --- Assign tables fairly via randomized scoring ---
      // CRITICAL FIX: Shuffle table indices FOR EACH ROUND to ensure uniform distribution
      // This ensures that tables are randomly distributed per round, not fixed by pair order
      const tableIndices = shuffleArray(
        Array.from({ length: sidesAssigned.length }, (_, i) => i)
      );

      // For each pair, find the table index where both players have played the least
      // We use a greedy assignment on the shuffled indices to add randomness while
      // still respecting the balance objective.
      const usedTables = new Set<number>();
      const assignedTables: number[] = new Array(sidesAssigned.length).fill(-1);

      // Build a cost matrix: cost[pair][tableIdx] = sum of tableCount for both players
      for (let pairIdx = 0; pairIdx < sidesAssigned.length; pairIdx++) {
        const { home, away } = sidesAssigned[pairIdx];

        // Among still-available tables, pick the one both players have visited least
        let bestTable = -1;
        let bestCost = Infinity;
        // Shuffle candidate tables to break ties randomly
        const candidates = shuffleArray(tableIndices.filter(t => !usedTables.has(t)));

        for (const t of candidates) {
          const cost =
            (tableCount[home.id][t] ?? 0) +
            (tableCount[away.id][t] ?? 0) +
            Math.random() * 0.5; // small random jitter for ties
          if (cost < bestCost) {
            bestCost = cost;
            bestTable = t;
          }
        }

        assignedTables[pairIdx] = bestTable;
        usedTables.add(bestTable);
      }

      // Commit matches and update trackers
      sidesAssigned.forEach(({ home, away }, pairIdx) => {
        const tableIdx = assignedTables[pairIdx];

        whiteCount[home.id]++;
        lastRole[home.id] = 'home';
        lastRole[away.id] = 'away';

        if (tableCount[home.id][tableIdx] !== undefined) tableCount[home.id][tableIdx]++;
        if (tableCount[away.id][tableIdx] !== undefined) tableCount[away.id][tableIdx]++;

        matches.push({
          id: matchId(),
          round: roundNumber,
          homePlayer: home,
          awayPlayer: away,
          homeScore: null,
          awayScore: null,
          isCompleted: false,
        });
      });

      // Rotate the circle (keep fixed[0], rotate rest)
      const last = rotatingCopy.pop()!;
      rotatingCopy.unshift(last);
    }
  }

  const totalRounds = numRounds * matchesPerPairing;
  return { matches, roundCount: totalRounds };
}

// Calculate head-to-head result between two players
function getHeadToHead(
  playerA: Player,
  playerB: Player,
  matches: Match[]
): number {
  let pointsA = 0;
  let pointsB = 0;

  matches.filter(m => m.isCompleted).forEach(match => {
    const isAHome = match.homePlayer.id === playerA.id && match.awayPlayer.id === playerB.id;
    const isBHome = match.homePlayer.id === playerB.id && match.awayPlayer.id === playerA.id;

    if (isAHome && match.homeScore !== null && match.awayScore !== null) {
      if (match.homeScore > match.awayScore) pointsA += 2;
      else if (match.homeScore < match.awayScore) pointsB += 2;
      else { pointsA += 1; pointsB += 1; }
    } else if (isBHome && match.homeScore !== null && match.awayScore !== null) {
      if (match.homeScore > match.awayScore) pointsB += 2;
      else if (match.homeScore < match.awayScore) pointsA += 2;
      else { pointsA += 1; pointsB += 1; }
    }
  });

  return pointsA - pointsB;
}

export function calculatePlayerStats(players: Player[], matches: Match[]): PlayerStats[] {
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

  // Calculate points and goal difference
  stats.forEach(s => {
    s.points = s.wins * 2 + s.draws * 1;
    s.pointsAgainst = s.losses * 2 + s.draws * 1;
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  });

  // Sort by: points, goal difference, goals scored, goals against (fewer is better), head-to-head
  stats.sort((a, b) => {
    // 1. Points (highest first)
    if (b.points !== a.points) return b.points - a.points;
    // 2. Goal difference (best first)
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    // 3. Goals scored (most first)
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // 4. Goals against (fewest first)
    if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;
    // 5. Head-to-head comparison
    const h2h = getHeadToHead(a.player, b.player, matches);
    return -h2h; // Negative because we want higher points for a to come first
  });

  return stats;
}

// Calculate similarity between two strings (Levenshtein distance based)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  
  return costs[s2.length];
}
