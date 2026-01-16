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
  championships?: number;
  viceChampionships?: number;
}

export interface TrainingSession {
  id: string;
  name?: string;
  date: string;
  players: Player[];
  matches: Match[];
  isCompleted: boolean;
  roundCount: number;
  matchesPerPairing: number;
  transferredToLeagues?: string[];
}

export interface League {
  id: string;
  name: string;
  year: number;
  playerStats: PlayerStats[];
  createdAt: string;
}

export interface NameMatch {
  originalName: string;
  matchedName: string;
  similarity: number;
  isExact: boolean;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  action: 'add' | 'edit' | 'delete';
  playerName: string;
  field?: string;
  oldValue?: string | number;
  newValue?: string | number;
}
