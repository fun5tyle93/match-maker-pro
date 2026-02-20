import { League, PlayerStats, Player } from '@/types';
import { loadLeagues, saveLeagues } from '@/lib/storage';

const SEED_KEY_ERWACHSENE = 'kicker_seed_2026_v2';
const SEED_KEY_JUGEND = 'kicker_seed_jugend_2026';

function createPlayer(name: string): Player {
  return { id: crypto.randomUUID(), name };
}

function createStatFromPDF(
  name: string,
  games: number, points: number, pointsAgainst: number,
  goalsFor: number, goalsAgainst: number,
  championships: number, viceChampionships: number,
): PlayerStats {
  const draws = (points + pointsAgainst) - 2 * games;
  const wins = (points - draws) / 2;
  const losses = (pointsAgainst - draws) / 2;

  return {
    player: createPlayer(name),
    wins, draws, losses,
    goalsFor, goalsAgainst,
    points, pointsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    championships, viceChampionships,
  };
}

export function seedLeague2026(): void {
  if (localStorage.getItem(SEED_KEY_ERWACHSENE)) return;

  const league: League = {
    id: crypto.randomUUID(),
    name: 'Tabelle 2026',
    year: 2026,
    playerStats: [
      createStatFromPDF('Max Daub',          24, 36, 12, 86,  45, 1, 0),
      createStatFromPDF('Stefan Poetsch',    24, 34, 14, 81,  59, 0, 1),
      createStatFromPDF('Benjamin Buza',     15, 28,  2, 71,  25, 2, 0),
      createStatFromPDF('Rainer Schlotz',    15, 23,  7, 67,  31, 0, 1),
      createStatFromPDF('Michael Bräuning',  18, 21, 15, 64,  47, 0, 0),
      createStatFromPDF('Robert Matanovic',  24, 21, 27, 69,  66, 0, 0),
      createStatFromPDF('Michael Kleofasz',  24, 19, 29, 71,  80, 0, 1),
      createStatFromPDF('Jürgen Bischof',    18, 14, 22, 70,  74, 0, 0),
      createStatFromPDF('Heidi Grellmann',   18, 12, 24, 60,  83, 0, 0),
      createStatFromPDF('Andreas Sigle',     24, 10, 38, 58, 111, 0, 0),
      createStatFromPDF('Susanna Grellmann', 18,  4, 32, 26, 102, 0, 0),
    ],
    createdAt: '2026-01-16T00:00:00.000Z',
  };

  const leagues = loadLeagues();
  leagues.push(league);
  saveLeagues(leagues);
  localStorage.setItem(SEED_KEY_ERWACHSENE, 'true');
}

export function seedLeagueJugend2026(): void {
  if (localStorage.getItem(SEED_KEY_JUGEND)) return;

  const league: League = {
    id: crypto.randomUUID(),
    name: 'Jugend und Damen 2026',
    year: 2026,
    playerStats: [
      createStatFromPDF('Heidi Grellmann',   24, 36, 12, 72, 32, 2, 0),
      createStatFromPDF('Mika Buza',         24, 25, 23, 40, 36, 1, 0),
      createStatFromPDF('Maxi Scheibitz',    24, 21, 27, 33, 48, 0, 0),
      createStatFromPDF('Jakob Grätscher',   19, 19, 19, 28, 31, 0, 1),
      createStatFromPDF('Timo Schwarz',      24, 19, 29, 34, 60, 0, 0),
      createStatFromPDF('Erik Schwarz',      14, 18, 10, 50, 23, 0, 2),
      createStatFromPDF('Julian Bencsik',    24, 18, 30, 25, 50, 0, 0),
      createStatFromPDF('Max Daub a.K.',      9,  9,  9, 17, 12, 0, 0),
      createStatFromPDF('Jakob Birenbaum',    9,  9,  9, 11, 11, 0, 0),
      createStatFromPDF('Jamil Hecker',       9,  6, 12,  8, 15, 0, 0),
    ],
    createdAt: '2026-01-16T00:00:00.000Z',
  };

  const leagues = loadLeagues();
  leagues.push(league);
  saveLeagues(leagues);
  localStorage.setItem(SEED_KEY_JUGEND, 'true');
}
