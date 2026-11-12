import { League, PlayerStats } from '@/types';
import { compareEternalRows, compareLeagueRows } from './ranking';
import { findRowIndex } from './nameMatching';

/** Confirmed matches of one league: name of the evening -> name of the player already in that league. */
export type NameMatches = Map<string, string>;

/** Confirmed matches per league (key: league id). */
export type NameMatchesByLeague = Map<string, NameMatches>;

/**
 * Adds the results of one evening or tournament to a league and returns the updated league.
 * Used by the training evening and by the Swiss tournament, so both book exactly the same way.
 *
 * - Annual league: wins, draws, losses, goals, points and points against are added; 1st place gets a championship,
 *   2nd place a vice championship. Sorted by SO § 2 Abs. 6.
 * - Eternal table (`isEternal`): only points, points against and championships are booked; players who are new there
 *   start with 0 wins, draws, losses and goals and no vice championship. Sorted by points, then championships.
 *
 * `stats` are the whole numbers of the evening (win 2, draw 1, loss 0). `firstPlace` / `secondPlace` are names, and
 * undefined when the place is not decided. `nameMatches` maps a name of the evening to the name already in the
 * league (confirmed in the transfer dialog). Players are found by name, ignoring case, spacing, hyphens, umlauts and
 * accents (see nameMatching.ts); with the same name twice in a league, the row with the most points is used.
 */
export function applySessionToLeague(
  league: League,
  stats: PlayerStats[],
  firstPlace: string | undefined,
  secondPlace: string | undefined,
  nameMatches: NameMatches,
): League {
  const updatedStats = [...league.playerStats];

  stats.forEach(stat => {
    const searchName = nameMatches.get(stat.player.name) || stat.player.name;
    const existingIndex = findRowIndex(updatedStats.map(s => ({ name: s.player.name, points: s.points })), searchName);
    const isChampion = stat.player.name === firstPlace;
    const isViceChampion = stat.player.name === secondPlace;

    if (league.isEternal) {
      if (existingIndex >= 0) {
        const existing = updatedStats[existingIndex];
        updatedStats[existingIndex] = {
          ...existing,
          points: existing.points + stat.points,
          pointsAgainst: (existing.pointsAgainst || 0) + stat.pointsAgainst,
          championships: (existing.championships || 0) + (isChampion ? 1 : 0),
        };
      } else {
        updatedStats.push({
          ...stat,
          wins: 0, draws: 0, losses: 0,
          goalsFor: 0, goalsAgainst: 0,
          goalDifference: 0,
          championships: isChampion ? 1 : 0,
          viceChampionships: 0,
        });
      }
    } else if (existingIndex >= 0) {
      const existing = updatedStats[existingIndex];
      updatedStats[existingIndex] = {
        ...existing,
        wins: existing.wins + stat.wins,
        draws: existing.draws + stat.draws,
        losses: existing.losses + stat.losses,
        goalsFor: existing.goalsFor + stat.goalsFor,
        goalsAgainst: existing.goalsAgainst + stat.goalsAgainst,
        points: existing.points + stat.points,
        pointsAgainst: existing.pointsAgainst + stat.pointsAgainst,
        goalDifference: existing.goalDifference + stat.goalDifference,
        championships: (existing.championships || 0) + (isChampion ? 1 : 0),
        viceChampionships: (existing.viceChampionships || 0) + (isViceChampion ? 1 : 0),
      };
    } else {
      updatedStats.push({
        ...stat,
        championships: isChampion ? 1 : 0,
        viceChampionships: isViceChampion ? 1 : 0,
      });
    }
  });

  updatedStats.sort(league.isEternal ? compareEternalRows : compareLeagueRows);
  return { ...league, playerStats: updatedStats };
}
