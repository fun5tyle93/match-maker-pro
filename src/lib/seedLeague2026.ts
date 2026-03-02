import { League, PlayerStats, Player } from '@/types';
import { supabase } from '@/integrations/supabase/client';

const SEED_KEY_ERWACHSENE = 'kicker_seed_2026_sb_v2';
const SEED_KEY_JUGEND = 'kicker_seed_jugend_2026_sb_v2';
const SEED_KEY_EWIG = 'kicker_seed_ewig_2026_sb_v4';

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

// name, points, pointsAgainst, championships
function createEternalStat(name: string, points: number, pointsAgainst: number, championships: number): PlayerStats {
  return {
    player: createPlayer(name),
    wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0,
    points, pointsAgainst,
    goalDifference: 0,
    championships, viceChampionships: 0,
  };
}

async function seedLeagueToSupabase(league: League): Promise<void> {
  const { error: leagueError } = await supabase.from('leagues').insert({
    id: league.id,
    name: league.name,
    year: league.year,
    created_at: league.createdAt,
    is_eternal: league.isEternal ?? false,
  });
  if (leagueError) {
    console.error('Failed to seed league:', leagueError);
    return;
  }

  if (league.playerStats.length > 0) {
    const statsInserts = league.playerStats.map(s => ({
      league_id: league.id,
      player_id: s.player.id,
      player_name: s.player.name,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goals_for: s.goalsFor,
      goals_against: s.goalsAgainst,
      points: s.points,
      points_against: s.pointsAgainst,
      goal_difference: s.goalDifference,
      championships: s.championships ?? 0,
      vice_championships: s.viceChampionships ?? 0,
    }));
    const { error } = await supabase.from('player_stats').insert(statsInserts);
    if (error) console.error('Failed to seed player_stats:', error);
  }
}

export async function seedLeague2026(): Promise<void> {
  if (localStorage.getItem(SEED_KEY_ERWACHSENE)) return;

  const league: League = {
    id: crypto.randomUUID(),
    name: 'Tabelle 2026',
    year: 2026,
    isEternal: false,
    playerStats: [
      createStatFromPDF('Max Daub',          32, 50, 14, 123,  58, 2, 0),
      createStatFromPDF('Stefan Poetsch',    32, 44, 20, 111,  84, 0, 1),
      createStatFromPDF('Rainer Schlotz',    23, 32, 14,  95,  48, 0, 1),
      createStatFromPDF('Michael Bräuning',  26, 31, 21,  89,  68, 0, 0),
      createStatFromPDF('Benjamin Buza',     15, 28,  2,  71,  25, 2, 0),
      createStatFromPDF('Michael Kleofasz',  32, 26, 38,  94, 103, 0, 1),
      createStatFromPDF('Robert Matanovic',  32, 23, 41,  85,  95, 0, 0),
      createStatFromPDF('Jürgen Bischof',    26, 17, 35,  89, 114, 0, 0),
      createStatFromPDF('Andreas Sigle',     32, 16, 48,  80, 144, 0, 0),
      createStatFromPDF('Heidi Grellmann',   18, 12, 24,  60,  83, 0, 0),
      createStatFromPDF('Klaudio Lange',      8, 11,  5,  26,  25, 0, 1),
      createStatFromPDF('Susanna Grellmann', 18,  4, 32,  26, 102, 0, 0),
    ],
    createdAt: '2026-01-16T00:00:00.000Z',
  };

  await seedLeagueToSupabase(league);
  localStorage.setItem(SEED_KEY_ERWACHSENE, 'true');
}

export async function seedLeagueJugend2026(): Promise<void> {
  if (localStorage.getItem(SEED_KEY_JUGEND)) return;

  const league: League = {
    id: crypto.randomUUID(),
    name: 'Jugend und Damen 2026',
    year: 2026,
    isEternal: false,
    playerStats: [
      createStatFromPDF('Heidi Grellmann',  24, 36, 12, 72, 32, 2, 0),
      createStatFromPDF('Maxi Scheibitz',   30, 29, 31, 42, 55, 0, 1),
      createStatFromPDF('Erik Schwarz',     20, 27, 13, 66, 34, 1, 2),
      createStatFromPDF('Mika Buza',        30, 25, 35, 42, 53, 1, 0),
      createStatFromPDF('Jakob Grätscher',  19, 19, 19, 28, 31, 0, 1),
      createStatFromPDF('Timo Schwarz',     24, 19, 29, 34, 60, 0, 0),
      createStatFromPDF('Julian Bencsik',   24, 18, 30, 25, 50, 0, 0),
      createStatFromPDF('Max Daub a.K.',    15, 16, 14, 33, 20, 0, 0),
      createStatFromPDF('Jakob Birenbaum',   9,  9,  9, 11, 11, 0, 0),
      createStatFromPDF('Jamil Hecker',      9,  6, 12,  8, 15, 0, 0),
    ],
    createdAt: '2026-01-16T00:00:00.000Z',
  };

  await seedLeagueToSupabase(league);
  localStorage.setItem(SEED_KEY_JUGEND, 'true');
}

export async function seedEwigeTabelle(): Promise<void> {
  if (localStorage.getItem(SEED_KEY_EWIG)) return;

  // Format: name, points (Pkt+), pointsAgainst (Pkt-), championships (M)
  const league: League = {
    id: crypto.randomUUID(),
    name: 'Ewige Tabelle Training',
    year: 1971,
    isEternal: true,
    playerStats: [
      createEternalStat('Harald Füßinger', 6092, 1962, 185),
      createEternalStat('Andreas Sigle', 5927, 8809, 51),
      createEternalStat('Rainer Schlotz', 5879, 3891, 79),
      createEternalStat('Klaudio Lange (Kazmierczak)', 4315, 2789, 85),
      createEternalStat('Benjamin Buza (Reule)', 4107, 1893, 129),
      createEternalStat('Stefan Poetsch', 3612, 3118, 29),
      createEternalStat('Robert Matanovic', 3147, 4517, 4),
      createEternalStat('Max Daub', 3002, 1676, 59),
      createEternalStat('Jochen Härterich', 2804, 2762, 25),
      createEternalStat('Michael Bräuning', 2520, 3478, 6),
      createEternalStat('Sascha Bareis', 2513, 1967, 24),
      createEternalStat('Reiner Sigle', 2143, 1429, 47),
      createEternalStat('Werner Glück', 1927, 2065, 16),
      createEternalStat('Frank Hampel', 1885, 1035, 40),
      createEternalStat('Dietmar Häfner', 1883, 987, 41),
      createEternalStat('Artur Merke', 1859, 825, 46),
      createEternalStat('Michael Kleofasz', 1782, 2750, 7),
      createEternalStat('Walter Hautschek', 1673, 2353, 9),
      createEternalStat('Florian Stähle', 1539, 927, 32),
      createEternalStat('Beno Garstka', 1450, 1388, 23),
      createEternalStat('Walter Piecha', 1412, 1070, 36),
      createEternalStat('Franz Mayer (Kleofasz)', 1025, 625, 15),
      createEternalStat('Lukas Emmrich', 955, 675, 6),
      createEternalStat('Uli Heldmaier', 755, 1465, 2),
      createEternalStat('Oliver Bacher (Bujtas)', 695, 335, 19),
      createEternalStat('Martin Hautzinger', 669, 281, 17),
      createEternalStat('Ewald Marschall', 591, 433, 4),
      createEternalStat('Markus Laich', 578, 764, 3),
      createEternalStat('Markus Pfeiffer', 577, 293, 8),
      createEternalStat('Robin Loew-Albrecht', 568, 300, 13),
      createEternalStat('Joachim Sigle', 563, 2055, 0),
      createEternalStat('Stefan Hoppe', 508, 226, 14),
      createEternalStat('Luca Kraus', 474, 540, 0),
      createEternalStat('Markus Schmidt', 450, 604, 0),
      createEternalStat('Joachim Hofmann', 414, 466, 5),
      createEternalStat('Ulrich Ziegler', 376, 566, 4),
      createEternalStat('Robert Ansel', 348, 476, 0),
      createEternalStat('Andreas Schneider', 344, 126, 11),
      createEternalStat('Florian Wagner', 329, 197, 3),
      createEternalStat('Sebastian Wagner', 292, 216, 3),
      createEternalStat('Tim Hecker', 286, 430, 0),
      createEternalStat('Christoph Haag', 279, 319, 1),
      createEternalStat('Jürgen Bischof', 261, 983, 0),
      createEternalStat('Gernot Knapp', 255, 655, 1),
      createEternalStat('Peter Gehrung', 233, 133, 7),
      createEternalStat('Sebastian Mayer', 227, 385, 0),
      createEternalStat('Gianni Montefusco', 213, 467, 0),
      createEternalStat('Holger Emmrich', 202, 598, 0),
      createEternalStat('Volker Herbers', 189, 269, 0),
      createEternalStat('Peter Oechsle', 183, 787, 0),
      createEternalStat('Thomas Gerst', 180, 360, 0),
      createEternalStat('Jürgen Glemser', 152, 122, 1),
      createEternalStat('Uto Irtenkauf', 145, 151, 1),
      createEternalStat('Uwe Reisinger', 141, 211, 0),
      createEternalStat('Colin Oechsle', 136, 398, 0),
      createEternalStat('Nicki Manes', 134, 200, 0),
      createEternalStat('Wolfgang Müller', 133, 499, 0),
      createEternalStat('Siegfried Weierich', 119, 185, 1),
      createEternalStat('Philipp Baadte', 117, 29, 5),
      createEternalStat('Wolfgang Schmied', 112, 120, 0),
      createEternalStat('Heiko Pfeiffer', 110, 236, 0),
      createEternalStat('Ralph Kraut', 101, 193, 0),
      createEternalStat('Markus Scheu', 100, 264, 0),
      createEternalStat('Lars Biesinger', 98, 168, 0),
      createEternalStat('Thomas Koller', 90, 368, 0),
      createEternalStat('Frank Grunenberg', 86, 98, 2),
      createEternalStat('Helmut Wäscher', 82, 402, 0),
      createEternalStat('Jakob Weber', 78, 16, 4),
      createEternalStat('Hans Chudy (Kleofasz)', 73, 295, 0),
      createEternalStat('Sven Küster', 72, 94, 0),
      createEternalStat('Hanspeter Glemser', 70, 182, 0),
      createEternalStat('Jens König', 69, 15, 3),
      createEternalStat('Maick Seyfried', 68, 102, 0),
      createEternalStat('Ulf Dreßler', 68, 112, 0),
      createEternalStat('Klaus-Dieter Zeeb', 62, 98, 0),
      createEternalStat('Göran Kübler', 62, 150, 0),
      createEternalStat('Stephan Wittwer', 61, 167, 0),
      createEternalStat('Massimo Ambriola', 59, 185, 0),
      createEternalStat('Bertram Schill', 57, 69, 1),
      createEternalStat('Volker Hühn', 56, 156, 0),
      createEternalStat('Christian Kubelka', 56, 328, 0),
      createEternalStat('Heidi Grellmann', 55, 111, 0),
      createEternalStat('Frank Stähle', 54, 396, 0),
      createEternalStat('Stefan Wenzel', 53, 63, 0),
      createEternalStat('Ergün Uygun', 53, 187, 1),
      createEternalStat('William Schwaß', 52, 30, 1),
      createEternalStat('Leon Tabler', 49, 113, 0),
      createEternalStat('Claus Deeg', 46, 74, 0),
      createEternalStat('Harald Bauer', 44, 122, 0),
      createEternalStat('Martin Loch', 43, 113, 0),
      createEternalStat('Uwe Seyfried', 40, 18, 1),
      createEternalStat('Rüdiger Sandmann', 38, 34, 0),
      createEternalStat('Philipp Piecha', 38, 286, 0),
      createEternalStat('Noah Schönberg', 35, 119, 0),
      createEternalStat('Martin Henn', 32, 72, 0),
      createEternalStat('Julian Karl', 30, 132, 0),
      createEternalStat('Uli Weishaupt', 29, 17, 0),
      createEternalStat('Carsten Maier', 28, 56, 0),
      createEternalStat('Michele Ramunno', 28, 54, 0),
      createEternalStat('Tim Wieschollek', 27, 97, 0),
      createEternalStat('Peter Funke', 25, 7, 1),
      createEternalStat('Jörn Nagel', 25, 57, 0),
      createEternalStat('Marco Bittmann', 24, 26, 1),
      createEternalStat('Oliver Heubner', 24, 26, 0),
      createEternalStat('Lars Franz', 23, 125, 0),
      createEternalStat('Ralf Item', 23, 15, 0),
      createEternalStat('Dawood Malik', 21, 13, 0),
      createEternalStat('Holger Bauer-Schneider', 18, 6, 1),
      createEternalStat('Jonas Karl', 18, 132, 0),
      createEternalStat('Frank Neubauer', 17, 13, 0),
      createEternalStat('Patrik Schaupp', 17, 31, 0),
      createEternalStat('Elisabeth Wagner', 17, 83, 0),
      createEternalStat('Dirk Oberknapp', 16, 32, 0),
      createEternalStat('Thomas Will', 16, 16, 0),
      createEternalStat('Thomas Gengenbach', 14, 24, 0),
      createEternalStat('Maxi Scheibitz', 14, 20, 0),
      createEternalStat('Thomas Bittmann', 13, 21, 0),
      createEternalStat('Timo Schwarz', 13, 31, 0),
      createEternalStat('Georg Schwartz', 12, 6, 0),
      createEternalStat('Klaus Pfertner', 12, 18, 0),
      createEternalStat('Uli Dinkelacker', 12, 28, 0),
      createEternalStat('Sven Häbe', 12, 56, 0),
      createEternalStat('Alexander Beck', 11, 1, 1),
      createEternalStat('Oliver Janitschek', 11, 9, 0),
      createEternalStat('Erik Schwarz', 11, 27, 0),
      createEternalStat('Wolfgang Renninger', 11, 7, 0),
      createEternalStat('Susanna Grellmann', 11, 119, 0),
      createEternalStat('Manfred Metsch', 10, 4, 0),
      createEternalStat('Manuel Häfeli', 10, 10, 0),
      createEternalStat('Michael Kalentzi (Herzog)', 10, 40, 0),
      createEternalStat('Daniele Di-Fabio', 10, 40, 0),
      createEternalStat('Sascha Item', 10, 22, 0),
      createEternalStat('Jonathan Weber', 10, 8, 0),
      createEternalStat('Michael Steinfeld', 9, 1, 1),
      createEternalStat('Tilmann Kübler', 9, 29, 0),
      createEternalStat('Hans Reinhardt', 9, 75, 0),
      createEternalStat('Alexander Glaser', 9, 85, 0),
      createEternalStat('Mika Buza', 9, 21, 0),
      createEternalStat('Dirk Rolle', 8, 10, 0),
      createEternalStat('Stefan Glemser', 8, 40, 0),
      createEternalStat('Kai Kraus', 8, 58, 0),
      createEternalStat('Markus Sense', 7, 9, 0),
      createEternalStat('Normen Flaskamp', 7, 21, 0),
      createEternalStat('Volker Beller', 7, 23, 0),
      createEternalStat('Léandre Lancon', 7, 9, 0),
      createEternalStat('Ecki Kuhn', 6, 4, 0),
      createEternalStat('Alexander Neuwirth', 6, 22, 0),
      createEternalStat('Simon Leifels', 6, 26, 0),
      createEternalStat('Christian Tappe', 6, 28, 0),
      createEternalStat('Frank Sauter', 6, 8, 0),
      createEternalStat('Jamil Hecker', 6, 20, 0),
      createEternalStat('Christian Schlißke', 6, 8, 0),
      createEternalStat('Hervè Lancon', 6, 8, 0),
      createEternalStat('Christian Hofberger', 5, 7, 0),
      createEternalStat('Lukas Homscheidt', 5, 11, 0),
      createEternalStat('Achim Ungerer', 5, 13, 0),
      createEternalStat('Markus Uhl', 5, 15, 0),
      createEternalStat('Daniel Nater', 5, 15, 0),
      createEternalStat('Fredy Mott', 5, 29, 0),
      createEternalStat('Sven Wolff', 5, 35, 0),
      createEternalStat('Christian Chmielecki', 5, 43, 0),
      createEternalStat('Norbert Marschall', 5, 63, 0),
      createEternalStat('Dietmar Schill', 5, 67, 0),
      createEternalStat('Jakob Grätscher', 5, 19, 0),
      createEternalStat('Klaus Zuberbühler', 4, 6, 0),
      createEternalStat('Marco Germeroth', 4, 12, 0),
      createEternalStat('Thomas Litzenburger', 4, 14, 0),
      createEternalStat('Alexander Heib', 4, 16, 0),
      createEternalStat('Rolf Fratte', 4, 24, 0),
      createEternalStat('Marc Kleinknecht', 4, 40, 0),
      createEternalStat('Zoltan Bencsik', 3, 7, 0),
      createEternalStat('Angelika Sigle', 3, 13, 0),
      createEternalStat('Michael Tanch', 3, 25, 0),
      createEternalStat('Werner Kölsch', 3, 73, 0),
      createEternalStat('Carlo Homscheidt', 3, 11, 0),
      createEternalStat('Jeanette Buza', 3, 11, 0),
      createEternalStat('Franz-Josef Wallenfang', 3, 11, 0),
      createEternalStat('Frank Schwer', 2, 8, 0),
      createEternalStat('Kai Schröder', 2, 8, 0),
      createEternalStat('Emanuel Bolay', 2, 8, 0),
      createEternalStat('Bora Bayri', 2, 12, 0),
      createEternalStat('Thomas Metzger', 2, 16, 0),
      createEternalStat('Michael Daub', 2, 18, 0),
      createEternalStat('Uli Ackermann', 2, 32, 0),
      createEternalStat('Nicole Mayer', 2, 62, 0),
      createEternalStat('Stefan Maxara', 2, 12, 0),
      createEternalStat('Alex Albert', 1, 13, 0),
      createEternalStat('Joachim Reule', 1, 15, 0),
      createEternalStat('Frank Deimel', 1, 17, 0),
      createEternalStat('Sven Lutzei', 1, 27, 0),
      createEternalStat('John Tretinjak', 0, 8, 0),
      createEternalStat('Maximilian Graf', 0, 8, 0),
      createEternalStat('Marius Nitzsche', 0, 10, 0),
      createEternalStat('Ivo Jacob', 0, 10, 0),
      createEternalStat('Markus Krämer', 0, 10, 0),
      createEternalStat('Florian Hecker', 0, 12, 0),
      createEternalStat('Kian Herbers', 0, 14, 0),
      createEternalStat('Thomas Leonczyk', 0, 16, 0),
      createEternalStat('Lorenzo Sorace', 0, 16, 0),
      createEternalStat('Peter Röckle', 0, 28, 0),
      createEternalStat('Harald Marschall', 0, 32, 0),
      createEternalStat('Oliver Inderst', 0, 34, 0),
    ],
    createdAt: '2026-02-20T00:00:00.000Z',
  };

  await seedLeagueToSupabase(league);
  localStorage.setItem(SEED_KEY_EWIG, 'true');
}
