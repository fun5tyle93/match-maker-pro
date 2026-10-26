import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { League, Match, TrainingSession } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';
import { groupMatchesByRound } from './tables';
import { getSwissMatches, toPlayoffMatches, playoffMatchWinner } from './tournamentPhases';
import { getRoundName } from './swissPairing';
import {
  createStyledPDF,
  drawFooters,
  drawSectionHeader,
  fitText,
  getCompactTableStyles,
  getRankColorPDF,
  getTableStyles,
  formatGoalDiff,
  loadLogoBase64,
  PDF_COLORS,
  PDF_CONFIG,
} from './pdfStyles';
import {
  formatDateDE,
  formatDecimalDE,
  leagueFileName,
  sessionTitle,
  summarizeMatches,
  trainingFileName,
} from './exportShared';

type PdfWithTable = jsPDF & { lastAutoTable: { finalY: number } };
const tableEnd = (doc: jsPDF): number => (doc as PdfWithTable).lastAutoTable.finalY;

// Width of the standings table (sum of its columns) – the summary box sits next to it
const STANDINGS_COLUMNS = [8, 35, 18, 18, 12];
const STANDINGS_WIDTH = STANDINGS_COLUMNS.reduce((sum, w) => sum + w, 0);

function winnerSide(match: Match): 'home' | 'away' | null {
  if (!match.isCompleted || match.homeScore === null || match.awayScore === null) return null;
  return match.homeScore > match.awayScore ? 'home' : match.homeScore < match.awayScore ? 'away' : null;
}

// ─── Summary box ───────────────────────────────────────────────────────────

interface SummaryLine {
  label: string;
  value: string;
}

/** Draws the box with the winner and the key numbers; returns the y position below it. */
function drawSummaryBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  headline: SummaryLine,
  lines: SummaryLine[],
): number {
  const padding = 5;
  const height = 19 + lines.length * 5;

  doc.setFillColor(...PDF_COLORS.backgroundAlt);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.setLineWidth(0.2);
  doc.rect(x, y, width, height, 'FD');
  doc.setFillColor(...PDF_COLORS.gold);
  doc.rect(x, y, 2, height, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_CONFIG.fontSize.small);
  doc.setTextColor(...PDF_COLORS.textMuted);
  doc.text(headline.label.toUpperCase(), x + padding, y + 5.5);

  doc.setFont('helvetica', 'bold');
  const fitted = fitText(doc, headline.value, width - padding * 2, 13, 8);
  doc.setFontSize(fitted.fontSize);
  doc.setTextColor(...PDF_COLORS.accent);
  doc.text(fitted.text, x + padding, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(PDF_CONFIG.fontSize.body);
  lines.forEach((line, index) => {
    const lineY = y + 19 + index * 5;
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(line.label, x + padding, lineY);
    doc.setTextColor(...PDF_COLORS.text);
    doc.text(line.value, x + width - padding, lineY, { align: 'right' });
  });

  doc.setTextColor(...PDF_COLORS.text);
  return y + height;
}

// ─── Round blocks ──────────────────────────────────────────────────────────

interface RoundLayout {
  scale: number;
  fontSize: number;
  matchHeight: number;
  headerHeight: number;
  colWidth: number;
  colGap: number;
}

function roundLayout(roundCount: number): RoundLayout {
  // Fewer rounds: larger display
  const scale = roundCount <= 4 ? 1.8 : roundCount <= 6 ? 1.4 : roundCount <= 8 ? 1.2 : 1.0;
  const contentWidth = PDF_CONFIG.pageWidth - PDF_CONFIG.margin * 2;
  const colGap = 6 * scale;
  return {
    scale,
    fontSize: Math.min(PDF_CONFIG.fontSize.small * scale, 10),
    matchHeight: 4 * scale,
    headerHeight: 6 * scale,
    colWidth: (contentWidth - colGap) / 2,
    colGap,
  };
}

const blockHeight = (layout: RoundLayout, matchCount: number) =>
  layout.headerHeight + matchCount * layout.matchHeight + 2 * layout.scale;

/** Draws one round: header, then one line per match (platte, home, score, away). */
function drawRoundBlock(doc: jsPDF, layout: RoundLayout, round: number, matches: Match[], x: number, y: number): void {
  const { fontSize, colWidth, headerHeight, matchHeight, scale } = layout;

  doc.setFillColor(...PDF_COLORS.primary);
  doc.roundedRect(x, y, colWidth, headerHeight * 0.8, 1, 1, 'F');
  doc.setTextColor(...PDF_COLORS.text);
  doc.setFontSize(fontSize + 1);
  doc.setFont('helvetica', 'bold');
  doc.text(`Runde ${round}`, x + colWidth / 2, y + headerHeight * 0.55, { align: 'center' });

  // Names get the space between the platte label and the score; longer names shrink or are cut
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const labelWidth = 8 * scale;
  const center = x + colWidth / 2;
  const scoreHalf = doc.getTextWidth('88:88') / 2 + 1.5;
  const homeMax = center - scoreHalf - (x + labelWidth);
  const awayMax = x + colWidth - 2 - (center + scoreHalf);

  let lineY = y + headerHeight;
  matches.forEach((match, index) => {
    const textY = lineY + matchHeight * 0.65;
    const winner = winnerSide(match);
    const table = match.tableNumber ?? index + 1;
    const score = match.isCompleted ? `${match.homeScore}:${match.awayScore}` : '-:-';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...PDF_COLORS.textMuted);
    doc.text(`P${table}`, x + 2, textY);

    doc.setTextColor(...PDF_COLORS.text);
    doc.setFont('helvetica', winner === 'home' ? 'bold' : 'normal');
    const home = fitText(doc, match.homePlayer.name, homeMax, fontSize);
    doc.setFontSize(home.fontSize);
    doc.text(home.text, x + labelWidth, textY);

    doc.setFont('helvetica', winner === 'away' ? 'bold' : 'normal');
    const away = fitText(doc, match.awayPlayer.name, awayMax, fontSize);
    doc.setFontSize(away.fontSize);
    doc.text(away.text, x + colWidth - 2, textY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(...PDF_COLORS.accent);
    doc.text(score, center, textY, { align: 'center' });

    lineY += matchHeight;
  });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.text);
}

// ─── Training evening ──────────────────────────────────────────────────────

/** Builds the PDF of a training evening (no download). */
export function buildTrainingPdf(session: TrainingSession, logoBase64?: string): jsPDF {
  const groupMatches = getSwissMatches(session.matches);
  const playoffMatches = toPlayoffMatches(session.matches);
  const hasPlayoff = playoffMatches.length > 0;
  const stats = calculatePlayerStats(session.players, groupMatches);
  const matchesByRound = groupMatchesByRound(groupMatches);
  const summary = summarizeMatches(groupMatches);

  const { doc, startY } = createStyledPDF(sessionTitle(session), formatDateDE(session.date), logoBase64);
  const { margin, pageWidth, pageHeight } = PDF_CONFIG;
  let currentY = startY;

  // ============ STANDINGS + SUMMARY ============
  // Column order matches the UI: #, Spieler, Pkt, Tore, Diff
  currentY = drawSectionHeader(doc, hasPlayoff ? 'Vorrunde – Tabelle' : 'Tabelle', currentY);
  const standingsTop = currentY;

  autoTable(doc, {
    startY: standingsTop,
    head: [['#', 'Spieler', 'Pkt', 'Tore', 'Diff']],
    body: stats.map((s, index) => [
      index + 1,
      s.player.name,
      `${s.points}:${s.pointsAgainst}`,
      `${s.goalsFor}:${s.goalsAgainst}`,
      formatGoalDiff(s.goalDifference),
    ]),
    ...getCompactTableStyles(),
    columnStyles: {
      0: { halign: 'center', cellWidth: STANDINGS_COLUMNS[0] },
      1: { halign: 'left', cellWidth: STANDINGS_COLUMNS[1] },
      2: { halign: 'center', cellWidth: STANDINGS_COLUMNS[2] },
      3: { halign: 'center', cellWidth: STANDINGS_COLUMNS[3] },
      4: { halign: 'center', cellWidth: STANDINGS_COLUMNS[4] },
    },
    margin: { left: margin, right: margin },
    tableWidth: 'wrap',
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 0) {
        const rank = data.row.index + 1;
        if (rank <= 3) {
          data.cell.styles.textColor = getRankColorPDF(rank);
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 4) {
        const diff = String(data.cell.raw);
        if (diff.startsWith('+')) data.cell.styles.textColor = PDF_COLORS.positive;
        else if (diff.startsWith('-')) data.cell.styles.textColor = PDF_COLORS.negative;
      }
    },
  });
  let standingsBottom = tableEnd(doc);

  if (stats.length > 0) {
    const finalMatch = playoffMatches.find(m => m.round === 1);
    const champion = finalMatch ? playoffMatchWinner(finalMatch) : null;
    const headline =
      hasPlayoff && champion
        ? { label: 'Turniersieger', value: champion.name }
        : { label: summary.complete ? 'Sieger' : 'Tabellenführer', value: stats[0].player.name };

    const boxX = margin + STANDINGS_WIDTH + 8;
    const boxBottom = drawSummaryBox(doc, boxX, standingsTop, pageWidth - margin - boxX, headline, [
      { label: 'Spieler', value: String(session.players.length) },
      {
        label: 'Spiele',
        value: summary.complete ? String(summary.matchesTotal) : `${summary.matchesPlayed} von ${summary.matchesTotal}`,
      },
      { label: 'Runden', value: String(summary.rounds) },
      {
        label: 'Tore',
        value:
          summary.matchesPlayed > 0
            ? `${summary.goals} (Ø ${formatDecimalDE(summary.goalsPerMatch)} pro Spiel)`
            : '–',
      },
    ]);
    standingsBottom = Math.max(standingsBottom, boxBottom);
  }
  currentY = standingsBottom + 8;

  // ============ MATCHES BY ROUND ============
  // Two rounds side by side; a new page starts when the next pair does not fit
  const layout = roundLayout(Object.keys(matchesByRound).length);
  const roundKeys = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
  const bottomLimit = pageHeight - PDF_CONFIG.footerHeight - 2;
  const spiele = hasPlayoff ? 'Vorrunde – Spiele (P = Platte)' : 'Spiele (P = Platte)';

  const firstRowHeight = Math.max(
    ...roundKeys.slice(0, 2).map(r => blockHeight(layout, matchesByRound[r].length)),
    0,
  );
  // Keep the heading together with at least the first row of rounds
  if (roundKeys.length > 0 && currentY + 10 + firstRowHeight > bottomLimit) {
    doc.addPage();
    currentY = margin + 4;
  }
  currentY = drawSectionHeader(doc, spiele, currentY);

  for (let i = 0; i < roundKeys.length; i += 2) {
    const pair = roundKeys.slice(i, i + 2);
    const rowHeight = Math.max(...pair.map(r => blockHeight(layout, matchesByRound[r].length)));

    if (currentY + rowHeight > bottomLimit) {
      doc.addPage();
      currentY = drawSectionHeader(doc, 'Spiele (Fortsetzung)', margin + 4);
    }

    pair.forEach((round, col) => {
      const x = margin + col * (layout.colWidth + layout.colGap);
      drawRoundBlock(doc, layout, round, matchesByRound[round], x, currentY);
    });
    currentY += rowHeight;
  }

  // ============ PLAYOFF ============
  if (hasPlayoff) {
    doc.addPage();
    let playoffY = drawSectionHeader(doc, 'Playoff', margin + 6);

    autoTable(doc, {
      startY: playoffY,
      head: [['Runde', 'Spiel', 'Heim', 'Ergebnis', 'Gast', 'Sieger']],
      body: playoffMatches.map(m => [
        getRoundName(m.round),
        m.matchNumber,
        m.homePlayer?.name ?? 'TBD',
        m.isBye ? 'Freilos' : m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-:-',
        m.awayPlayer?.name ?? (m.isBye ? '' : 'TBD'),
        playoffMatchWinner(m)?.name ?? '',
      ]),
      ...getCompactTableStyles(),
      columnStyles: {
        0: { halign: 'left', cellWidth: 28 },
        1: { halign: 'center', cellWidth: 12 },
        2: { halign: 'left', cellWidth: 32 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'left', cellWidth: 32 },
        5: { halign: 'left', cellWidth: 32 },
      },
      margin: { left: margin, right: margin },
    });
    playoffY = tableEnd(doc) + 10;

    const finalMatch = playoffMatches.find(m => m.round === 1);
    const champion = finalMatch ? playoffMatchWinner(finalMatch) : null;
    if (champion) {
      doc.setTextColor(...PDF_COLORS.accent);
      doc.setFontSize(PDF_CONFIG.fontSize.subtitle);
      doc.setFont('helvetica', 'bold');
      doc.text(`Turniersieger: ${champion.name}`, margin, playoffY);
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFont('helvetica', 'normal');
    }
  }

  drawFooters(doc, formatDateDE(new Date()));
  return doc;
}

export async function exportTrainingToPDF(
  session: TrainingSession,
  options?: { print?: boolean },
): Promise<void> {
  const logo = await loadLogoBase64();
  const doc = buildTrainingPdf(session, logo ?? undefined);

  if (options?.print) {
    doc.autoPrint();
    const url = doc.output('bloburl') as unknown as string;
    window.open(url, '_blank');
    return;
  }
  doc.save(trainingFileName(session, 'pdf'));
}

// ─── League ────────────────────────────────────────────────────────────────

/** Builds the PDF of a league table (no download). */
export function buildLeaguePdf(league: League, logoBase64?: string): jsPDF {
  const { doc, startY } = createStyledPDF(
    league.name,
    `Erstellt: ${formatDateDE(league.createdAt)}`,
    logoBase64,
  );
  const { margin } = PDF_CONFIG;

  // Column order matches the UI: #, Spieler, Spiele, Pkt, Tore, Diff, M, VM, ∅ Pkt/Spiel
  const currentY = drawSectionHeader(doc, 'Gesamttabelle', startY);

  autoTable(doc, {
    startY: currentY,
    // "Ø" instead of "∅": the PDF standard font has no glyph for the empty-set sign
    head: [['#', 'Spieler', 'Spiele', 'Pkt', 'Tore', 'Diff', 'M', 'VM', 'Ø Pkt/Spiel']],
    body: league.playerStats.map((s, index) => {
      const totalPoints = s.points + s.pointsAgainst;
      const games = Math.floor(totalPoints / 2);
      const avgPoints = totalPoints > 0 ? ((s.points / totalPoints) * 2).toFixed(2) : '-';
      return [
        index + 1,
        s.player.name,
        games,
        `${s.points}:${s.pointsAgainst}`,
        `${s.goalsFor}:${s.goalsAgainst}`,
        formatGoalDiff(s.goalDifference),
        s.championships || 0,
        s.viceChampionships || 0,
        avgPoints,
      ];
    }),
    ...getTableStyles(),
    // The columns add up to the full content width (186 mm)
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 52 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'center', cellWidth: 12 },
      8: { halign: 'center', cellWidth: 26 },
    },
    // Later pages keep clear of the footer
    margin: { left: margin, right: margin, bottom: PDF_CONFIG.footerHeight + 4 },
    didParseCell: data => {
      if (data.section === 'body' && data.column.index === 0) {
        const rank = data.row.index + 1;
        if (rank <= 3) {
          data.cell.styles.textColor = getRankColorPDF(rank);
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 5) {
        const diff = String(data.cell.raw);
        if (diff.startsWith('+')) data.cell.styles.textColor = PDF_COLORS.positive;
        else if (diff.startsWith('-')) data.cell.styles.textColor = PDF_COLORS.negative;
      }
      if (data.section === 'body' && data.column.index === 6 && Number(data.cell.raw) > 0) {
        data.cell.styles.textColor = PDF_COLORS.gold;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'body' && data.column.index === 7 && Number(data.cell.raw) > 0) {
        data.cell.styles.textColor = PDF_COLORS.silver;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  drawFooters(doc, formatDateDE(new Date()));
  return doc;
}

export async function exportLeagueToPDF(league: League): Promise<void> {
  const logo = await loadLogoBase64();
  buildLeaguePdf(league, logo ?? undefined).save(leagueFileName(league, 'pdf'));
}
