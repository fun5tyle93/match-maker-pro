import { Player, Match } from './index';

export type SwissEndMode = 'direct' | 'playoff';
export type PlayoffFormat = 'standard' | 'progressive';
export type PlayoffStart = 'r16' | 'qf' | 'sf';

export interface SwissConfig {
  rounds: number;
  refereeMode: boolean;
  endMode: SwissEndMode;
  playoffFormat?: PlayoffFormat;
  playoffStart?: PlayoffStart;
}

export interface SwissPlayerStat {
  player: Player;
  points: number;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  /** Buchholz = average points of opponents (0.0–2.0) */
  buchholz: number;
  wins: number;
  draws: number;
  losses: number;
  /** Average points per game (primary sort) */
  avgPoints: number;
  opponentIds: string[];
  /** Whether this player already had a BYE */
  hasHadBye: boolean;
  /** Round index when this player gets a BYE */
  byeRound?: number;
}

export interface SwissRound {
  roundNumber: number;
  phase: 'swiss' | 'referee' | 'playoff';
  /** "pass1" = first half (some players are referees), "pass2" = second half */
  pass?: 1 | 2;
  matches: Match[];
  /** Player IDs acting as referees this pass (refereeMode only) */
  referees?: string[];
  isCompleted: boolean;
  /** Player ID that has a BYE this round */
  byePlayerId?: string;
}

export interface PlayoffMatch {
  id: string;
  round: number;
  matchNumber: number;
  homePlayer: Player | null;
  awayPlayer: Player | null;
  homeScore: number | null;
  awayScore: number | null;
  isCompleted: boolean;
  isBye?: boolean;
}

export interface SwissSession {
  id: string;
  name?: string;
  date: string;
  config: SwissConfig;
  players: Player[];
  rounds: SwissRound[];
  currentRound: number;
  isCompleted: boolean;
  playoffMatches?: PlayoffMatch[];
  playoffActive?: boolean;
  transferredToLeagues?: string[];
}
