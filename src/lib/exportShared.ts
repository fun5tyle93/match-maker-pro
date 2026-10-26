import { League, Match, TrainingSession } from '@/types';
import { getSwissMatches } from './tournamentPhases';

export function formatDateDE(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('de-DE');
}

/** Title of an evening: its name, or "Trainingsabend <date>". */
export function sessionTitle(session: TrainingSession): string {
  return session.name || `Trainingsabend ${formatDateDE(session.date)}`;
}

export function trainingFileName(session: TrainingSession, extension: 'pdf' | 'xlsx'): string {
  const base = session.name
    ? session.name.replace(/\s/g, '_')
    : `Trainingsabend_${formatDateDE(session.date).replace(/\./g, '-')}`;
  return `${base}.${extension}`;
}

export function leagueFileName(league: League, extension: 'pdf' | 'xlsx'): string {
  return `Liga_${league.name.replace(/\s/g, '_')}.${extension}`;
}

export interface MatchSummary {
  matchesTotal: number;
  matchesPlayed: number;
  rounds: number;
  goals: number;
  goalsPerMatch: number;
  complete: boolean;
}

/** Counts for the summary box: played matches, rounds and goals of the group stage. */
export function summarizeMatches(matches: Match[]): MatchSummary {
  const played = matches.filter(m => m.isCompleted && m.homeScore !== null && m.awayScore !== null);
  const goals = played.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
  return {
    matchesTotal: matches.length,
    matchesPlayed: played.length,
    rounds: new Set(matches.map(m => m.round)).size,
    goals,
    goalsPerMatch: played.length > 0 ? goals / played.length : 0,
    complete: matches.length > 0 && played.length === matches.length,
  };
}

export function summarizeSession(session: TrainingSession): MatchSummary {
  return summarizeMatches(getSwissMatches(session.matches));
}

/** "5,8" – German decimal comma. */
export function formatDecimalDE(value: number, digits = 1): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
