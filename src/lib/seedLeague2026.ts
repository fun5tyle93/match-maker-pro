import { League, PlayerStats, Player } from '@/types';
import { supabase } from '@/integrations/supabase/client';

const SEED_KEY_ERWACHSENE = 'kicker_seed_2026_sb_v2';
const SEED_KEY_JUGEND = 'kicker_seed_jugend_2026_sb_v2';
const SEED_KEY_EWIG = 'kicker_seed_ewig_2026_sb_v3';

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
      createEternalStat('Harald Füßinger', 6092, 3842, 62),
      createEternalStat('Andreas Sigle', 5927, 4661, 9),
      createEternalStat('Rainer Schlotz', 5879, 3891, 91),
      createEternalStat('Klaudio Lange (Kazmierczak)', 4315, 2789, 89),
      createEternalStat('Benjamin Buza (Reule)', 4107, 1893, 93),
      createEternalStat('Stefan Poetsch', 3612, 3118, 18),
      createEternalStat('Robert Matanovic', 3147, 4517, 17),
      createEternalStat('Max Daub', 3002, 1676, 76),
      createEternalStat('Jochen Härterich', 2804, 2762, 62),
      createEternalStat('Michael Bräuning', 2520, 3478, 78),
      createEternalStat('Sascha Bareis', 2513, 1967, 67),
      createEternalStat('Reiner Sigle', 2143, 1429, 29),
      createEternalStat('Werner Glück', 1927, 2065, 65),
      createEternalStat('Frank Hampel', 1885, 1035, 35),
      createEternalStat('Dietmar Häfner', 1883, 987, 87),
      createEternalStat('Artur Merke', 1859, 825, 25),
      createEternalStat('Michael Kleofasz', 1782, 2750, 50),
      createEternalStat('Walter Hautschek', 1673, 2353, 53),
      createEternalStat('Florian Stähle', 1539, 927, 27),
      createEternalStat('Beno Garstka', 1450, 1388, 88),
      createEternalStat('Walter Piecha', 1412, 1070, 70),
      createEternalStat('Franz Mayer (Kleofasz)', 1025, 625, 25),
      createEternalStat('Lukas Emmrich', 955, 675, 75),
      createEternalStat('Uli Heldmaier', 755, 1465, 65),
      createEternalStat('Oliver Bacher (Bujtas)', 695, 335, 35),
      createEternalStat('Martin Hautzinger', 669, 281, 81),
      createEternalStat('Ewald Marschall', 591, 433, 33),
      createEternalStat('Markus Laich', 578, 764, 64),
      createEternalStat('Markus Pfeiffer', 577, 293, 93),
      createEternalStat('Robin Loew-Albrecht', 568, 300, 0),
      createEternalStat('Joachim Sigle', 563, 2055, 55),
      createEternalStat('Stefan Hoppe', 508, 226, 26),
      createEternalStat('Luca Kraus', 474, 540, 40),
      createEternalStat('Markus Schmidt', 450, 604, 4),
      createEternalStat('Joachim Hofmann', 414, 466, 66),
      createEternalStat('Ulrich Ziegler', 376, 566, 66),
      createEternalStat('Robert Ansel', 348, 476, 76),
      createEternalStat('Andreas Schneider', 344, 126, 26),
      createEternalStat('Florian Wagner', 329, 197, 97),
      createEternalStat('Sebastian Wagner', 292, 216, 16),
      createEternalStat('Tim Hecker', 286, 430, 30),
      createEternalStat('Christoph Haag', 279, 319, 19),
      createEternalStat('Jürgen Bischof', 261, 983, 83),
      createEternalStat('Gernot Knapp', 255, 655, 55),
      createEternalStat('Peter Gehrung', 233, 133, 33),
      createEternalStat('Sebastian Mayer', 227, 385, 85),
      createEternalStat('Gianni Montefusco', 213, 467, 67),
      createEternalStat('Holger Emmrich', 202, 598, 98),
      createEternalStat('Volker Herbers', 189, 269, 69),
      createEternalStat('Peter Oechsle', 183, 787, 87),
      createEternalStat('Thomas Gerst', 180, 360, 60),
      createEternalStat('Jürgen Glemser', 152, 122, 22),
      createEternalStat('Uto Irtenkauf', 145, 151, 51),
      createEternalStat('Uwe Reisinger', 141, 211, 11),
      createEternalStat('Colin Oechsle', 136, 398, 98),
      createEternalStat('Nicki Manes', 134, 200, 0),
      createEternalStat('Wolfgang Müller', 133, 499, 99),
      createEternalStat('Siegfried Weierich', 119, 185, 85),
      createEternalStat('Philipp Baadte', 117, 29, 29),
      createEternalStat('Wolfgang Schmied', 112, 120, 20),
      createEternalStat('Heiko Pfeiffer', 110, 236, 36),
      createEternalStat('Ralph Kraut', 101, 193, 93),
      createEternalStat('Markus Scheu', 100, 264, 64),
      createEternalStat('Lars Biesinger', 98, 168, 68),
      createEternalStat('Thomas Koller', 90, 368, 68),
      createEternalStat('Frank Grunenberg', 86, 98, 98),
      createEternalStat('Helmut Wäscher', 82, 402, 2),
      createEternalStat('Jakob Weber', 78, 16, 16),
      createEternalStat('Hans Chudy (Kleofasz)', 73, 295, 95),
      createEternalStat('Sven Küster', 72, 94, 94),
      createEternalStat('Hanspeter Glemser', 70, 182, 82),
      createEternalStat('Jens König', 69, 15, 15),
      createEternalStat('Maick Seyfried', 68, 102, 2),
      createEternalStat('Ulf Dreßler', 68, 112, 12),
      createEternalStat('Klaus-Dieter Zeeb', 62, 98, 98),
      createEternalStat('Göran Kübler', 62, 150, 50),
      createEternalStat('Stephan Wittwer', 61, 167, 67),
      createEternalStat('Massimo Ambriola', 59, 185, 85),
      createEternalStat('Bertram Schill', 57, 69, 69),
      createEternalStat('Volker Hühn', 56, 156, 56),
      createEternalStat('Christian Kubelka', 56, 328, 28),
      createEternalStat('Heidi Grellmann', 55, 111, 11),
      createEternalStat('Frank Stähle', 54, 396, 96),
      createEternalStat('Stefan Wenzel', 53, 63, 63),
      createEternalStat('Ergün Uygun', 53, 187, 87),
      createEternalStat('William Schwaß', 52, 30, 30),
      createEternalStat('Leon Tabler', 49, 113, 13),
      createEternalStat('Claus Deeg', 46, 74, 74),
      createEternalStat('Harald Bauer', 44, 122, 22),
      createEternalStat('Martin Loch', 43, 113, 13),
      createEternalStat('Uwe Seyfried', 40, 18, 18),
      createEternalStat('Rüdiger Sandmann', 38, 34, 34),
      createEternalStat('Philipp Piecha', 38, 286, 86),
      createEternalStat('Noah Schönberg', 35, 119, 19),
      createEternalStat('Martin Henn', 32, 72, 72),
      createEternalStat('Julian Karl', 30, 132, 32),
      createEternalStat('Uli Weishaupt', 29, 17, 17),
      createEternalStat('Carsten Maier', 28, 56, 56),
      createEternalStat('Michele Ramunno', 28, 54, 54),
      createEternalStat('Tim Wieschollek', 27, 97, 97),
      createEternalStat('Peter Funke', 25, 7, 7),
      createEternalStat('Jörn Nagel', 25, 57, 57),
      createEternalStat('Marco Bittmann', 24, 26, 26),
      createEternalStat('Oliver Heubner', 24, 26, 26),
      createEternalStat('Lars Franz', 23, 125, 25),
      createEternalStat('Ralf Item', 23, 15, 15),
      createEternalStat('Dawood Malik', 21, 13, 13),
      createEternalStat('Holger Bauer-Schneider', 18, 6, 6),
      createEternalStat('Jonas Karl', 18, 132, 32),
      createEternalStat('Frank Neubauer', 17, 13, 13),
      createEternalStat('Patrik Schaupp', 17, 31, 31),
      createEternalStat('Elisabeth Wagner', 17, 83, 83),
      createEternalStat('Dirk Oberknapp', 16, 32, 32),
      createEternalStat('Thomas Will', 16, 16, 16),
      createEternalStat('Thomas Gengenbach', 14, 24, 24),
      createEternalStat('Maxi Scheibitz', 14, 20, 20),
      createEternalStat('Thomas Bittmann', 13, 21, 21),
      createEternalStat('Timo Schwarz', 13, 31, 31),
      createEternalStat('Georg Schwartz', 12, 6, 6),
      createEternalStat('Klaus Pfertner', 12, 18, 18),
      createEternalStat('Uli Dinkelacker', 12, 28, 28),
      createEternalStat('Sven Häbe', 12, 56, 56),
      createEternalStat('Alexander Beck', 11, 1, 1),
      createEternalStat('Oliver Janitschek', 11, 9, 9),
      createEternalStat('Erik Schwarz', 11, 27, 27),
      createEternalStat('Wolfgang Renninger', 11, 7, 7),
      createEternalStat('Susanna Grellmann', 11, 119, 19),
      createEternalStat('Manfred Metsch', 10, 4, 4),
      createEternalStat('Manuel Häfeli', 10, 10, 10),
      createEternalStat('Michael Kalentzi (Herzog)', 10, 40, 40),
      createEternalStat('Daniele Di-Fabio', 10, 40, 40),
      createEternalStat('Sascha Item', 10, 22, 22),
      createEternalStat('Jonathan Weber', 10, 8, 8),
      createEternalStat('Michael Steinfeld', 9, 1, 1),
      createEternalStat('Tilmann Kübler', 9, 29, 29),
      createEternalStat('Hans Reinhardt', 9, 75, 75),
      createEternalStat('Alexander Glaser', 9, 85, 85),
      createEternalStat('Mika Buza', 9, 21, 21),
      createEternalStat('Dirk Rolle', 8, 10, 10),
      createEternalStat('Stefan Glemser', 8, 40, 40),
      createEternalStat('Kai Kraus', 8, 58, 58),
      createEternalStat('Markus Sense', 7, 9, 9),
      createEternalStat('Normen Flaskamp', 7, 21, 21),
      createEternalStat('Volker Beller', 7, 23, 23),
      createEternalStat('Léandre Lancon', 7, 9, 9),
      createEternalStat('Ecki Kuhn', 6, 4, 4),
      createEternalStat('Alexander Neuwirth', 6, 22, 22),
      createEternalStat('Simon Leifels', 6, 26, 26),
      createEternalStat('Christian Tappe', 6, 28, 28),
      createEternalStat('Frank Sauter', 6, 8, 8),
      createEternalStat('Jamil Hecker', 6, 20, 20),
      createEternalStat('Christian Schlißke', 6, 8, 8),
      createEternalStat('Hervè Lancon', 6, 8, 8),
      createEternalStat('Christian Hofberger', 5, 7, 7),
      createEternalStat('Lukas Homscheidt', 5, 11, 11),
      createEternalStat('Achim Ungerer', 5, 13, 13),
      createEternalStat('Markus Uhl', 5, 15, 15),
      createEternalStat('Daniel Nater', 5, 15, 15),
      createEternalStat('Fredy Mott', 5, 29, 29),
      createEternalStat('Sven Wolff', 5, 35, 35),
      createEternalStat('Christian Chmielecki', 5, 43, 43),
      createEternalStat('Norbert Marschall', 5, 63, 63),
      createEternalStat('Dietmar Schill', 5, 67, 67),
      createEternalStat('Jakob Grätscher', 5, 19, 19),
      createEternalStat('Klaus Zuberbühler', 4, 6, 6),
      createEternalStat('Marco Germeroth', 4, 12, 12),
      createEternalStat('Thomas Litzenburger', 4, 14, 14),
      createEternalStat('Alexander Heib', 4, 16, 16),
      createEternalStat('Rolf Fratte', 4, 24, 24),
      createEternalStat('Marc Kleinknecht', 4, 40, 40),
      createEternalStat('Zoltan Bencsik', 3, 7, 7),
      createEternalStat('Angelika Sigle', 3, 13, 13),
      createEternalStat('Michael Tanch', 3, 25, 25),
      createEternalStat('Werner Kölsch', 3, 73, 73),
      createEternalStat('Carlo Homscheidt', 3, 11, 11),
      createEternalStat('Jeanette Buza', 3, 11, 11),
      createEternalStat('Franz-Josef Wallenfang', 3, 11, 11),
      createEternalStat('Frank Schwer', 2, 8, 8),
      createEternalStat('Kai Schröder', 2, 8, 8),
      createEternalStat('Emanuel Bolay', 2, 8, 8),
      createEternalStat('Bora Bayri', 2, 12, 12),
      createEternalStat('Thomas Metzger', 2, 16, 16),
      createEternalStat('Michael Daub', 2, 18, 18),
      createEternalStat('Uli Ackermann', 2, 32, 32),
      createEternalStat('Nicole Mayer', 2, 62, 62),
      createEternalStat('Stefan Maxara', 2, 12, 12),
      createEternalStat('Alex Albert', 1, 13, 13),
      createEternalStat('Joachim Reule', 1, 15, 15),
      createEternalStat('Frank Deimel', 1, 17, 17),
      createEternalStat('Sven Lutzei', 1, 27, 27),
      createEternalStat('John Tretinjak', 0, 8, 8),
      createEternalStat('Maximilian Graf', 0, 8, 8),
      createEternalStat('Marius Nitzsche', 0, 10, 10),
      createEternalStat('Ivo Jacob', 0, 10, 10),
      createEternalStat('Markus Krämer', 0, 10, 10),
      createEternalStat('Florian Hecker', 0, 12, 12),
      createEternalStat('Kian Herbers', 0, 14, 14),
      createEternalStat('Thomas Leonczyk', 0, 16, 16),
      createEternalStat('Lorenzo Sorace', 0, 16, 16),
      createEternalStat('Peter Röckle', 0, 28, 28),
      createEternalStat('Harald Marschall', 0, 32, 32),
      createEternalStat('Oliver Inderst', 0, 34, 34),
    ],
    createdAt: '2026-02-20T00:00:00.000Z',
  };

  await seedLeagueToSupabase(league);
  localStorage.setItem(SEED_KEY_EWIG, 'true');
}
