export interface Player {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  round: number;
  homePlayer: Player;
  awayPlayer: Player;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
}

export interface PlayerStats {
  player: Player;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAgainst: number;
  goalDifference: number;
}

export interface TrainingSession {
  id: string;
  date: string;
  players: Player[];
  matches: Match[];
  isCompleted: boolean;
  roundCount: number;
  matchesPerPairing: number;
}

export interface League {
  id: string;
  name: string;
  year: number;
  playerStats: PlayerStats[];
  createdAt: string;
}
