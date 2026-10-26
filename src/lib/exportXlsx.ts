import type { CellObject, SheetData } from 'write-excel-file/browser';
import { League, Match, TrainingSession } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';
import { sortMatches } from './tables';
import { getSwissMatches, toPlayoffMatches, playoffMatchWinner } from './tournamentPhases';
import { getRoundName } from './swissPairing';
import { leagueFileName, trainingFileName } from './exportShared';

// Same colors as the app and the PDF
const COLOR = {
  headerBg: '#EAB308',
  headerBorder: '#CA8A04',
  text: '#1F2937',
  border: '#E5E7EB',
  zebra: '#F9FAFB',
  gold: '#CA8A04',
  silver: '#6B7280',
  bronze: '#B45309',
  positive: '#16A34A',
  negative: '#DC2626',
};

/** One sheet: data plus the options that go with it. */
export interface XlsxSheet {
  sheet: string;
  data: SheetData;
  columns: { width: number }[];
  stickyRowsCount: number;
  orientation?: 'landscape';
}

type Align = 'left' | 'center' | 'right';

function header(value: string): CellObject {
  return {
    value,
    type: String,
    fontWeight: 'bold',
    textColor: COLOR.text,
    backgroundColor: COLOR.headerBg,
    borderColor: COLOR.headerBorder,
    align: 'center',
    alignVertical: 'center',
  };
}

interface BodyOptions {
  zebra?: boolean;
  align?: Align;
  bold?: boolean;
  color?: string;
}

function body(options: BodyOptions): Omit<CellObject, 'value' | 'type'> {
  return {
    borderColor: COLOR.border,
    alignVertical: 'center',
    align: options.align ?? 'left',
    textColor: options.color ?? COLOR.text,
    ...(options.zebra ? { backgroundColor: COLOR.zebra } : {}),
    ...(options.bold ? { fontWeight: 'bold' as const } : {}),
  };
}

// Text format "@" keeps results like "3:2" from being read as a time
function text(value: string, options: BodyOptions = {}): CellObject {
  return { value, type: String, format: '@', ...body(options) };
}

function number(value: number, options: BodyOptions & { format?: string } = {}): CellObject {
  return { value, type: Number, ...(options.format ? { format: options.format } : {}), ...body({ align: 'center', ...options }) };
}

/** Column width in characters: longest text plus some room, within a range. */
function widthFor(values: string[], min: number, max: number): number {
  const longest = values.reduce((n, v) => Math.max(n, v.length), 0);
  return Math.min(max, Math.max(min, longest + 3));
}

// A4 portrait holds about 80 characters of column width; wider sheets are printed in landscape
const PORTRAIT_LIMIT = 80;

function layout(columns: { width: number }[]): Pick<XlsxSheet, 'columns' | 'stickyRowsCount' | 'orientation'> {
  const total = columns.reduce((sum, c) => sum + c.width, 0);
  return { columns, stickyRowsCount: 1, ...(total > PORTRAIT_LIMIT ? { orientation: 'landscape' as const } : {}) };
}

const SIGNED = '+0;-0;0';

function rankColor(rank: number): string | undefined {
  return rank === 1 ? COLOR.gold : rank === 2 ? COLOR.silver : rank === 3 ? COLOR.bronze : undefined;
}

function diffColor(diff: number): string | undefined {
  return diff > 0 ? COLOR.positive : diff < 0 ? COLOR.negative : undefined;
}

function resultText(m: Pick<Match, 'isCompleted' | 'homeScore' | 'awayScore'>): string {
  return m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-';
}

function winnerSide(m: Pick<Match, 'isCompleted' | 'homeScore' | 'awayScore'>): 'home' | 'away' | null {
  if (!m.isCompleted || m.homeScore === null || m.awayScore === null) return null;
  return m.homeScore > m.awayScore ? 'home' : m.homeScore < m.awayScore ? 'away' : null;
}

/** Sheets of a training evening: standings, matches and (if played) the playoff. */
export function buildTrainingSheets(session: TrainingSession): XlsxSheet[] {
  const groupMatches = sortMatches(getSwissMatches(session.matches));
  const playoffMatches = toPlayoffMatches(session.matches);
  const hasPlayoff = playoffMatches.length > 0;
  const stats = calculatePlayerStats(session.players, groupMatches);

  // ---- Standings ----
  const standings: SheetData = [
    ['Platz', 'Spieler', 'Punkte', 'Tore', 'Diff'].map(header),
    ...stats.map((s, index) => {
      const zebra = index % 2 === 1;
      const rank = index + 1;
      return [
        number(rank, { zebra, bold: rank <= 3, color: rankColor(rank) }),
        text(s.player.name, { zebra }),
        text(`${s.points}:${s.pointsAgainst}`, { zebra, align: 'center' }),
        text(`${s.goalsFor}:${s.goalsAgainst}`, { zebra, align: 'center' }),
        number(s.goalDifference, { zebra, format: SIGNED, bold: s.goalDifference !== 0, color: diffColor(s.goalDifference) }),
      ];
    }),
  ];

  // ---- Matches (rounds alternate in shade) ----
  const matchRows: SheetData = [
    ['Runde', 'Platte', 'Heim', 'Ergebnis', 'Gast'].map(header),
    ...groupMatches.map(m => {
      const zebra = m.round % 2 === 0;
      const winner = winnerSide(m);
      const table = m.tableNumber ?? groupMatches.filter(other => other.round === m.round).indexOf(m) + 1;
      return [
        number(m.round, { zebra }),
        number(table, { zebra }),
        text(m.homePlayer.name, { zebra, bold: winner === 'home' }),
        text(resultText(m), { zebra, align: 'center', bold: true }),
        text(m.awayPlayer.name, { zebra, bold: winner === 'away' }),
      ];
    }),
  ];

  const sheets: XlsxSheet[] = [
    {
      sheet: hasPlayoff ? 'Vorrunde Tabelle' : 'Tabelle',
      data: standings,
      ...layout([{ width: 8 }, { width: widthFor(stats.map(s => s.player.name), 16, 34) }, { width: 11 }, { width: 11 }, { width: 8 }]),
    },
    {
      sheet: hasPlayoff ? 'Vorrunde Spiele' : 'Spiele',
      data: matchRows,
      ...layout([
        { width: 8 },
        { width: 8 },
        { width: widthFor(groupMatches.map(m => m.homePlayer.name), 16, 34) },
        { width: 11 },
        { width: widthFor(groupMatches.map(m => m.awayPlayer.name), 16, 34) },
      ]),
    },
  ];

  // ---- Playoff ----
  if (hasPlayoff) {
    const playoffRows: SheetData = [
      ['Runde', 'Spiel', 'Heim', 'Ergebnis', 'Gast', 'Sieger'].map(header),
      ...playoffMatches.map((m, index) => {
        const zebra = index % 2 === 1;
        const winner = winnerSide(m);
        return [
          text(getRoundName(m.round), { zebra }),
          number(m.matchNumber, { zebra }),
          text(m.homePlayer?.name ?? 'TBD', { zebra, bold: winner === 'home' }),
          text(m.isBye ? 'Freilos' : resultText(m), { zebra, align: 'center', bold: true }),
          text(m.awayPlayer?.name ?? (m.isBye ? '' : 'TBD'), { zebra, bold: winner === 'away' }),
          text(playoffMatchWinner(m)?.name ?? '', { zebra, bold: true }),
        ];
      }),
    ];
    const names = playoffMatches.flatMap(m => [m.homePlayer?.name ?? '', m.awayPlayer?.name ?? '']);
    sheets.push({
      sheet: 'Playoff',
      data: playoffRows,
      ...layout([{ width: 16 }, { width: 8 }, { width: widthFor(names, 16, 34) }, { width: 11 }, { width: widthFor(names, 16, 34) }, { width: widthFor(names, 16, 34) }]),
    });
  }

  return sheets;
}

/** Sheet of a league table. */
export function buildLeagueSheets(league: League): XlsxSheet[] {
  const rows: SheetData = [
    ['Platz', 'Spieler', 'Spiele', 'Punkte', 'Tore', 'Diff', 'M', 'VM', '∅ Pkt/Spiel'].map(header),
    ...league.playerStats.map((s, index) => {
      const zebra = index % 2 === 1;
      const rank = index + 1;
      const totalPoints = s.points + s.pointsAgainst;
      const games = Math.floor(totalPoints / 2);
      const average = totalPoints > 0 ? Math.round((s.points / totalPoints) * 2 * 100) / 100 : 0;
      const titles = s.championships || 0;
      const viceTitles = s.viceChampionships || 0;
      return [
        number(rank, { zebra, bold: rank <= 3, color: rankColor(rank) }),
        text(s.player.name, { zebra }),
        number(games, { zebra }),
        text(`${s.points}:${s.pointsAgainst}`, { zebra, align: 'center' }),
        text(`${s.goalsFor}:${s.goalsAgainst}`, { zebra, align: 'center' }),
        number(s.goalDifference, { zebra, format: SIGNED, bold: s.goalDifference !== 0, color: diffColor(s.goalDifference) }),
        number(titles, { zebra, bold: titles > 0, color: titles > 0 ? COLOR.gold : undefined }),
        number(viceTitles, { zebra, bold: viceTitles > 0, color: viceTitles > 0 ? COLOR.silver : undefined }),
        number(average, { zebra, format: '0.00' }),
      ];
    }),
  ];

  return [
    {
      sheet: 'Gesamttabelle',
      data: rows,
      ...layout([
        { width: 8 },
        { width: widthFor(league.playerStats.map(s => s.player.name), 18, 40) },
        { width: 9 },
        { width: 12 },
        { width: 12 },
        { width: 8 },
        { width: 6 },
        { width: 6 },
        { width: 13 },
      ]),
    },
  ];
}

async function writeWorkbook(sheets: XlsxSheet[], fileName: string): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(sheets).toFile(fileName);
}

export async function exportTrainingToXLSX(session: TrainingSession): Promise<void> {
  await writeWorkbook(buildTrainingSheets(session), trainingFileName(session, 'xlsx'));
}

export async function exportLeagueToXLSX(league: League): Promise<void> {
  await writeWorkbook(buildLeagueSheets(league), leagueFileName(league, 'xlsx'));
}
