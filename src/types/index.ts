export interface Player {
  id: string;
  name: string;
  /**
   * Fixed identity of the person (players.id). Unlike `id` it is the same on every evening and in every league.
   * Missing for players that were typed in before the player list existed, or when it could not be written.
   */
  ref?: string;
  /** Whether the player already had a BYE (freilos) in the Swiss system */
  hasHadBye?: boolean;
}

export interface Match {
  id: string;
  round: number;
  homePlayer: Player;
  awayPlayer: Player;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  /** 'swiss' = Vorrunde/regulär, 'playoff' = Playoff-Spiel */
  phase?: 'swiss' | 'playoff';
  /** Playoff bracket round (4=R16, 3=QF, 2=SF, 1=Finale) */
  playoffRound?: number;
  /** Position within the playoff round */
  matchNumber?: number;
  /** Freilos im Playoff */
  isBye?: boolean;
  /** Platte (1-basiert), auf der das Spiel gespielt wird */
  tableNumber?: number;
  /** Playoff-Spiel durch Sudden Death entschieden (Spielordnung § 9 Abs. 2); zählt in der Abschlussrangliste 1,5 / 0,5 Punkte */
  suddenDeath?: boolean;
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
  /** 'training' = normales Training, 'swiss' = Schweizer System */
  tournamentType?: 'training' | 'swiss';
  /**
   * Wertungsregel, nach der der Abend gespielt wurde. Fehlt sie (alte Abende, Spalte noch nicht in der
   * Datenbank), gilt 'legacy'. Neue Abende bekommen 'dtkv2026' (Spielordnung 2026 § 8 Abs. 3).
   */
  rankingRule?: 'legacy' | 'dtkv2026';
  /** Ergebnisse von Entscheidungsspielen/-runden bei völligem Gleichstand um Platz 1 oder 2 */
  deciderResults?: { players: string[]; order: string[] }[];
  /** Swiss tournaments: the drawn lot for a complete tie in the group phase (read from swiss_state, never written from here) */
  swissLot?: Record<string, number>;
}

export interface League {
  id: string;
  name: string;
  year: number;
  playerStats: PlayerStats[];
  createdAt: string;
  isEternal?: boolean;
}

