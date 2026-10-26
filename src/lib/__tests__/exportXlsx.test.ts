import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/universal';
import { buildLeagueSheets, buildTrainingSheets } from '@/lib/exportXlsx';
import { generatePairings } from '@/lib/pairingGenerator';
import { League, Player, TrainingSession } from '@/types';

const players: Player[] = ['Anna Aal', 'Bernd Bär', 'Clara Cäsar', 'Dirk Dachs'].map((name, i) => ({ id: `p${i}`, name }));

function session(): TrainingSession {
  const { matches, roundCount } = generatePairings(players, 1);
  return {
    id: 's',
    date: '2026-10-23T18:00:00Z',
    players,
    roundCount,
    matchesPerPairing: 1,
    isCompleted: true,
    matches: matches.map((m, i) => ({ ...m, isCompleted: true, homeScore: (i * 3) % 7, awayScore: (i * 2) % 5 })),
  };
}

const league: League = {
  id: 'l',
  name: 'Liga 2026',
  year: 2026,
  createdAt: '2026-01-01T00:00:00Z',
  playerStats: [
    { player: players[0], wins: 3, draws: 1, losses: 0, goalsFor: 12, goalsAgainst: 4, points: 7, pointsAgainst: 1, goalDifference: 8, championships: 2, viceChampionships: 0 },
    { player: players[1], wins: 0, draws: 1, losses: 3, goalsFor: 4, goalsAgainst: 12, points: 1, pointsAgainst: 7, goalDifference: -8, championships: 0, viceChampionships: 1 },
  ],
};

const cellValue = (cell: unknown) => (cell && typeof cell === 'object' ? (cell as { value: unknown }).value : cell);

describe('training sheets', () => {
  const sheets = buildTrainingSheets(session());

  it('keeps the sheet names and column order', () => {
    expect(sheets.map(s => s.sheet)).toEqual(['Tabelle', 'Spiele']);
    expect(sheets[0].data[0].map(cellValue)).toEqual(['Platz', 'Spieler', 'Punkte', 'Tore', 'Diff']);
    expect(sheets[1].data[0].map(cellValue)).toEqual(['Runde', 'Platte', 'Heim', 'Ergebnis', 'Gast']);
  });

  it('styles the header row and freezes it', () => {
    sheets.forEach(sheet => {
      expect(sheet.stickyRowsCount).toBe(1);
      sheet.data[0].forEach(cell => {
        expect(cell).toMatchObject({ fontWeight: 'bold', backgroundColor: '#EAB308' });
      });
    });
  });

  it('has a width for every column', () => {
    sheets.forEach(sheet => expect(sheet.columns).toHaveLength(sheet.data[0].length));
  });

  it('writes numbers as numbers so they can be sorted and filtered', () => {
    const row = sheets[0].data[1] as { value: unknown; type?: unknown; format?: string }[];
    expect(row[0]).toMatchObject({ type: Number, value: 1 });
    expect(row[4]).toMatchObject({ type: Number, format: '+0;-0;0' });
    const matchRow = sheets[1].data[1] as { value: unknown; type?: unknown }[];
    expect(matchRow[0]).toMatchObject({ type: Number });
    expect(matchRow[1]).toMatchObject({ type: Number });
  });

  it('keeps results as text so Excel does not read "3:2" as a time', () => {
    const row = sheets[1].data[1] as { value: string; type?: unknown; format?: string }[];
    expect(row[3]).toMatchObject({ type: String, format: '@' });
    expect(row[3].value).toMatch(/^\d+:\d+$/);
  });

  it('uses the stored platte of every match', () => {
    const rows = sheets[1].data.slice(1).map(r => cellValue((r as unknown[])[1]));
    expect(rows.every(n => typeof n === 'number' && n >= 1)).toBe(true);
  });
});

describe('page orientation', () => {
  const withNames = (names: string[]): TrainingSession => {
    const named: Player[] = names.map((name, i) => ({ id: `n${i}`, name }));
    const { matches, roundCount } = generatePairings(named, 1);
    return {
      id: 's', date: '2026-10-23T18:00:00Z', players: named, roundCount, matchesPerPairing: 1, isCompleted: true,
      matches: matches.map(m => ({ ...m, isCompleted: true, homeScore: 1, awayScore: 0 })),
    };
  };

  it('prints a sheet with short names in portrait', () => {
    const sheets = buildTrainingSheets(withNames(['Anna', 'Ben', 'Cem', 'Dora']));
    sheets.forEach(sheet => expect(sheet.orientation).toBeUndefined());
  });

  it('prints the matches sheet in landscape when names are long, the narrow standings stay portrait', () => {
    const sheets = buildTrainingSheets(withNames(['Klaudio Lange (Kazmierczak)', 'Benjamin Buza (Reule)', 'Susanna Grellmann', 'Max Daub']));
    const byName = Object.fromEntries(sheets.map(s => [s.sheet, s]));
    expect(byName['Spiele'].orientation).toBe('landscape');
    expect(byName['Tabelle'].orientation).toBeUndefined();
  });
});

describe('league sheet', () => {
  const [sheet] = buildLeagueSheets(league);

  it('has the table columns in the UI order', () => {
    expect(sheet.data[0].map(cellValue)).toEqual(['Platz', 'Spieler', 'Spiele', 'Punkte', 'Tore', 'Diff', 'M', 'VM', '∅ Pkt/Spiel']);
  });

  it('writes the average as a number with two decimals', () => {
    const row = sheet.data[1] as { value: number; type?: unknown; format?: string }[];
    expect(row[8]).toMatchObject({ type: Number, format: '0.00', value: 1.75 });
  });

  it('prints in landscape because of its nine columns', () => {
    expect(sheet.orientation).toBe('landscape');
  });

  it('colors the sign of the goal difference', () => {
    const plus = (sheet.data[1] as { textColor?: string }[])[5];
    const minus = (sheet.data[2] as { textColor?: string }[])[5];
    expect(plus.textColor).toBe('#16A34A');
    expect(minus.textColor).toBe('#DC2626');
  });
});

describe('the written .xlsx file', () => {
  it('contains the styles, column widths and the frozen header row', async () => {
    const blob = await writeExcelFile(buildTrainingSheets(session())).toBlob();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const names = Object.keys(files);
    expect(names).toContain('xl/styles.xml');

    const styles = strFromU8(files['xl/styles.xml']);
    expect(styles).toMatch(/<b\s*\/>|<b>/); // bold font
    expect(styles.toUpperCase()).toContain('EAB308'); // header fill

    const sheetXml = strFromU8(files[names.find(n => n.startsWith('xl/worksheets/sheet1'))!]);
    expect(sheetXml).toContain('<cols>');
    expect(sheetXml).toMatch(/<pane[^>]*state="frozen"/);

    const workbook = strFromU8(files['xl/workbook.xml']);
    expect(workbook).toContain('name="Tabelle"');
    expect(workbook).toContain('name="Spiele"');
  });
});
