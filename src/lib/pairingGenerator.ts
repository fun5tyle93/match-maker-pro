import { Player, Match, PlayerStats } from '@/types';

// Larger than any balance cost, so a pairing only repeats a table when it cannot be avoided
const REPEAT_PENALTY = 1000;

function pairKey(a: Player, b: Player): string {
  return [a.id, b.id].sort().join('|');
}

/**
 * Minimum-cost assignment of rows to columns (Hungarian algorithm) for a square matrix.
 * Returns, for each row, the index of the column it is assigned to.
 */
function assignMinCost(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row currently assigned to column j (1-based)
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) assignment[p[j] - 1] = j - 1;
  }
  return assignment;
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
  // pairTableUse: how often a pairing (by player ids) was already played on each table
  const pairTableUse: Record<string, Record<number, number>> = {};

  // One table per match in a round (the BYE pair of an odd field plays no match)
  const numTables = Math.floor(n / 2);

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

      // --- Assign tables: optimal assignment of pairs to tables ---
      // Cost of putting a pair on a table:
      //  * balance:   how often both players already played that table
      //  * no repeat: a pairing that already played on that table (earlier
      //    repetition) pays REPEAT_PENALTY, so it moves to another table
      //    whenever a different assignment exists
      //  * jitter:    breaks ties randomly
      // All pairs are assigned at once, so no pair gets priority over the others.
      const pairCount = sidesAssigned.length;
      const costMatrix = sidesAssigned.map(({ home, away }) => {
        const key = pairKey(home, away);
        return Array.from({ length: pairCount }, (_, t) =>
          (tableCount[home.id][t] ?? 0) +
          (tableCount[away.id][t] ?? 0) +
          REPEAT_PENALTY * (pairTableUse[key]?.[t] ?? 0) +
          Math.random() * 0.05
        );
      });
      const assignedTables = assignMinCost(costMatrix);

      // Commit matches (in table order) and update trackers
      sidesAssigned
        .map(({ home, away }, pairIdx) => ({ home, away, tableIdx: assignedTables[pairIdx] }))
        .sort((a, b) => a.tableIdx - b.tableIdx)
        .forEach(({ home, away, tableIdx }) => {
          whiteCount[home.id]++;
          lastRole[home.id] = 'home';
          lastRole[away.id] = 'away';

          if (tableCount[home.id][tableIdx] !== undefined) tableCount[home.id][tableIdx]++;
          if (tableCount[away.id][tableIdx] !== undefined) tableCount[away.id][tableIdx]++;

          const key = pairKey(home, away);
          pairTableUse[key] = pairTableUse[key] ?? {};
          pairTableUse[key][tableIdx] = (pairTableUse[key][tableIdx] ?? 0) + 1;

          matches.push({
            id: matchId(),
            round: roundNumber,
            homePlayer: home,
            awayPlayer: away,
            homeScore: null,
            awayScore: null,
            isCompleted: false,
            tableNumber: tableIdx + 1,
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
