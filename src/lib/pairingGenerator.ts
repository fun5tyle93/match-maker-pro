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

export function generatePairings(
  players: Player[],
  matchesPerPairing: number = 1
): { matches: Match[]; roundCount: number } {
  if (players.length < 2) {
    return { matches: [], roundCount: 0 };
  }

  const matches: Match[] = [];
  const pairings: { home: Player; away: Player }[] = [];

  // Generate all unique pairings
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      // Randomly assign home/away
      if (Math.random() > 0.5) {
        pairings.push({ home: players[i], away: players[j] });
      } else {
        pairings.push({ home: players[j], away: players[i] });
      }
    }
  }

  // Duplicate pairings for multiple matches and swap home/away alternately
  const allPairings: { home: Player; away: Player }[] = [];
  for (let m = 0; m < matchesPerPairing; m++) {
    pairings.forEach(p => {
      if (m % 2 === 0) {
        allPairings.push(p);
      } else {
        allPairings.push({ home: p.away, away: p.home });
      }
    });
  }

  // Shuffle all pairings
  const shuffledPairings = shuffleArray(allPairings);

  // Group into rounds (each player plays max once per round)
  // For odd player counts: one player sits out per round
  const matchesPerRound = getMatchesPerRound(players.length);
  const rounds: { home: Player; away: Player }[][] = [];
  const usedPairings = new Set<number>();

  while (usedPairings.size < shuffledPairings.length) {
    const round: { home: Player; away: Player }[] = [];
    const playersInRound = new Set<string>();

    // Try to fill round with maximum matches
    shuffledPairings.forEach((pairing, index) => {
      if (usedPairings.has(index)) return;
      if (round.length >= matchesPerRound) return;
      
      if (!playersInRound.has(pairing.home.id) && !playersInRound.has(pairing.away.id)) {
        round.push(pairing);
        playersInRound.add(pairing.home.id);
        playersInRound.add(pairing.away.id);
        usedPairings.add(index);
      }
    });

    if (round.length > 0) {
      rounds.push(round);
    }
  }

  // Create matches from rounds
  rounds.forEach((round, roundIndex) => {
    round.forEach(pairing => {
      matches.push({
        id: crypto.randomUUID(),
        round: roundIndex + 1,
        homePlayer: pairing.home,
        awayPlayer: pairing.away,
        homeScore: null,
        awayScore: null,
        isCompleted: false,
      });
    });
  });

  return { matches, roundCount: rounds.length };
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
