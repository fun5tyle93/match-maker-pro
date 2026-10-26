import { beforeEach, describe, expect, it, vi } from 'vitest';
import jsPDF from 'jspdf';
import { buildLeaguePdf, buildTrainingPdf } from '@/lib/exportPdf';
import { fitText, PDF_CONFIG } from '@/lib/pdfStyles';
import { generatePairings } from '@/lib/pairingGenerator';
import { League, Player, TrainingSession } from '@/types';

const LONG_NAMES = [
  'Susanna Grellmann', 'Michael Bräuning', 'Robert Matanovic', 'Klaudio Lange (Kazmierczak)',
  'Benjamin Buza (Reule)', 'Andreas Sigle', 'Heidi Grellmann', 'Stefan Poetsch', 'Max Daub',
  'Rainer Schlotz', 'Jürgen Bischof', 'Maxi Scheibitz', 'Jakob Grätscher', 'Julian Bencsik',
];

function makeSession(playerCount: number, repetitions = 1, complete = true): TrainingSession {
  const players: Player[] = LONG_NAMES.slice(0, playerCount).map((name, i) => ({ id: `p${i}`, name }));
  const { matches, roundCount } = generatePairings(players, repetitions);
  return {
    id: 's',
    date: '2026-10-23T18:00:00Z',
    players,
    roundCount,
    matchesPerPairing: repetitions,
    isCompleted: complete,
    matches: matches.map((m, i) => ({
      ...m,
      isCompleted: complete || i % 2 === 0,
      homeScore: complete || i % 2 === 0 ? (i * 7) % 11 : null,
      awayScore: complete || i % 2 === 0 ? (i * 5) % 9 : null,
    })),
  };
}

interface Drawn {
  text: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  width: number;
  page: number;
}

// jsPDF creates its drawing methods per document, so every new document is wrapped here to record the texts
const recorder = vi.hoisted(() => ({ drawn: [] as Drawn[] }));

vi.mock('@/lib/pdfStyles', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/pdfStyles')>();
  return {
    ...actual,
    createStyledPDF: (...args: Parameters<typeof actual.createStyledPDF>) => {
      const result = actual.createStyledPDF(...args);
      const doc = result.doc;
      const original = doc.text.bind(doc);
      doc.text = ((text: unknown, x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }) => {
        if (typeof text === 'string') {
          recorder.drawn.push({
            text,
            x,
            y,
            align: options?.align ?? 'left',
            width: doc.getTextWidth(text),
            page: doc.getCurrentPageInfo().pageNumber,
          });
        }
        return (original as (...a: unknown[]) => jsPDF)(text, x, y, options);
      }) as typeof doc.text;
      return result;
    },
  };
});

/** The texts drawn since the last call. */
function recordText(): Drawn[] {
  recorder.drawn.length = 0;
  return recorder.drawn;
}

const extent = (d: Drawn): [number, number] =>
  d.align === 'center' ? [d.x - d.width / 2, d.x + d.width / 2] : d.align === 'right' ? [d.x - d.width, d.x] : [d.x, d.x + d.width];

beforeEach(() => recordText());

describe('fitText', () => {
  const doc = new jsPDF();

  it('keeps a text that fits', () => {
    const fitted = fitText(doc, 'Max Daub', 40, 8);
    expect(fitted).toEqual({ text: 'Max Daub', fontSize: 8 });
  });

  it('shrinks a text that is a little too wide', () => {
    doc.setFontSize(8);
    const natural = doc.getTextWidth('Susanna Grellmann');
    const room = natural * 0.9;
    const fitted = fitText(doc, 'Susanna Grellmann', room, 8);
    expect(fitted.fontSize).toBeLessThan(8);
    expect(fitted.text).toBe('Susanna Grellmann');
    doc.setFontSize(fitted.fontSize);
    expect(doc.getTextWidth(fitted.text)).toBeLessThanOrEqual(room + 0.01);
  });

  it('does not cut a text that is only a hair too wide (bold style)', () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    const natural = doc.getTextWidth('Susanna Grellmann');
    for (const room of [natural - 0.05, natural - 1, natural - 3, natural * 0.85]) {
      const fitted = fitText(doc, 'Susanna Grellmann', room, 9.8);
      expect(fitted.text, `room ${room.toFixed(2)}`).toBe('Susanna Grellmann');
      doc.setFontSize(fitted.fontSize);
      expect(doc.getTextWidth(fitted.text)).toBeLessThanOrEqual(room + 0.0001);
      doc.setFontSize(9.8);
    }
    doc.setFont('helvetica', 'normal');
  });

  it('cuts a text that cannot be shrunk enough and marks the cut', () => {
    const fitted = fitText(doc, 'Klaudio Lange (Kazmierczak)', 15, 8);
    expect(fitted.text.endsWith('...')).toBe(true);
    doc.setFontSize(fitted.fontSize);
    expect(doc.getTextWidth(fitted.text)).toBeLessThanOrEqual(15.01);
  });
});

describe('training PDF layout', () => {
  it.each([4, 6, 10, 14])('no two texts on the same line overlap (%i players, long names)', players => {
    const drawn = recordText();
    buildTrainingPdf(makeSession(players));

    const lines = new Map<string, Drawn[]>();
    drawn.forEach(d => {
      const key = `${d.page}:${d.y.toFixed(2)}`;
      lines.set(key, [...(lines.get(key) ?? []), d]);
    });
    lines.forEach(items => {
      const sorted = items.map(d => ({ d, e: extent(d) })).sort((a, b) => a.e[0] - b.e[0]);
      for (let i = 1; i < sorted.length; i++) {
        expect(
          sorted[i].e[0],
          `"${sorted[i - 1].d.text}" overlaps "${sorted[i].d.text}"`,
        ).toBeGreaterThanOrEqual(sorted[i - 1].e[1] - 0.01);
      }
    });
  });

  it('keeps content above the footer and moves rounds to further pages', () => {
    const drawn = recordText();
    const doc = buildTrainingPdf(makeSession(14));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);

    const footerY = PDF_CONFIG.pageHeight - 6;
    const content = drawn.filter(d => !/^(TKC71 Hirschlanden|Seite \d+ von \d+|Erstellt am .*)$/.test(d.text));
    content.forEach(d => expect(d.y, `"${d.text}" is below the content area`).toBeLessThan(footerY - 4));
  });

  it('prints a footer with page numbers on every page', () => {
    const drawn = recordText();
    const doc = buildTrainingPdf(makeSession(14));
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      expect(drawn.some(d => d.text === `Seite ${page} von ${pages}`)).toBe(true);
    }
  });

  it('shows "Sieger" for a finished evening and "Tabellenführer" while matches are open', () => {
    let drawn = recordText();
    buildTrainingPdf(makeSession(6));
    expect(drawn.some(d => d.text === 'SIEGER')).toBe(true);
    expect(drawn.some(d => d.text === 'TABELLENFÜHRER')).toBe(false);

    drawn = recordText();
    buildTrainingPdf(makeSession(6, 1, false));
    expect(drawn.some(d => d.text === 'TABELLENFÜHRER')).toBe(true);
    expect(drawn.some(d => d.text.includes(' von 15'))).toBe(true);
  });

  it('labels platten with "P" and explains it', () => {
    const drawn = recordText();
    buildTrainingPdf(makeSession(6));
    expect(drawn.some(d => d.text === 'P1')).toBe(true);
    expect(drawn.some(d => d.text === 'Spiele (P = Platte)')).toBe(true);
    expect(drawn.some(d => /^T\d+$/.test(d.text))).toBe(false);
  });
});

describe('league PDF', () => {
  it('paginates long tables and numbers the pages', () => {
    const playerStats = Array.from({ length: 120 }, (_, i) => ({
      player: { id: `p${i}`, name: `Spieler ${i + 1}` },
      wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1,
      points: 2, pointsAgainst: 0, goalDifference: 2, championships: 0, viceChampionships: 0,
    }));
    const league: League = { id: 'l', name: 'Ewige Tabelle', year: 1971, playerStats, createdAt: '2026-01-01T00:00:00Z' };
    const drawn = recordText();
    const doc = buildLeaguePdf(league);
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    expect(drawn.some(d => d.text === `Seite ${pages} von ${pages}`)).toBe(true);
  });

  it('avoids characters the PDF standard font cannot draw', () => {
    const drawn = recordText();
    buildLeaguePdf({ id: 'l', name: 'Liga', year: 2026, playerStats: [], createdAt: '2026-01-01T00:00:00Z' });
    expect(drawn.some(d => d.text.includes('∅'))).toBe(false);
    expect(drawn.some(d => d.text === 'Ø Pkt/Spiel')).toBe(true);
  });
});
