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

// Round-Robin algorithm: generates pairings where each player plays against each other
// Maximum rounds = players - 1 (or players if odd, since one pauses each round)
export function generatePairings(
  players: Player[],
  matchesPerPairing: number = 1
): { matches: Match[]; roundCount: number } {
  if (players.length < 2) {
    return { matches: [], roundCount: 0 };
  }

  const n = players.length;
  const isOdd = n % 2 === 1;
  
  // For round-robin: add a "bye" player if odd number
  const allPlayers = isOdd ? [...players, { id: 'BYE', name: 'BYE' }] : [...players];
  const numPlayers = allPlayers.length;
  const numRounds = numPlayers - 1; // Maximum rounds for round-robin
  
  const matches: Match[] = [];
  const matchId = () => crypto.randomUUID();
  
  // Circle method for round-robin scheduling
  const fixed = allPlayers[0];
  const rotating = allPlayers.slice(1);
  
  // Track home/away counts per player to ensure fair distribution
  const homeCount: Record<string, number> = {};
  const awayCount: Record<string, number> = {};
  const lastRole: Record<string, 'home' | 'away' | null> = {};
  
  players.forEach(p => {
    homeCount[p.id] = 0;
    awayCount[p.id] = 0;
    lastRole[p.id] = null;
  });

  for (let repetition = 0; repetition < matchesPerPairing; repetition++) {
    const rotatingCopy = [...rotating];
    
    for (let round = 0; round < numRounds; round++) {
      const roundNumber = repetition * numRounds + round + 1;
      const roundPlayers = [fixed, ...rotatingCopy];
      const roundMatches: { home: Player; away: Player }[] = [];
      
      for (let i = 0; i < numPlayers / 2; i++) {
        const player1 = roundPlayers[i];
        const player2 = roundPlayers[numPlayers - 1 - i];
        
        // Skip matches involving the "bye" player
        if (player1.id === 'BYE' || player2.id === 'BYE') continue;
        
        // Determine home/away based on fairness criteria:
        // 1. Avoid consecutive same role
        // 2. Balance total home/away counts
        let home = player1;
        let away = player2;
        
        const p1WasHome = lastRole[player1.id] === 'home';
        const p2WasHome = lastRole[player2.id] === 'home';
        const p1WasAway = lastRole[player1.id] === 'away';
        const p2WasAway = lastRole[player2.id] === 'away';
        
        // If player1 was just home and player2 wasn't, swap
        if (p1WasHome && !p2WasHome) {
          home = player2;
          away = player1;
        }
        // If player2 was just away and player1 wasn't, keep as is
        else if (p2WasAway && !p1WasAway) {
          home = player1;
          away = player2;
        }
        // Otherwise balance by total counts
        else if (homeCount[player1.id] > homeCount[player2.id]) {
          home = player2;
          away = player1;
        } else if (homeCount[player2.id] > homeCount[player1.id]) {
          home = player1;
          away = player2;
        }
        // For repetitions, alternate based on repetition number
        else if (repetition % 2 === 1) {
          home = player2;
          away = player1;
        }
        
        roundMatches.push({ home, away });
      }
      
      // Add matches and update tracking
      roundMatches.forEach(({ home, away }) => {
        homeCount[home.id]++;
        awayCount[away.id]++;
        lastRole[home.id] = 'home';
        lastRole[away.id] = 'away';
        
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
      
      // Rotate players (keep first fixed, rotate the rest)
      const last = rotatingCopy.pop()!;
      rotatingCopy.unshift(last);
    }
  }

  // Calculate total rounds
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
