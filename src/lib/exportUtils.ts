import * as XLSX from '@e965/xlsx';
import autoTable from 'jspdf-autotable';
import { TrainingSession, League, Match } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';
import { getSwissMatches, toPlayoffMatches, playoffMatchWinner } from './tournamentPhases';
import { getRoundName } from './swissPairing';
import {
  createStyledPDF,
  drawSectionHeader,
  getTableStyles,
  getCompactTableStyles,
  formatGoalDiff,
  getRankColorPDF,
  PDF_COLORS,
  PDF_CONFIG,
  loadLogoBase64,
} from './pdfStyles';

// Helper to group matches by round
function groupMatchesByRound(matches: Match[]): Record<number, Match[]> {
  return matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);
}

// Export training session to XLSX
export function exportTrainingToXLSX(session: TrainingSession): void {
  const swissMatches = getSwissMatches(session.matches);
  const playoffMatches = toPlayoffMatches(session.matches);
  const hasPlayoff = playoffMatches.length > 0;
  const stats = calculatePlayerStats(session.players, swissMatches);
  const wb = XLSX.utils.book_new();

  // Standings sheet with all columns
  const standingsData = stats.map((s, index) => ({
    'Platz': index + 1,
    'Spieler': s.player.name,
    'Punkte': `${s.points}:${s.pointsAgainst}`,
    'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
    'Diff': formatGoalDiff(s.goalDifference),
  }));
  
  const standingsSheet = XLSX.utils.json_to_sheet(standingsData);
  XLSX.utils.book_append_sheet(wb, standingsSheet, hasPlayoff ? 'Vorrunde Tabelle' : 'Tabelle');

  // Matches sheet grouped by round
  const matchesData = swissMatches.map(m => ({
    'Runde': m.round,
    'Tisch': swissMatches.filter(match => match.round === m.round).indexOf(m) + 1,
    'Heim': m.homePlayer.name,
    'Ergebnis': m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-',
    'Gast': m.awayPlayer.name,
  }));
  
  const matchesSheet = XLSX.utils.json_to_sheet(matchesData);
  XLSX.utils.book_append_sheet(wb, matchesSheet, hasPlayoff ? 'Vorrunde Spiele' : 'Spiele');

  // Playoff sheet (bracket incl. results)
  if (hasPlayoff) {
    const playoffData = playoffMatches.map(m => ({
      'Runde': getRoundName(m.round),
      'Spiel': m.matchNumber,
      'Heim': m.homePlayer?.name ?? 'TBD',
      'Ergebnis': m.isBye ? 'Freilos' : m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-',
      'Gast': m.awayPlayer?.name ?? (m.isBye ? '' : 'TBD'),
      'Sieger': playoffMatchWinner(m)?.name ?? '',
    }));
    const playoffSheet = XLSX.utils.json_to_sheet(playoffData);
    XLSX.utils.book_append_sheet(wb, playoffSheet, 'Playoff');
  }

  const date = new Date(session.date).toLocaleDateString('de-DE');
  const fileName = session.name 
    ? `${session.name.replace(/\s/g, '_')}.xlsx`
    : `Trainingsabend_${date.replace(/\./g, '-')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Export training session to PDF with TKC71 branding
export async function exportTrainingToPDF(
  session: TrainingSession,
  options?: { print?: boolean },
): Promise<void> {
  const stats = calculatePlayerStats(session.players, session.matches);
  const matchesByRound = groupMatchesByRound(session.matches);
  
  const date = new Date(session.date).toLocaleDateString('de-DE');
  // Use session name as title, with date as subtitle
  const title = session.name || `Trainingsabend ${date}`;
  
  // Load logo for PDF header
  const logoBase64 = await loadLogoBase64();
  
  const { doc, startY } = createStyledPDF(title, date, logoBase64 || undefined);
  const { margin } = PDF_CONFIG;
  
  let currentY = startY;

  // ============ STANDINGS TABLE ============
  // Column order matches UI: #, Spieler, Pkt, Tore, Diff
  currentY = drawSectionHeader(doc, 'Tabelle', currentY);
  
  const tableStyles = getCompactTableStyles();
  
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Spieler', 'Pkt', 'Tore', 'Diff']],
    body: stats.map((s, index) => [
      index + 1,
      s.player.name,
      `${s.points}:${s.pointsAgainst}`,
      `${s.goalsFor}:${s.goalsAgainst}`,
      formatGoalDiff(s.goalDifference),
    ]),
    ...tableStyles,
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 35 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 12 },
    },
    margin: { left: margin, right: margin },
    tableWidth: 'wrap',
    didParseCell: (data) => {
      // Highlight top 3 ranks
      if (data.section === 'body' && data.column.index === 0) {
        const rank = data.row.index + 1;
        if (rank <= 3) {
          data.cell.styles.textColor = getRankColorPDF(rank);
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ============ MATCHES BY ROUND (Scaled layout for A4) ============
  currentY = drawSectionHeader(doc, 'Spiele', currentY);
  
  const { pageWidth, pageHeight } = PDF_CONFIG;
  const contentWidth = pageWidth - (margin * 2);
  const roundKeys = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
  const numRounds = roundKeys.length;
  
  // Calculate available space and scale factor
  const availableHeight = pageHeight - currentY - 10; // Leave 10mm bottom margin
  const maxMatchesPerRound = Math.max(...Object.values(matchesByRound).map(m => m.length));
  
  // Dynamic scaling: fewer rounds = larger display
  // Base sizes for 8 rounds, scale up for fewer
  const scaleFactor = numRounds <= 4 ? 1.8 : numRounds <= 6 ? 1.4 : numRounds <= 8 ? 1.2 : 1.0;
  
  const baseMatchHeight = 4;
  const baseRoundHeaderHeight = 6;
  const baseFontSize = PDF_CONFIG.fontSize.small;
  
  const matchHeight = baseMatchHeight * scaleFactor;
  const roundHeaderHeight = baseRoundHeaderHeight * scaleFactor;
  const fontSize = Math.min(baseFontSize * scaleFactor, 10); // Cap font size at 10
  
  // Two-column layout
  const colGap = 6 * scaleFactor;
  const colWidth = (contentWidth - colGap) / 2;
  
  let colStartY = currentY;
  let col = 0;
  let maxYInRow = currentY;

  roundKeys.forEach((roundNum) => {
    const matches = matchesByRound[roundNum];
    
    // Determine column position
    const xPos = margin + (col * (colWidth + colGap));
    
    // Check if we need to start a new row of columns
    if (col === 0) {
      colStartY = maxYInRow + (2 * scaleFactor);
    }
    
    let roundY = colStartY;
    
    // Round header (scaled)
    doc.setFillColor(...PDF_COLORS.primary);
    doc.roundedRect(xPos, roundY, colWidth, roundHeaderHeight * 0.8, 1, 1, 'F');
    
    doc.setTextColor(...PDF_COLORS.text);
    doc.setFontSize(fontSize + 1);
    doc.setFont('helvetica', 'bold');
    doc.text(`Runde ${roundNum}`, xPos + colWidth / 2, roundY + (roundHeaderHeight * 0.55), { align: 'center' });
    
    roundY += roundHeaderHeight;
    
    // Matches in this round (scaled)
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    
    matches.forEach((match, mIdx) => {
      const tableNum = mIdx + 1;
      const homeText = match.homePlayer.name;
      const awayText = match.awayPlayer.name;
      const scoreText = match.isCompleted ? `${match.homeScore}:${match.awayScore}` : '-:-';
      
      const textY = roundY + (matchHeight * 0.65);
      
      // Draw match row
      doc.setTextColor(...PDF_COLORS.textMuted);
      doc.text(`T${tableNum}`, xPos + 2, textY);
      
      doc.setTextColor(...PDF_COLORS.text);
      doc.text(homeText, xPos + (8 * scaleFactor), textY);
      
      doc.setTextColor(...PDF_COLORS.accent);
      doc.setFont('helvetica', 'bold');
      doc.text(scoreText, xPos + colWidth / 2, textY, { align: 'center' });
      
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFont('helvetica', 'normal');
      doc.text(awayText, xPos + colWidth - 2, textY, { align: 'right' });
      
      roundY += matchHeight;
    });
    
    // Track max Y for this row
    maxYInRow = Math.max(maxYInRow, roundY + (2 * scaleFactor));
    
    // Alternate columns
    col = (col + 1) % 2;
  });

  // Save the PDF
  const fileName = session.name 
    ? `${session.name.replace(/\s/g, '_')}.pdf`
    : `Trainingsabend_${date.replace(/\./g, '-')}.pdf`;
  if (options?.print) {
    doc.autoPrint();
    const url = doc.output('bloburl') as unknown as string;
    window.open(url, '_blank');
    return;
  }
  doc.save(fileName);
}

// Export league to XLSX with all columns
export function exportLeagueToXLSX(league: League): void {
  const wb = XLSX.utils.book_new();

  const standingsData = league.playerStats.map((s, index) => {
    const totalPoints = s.points + s.pointsAgainst;
    const games = Math.floor(totalPoints / 2);
    const avgPoints = totalPoints > 0 ? ((s.points / totalPoints) * 2).toFixed(2) : '0.00';
    
    // Column order matches UI: #, Spieler, Spiele, Pkt, Tore, Diff, M, VM, ∅ Pkt/Spiel
    return {
      'Platz': index + 1,
      'Spieler': s.player.name,
      'Spiele': games,
      'Punkte': `${s.points}:${s.pointsAgainst}`,
      'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
      'Diff': formatGoalDiff(s.goalDifference),
      'M': s.championships || 0,
      'VM': s.viceChampionships || 0,
      '∅ Pkt/Spiel': avgPoints,
    };
  });
  
  const standingsSheet = XLSX.utils.json_to_sheet(standingsData);
  XLSX.utils.book_append_sheet(wb, standingsSheet, 'Gesamttabelle');

  XLSX.writeFile(wb, `Liga_${league.name.replace(/\s/g, '_')}.xlsx`);
}

// Export league to PDF with TKC71 branding and all columns
// Column order matches UI: #, Spieler, Spiele, Pkt, Tore, Diff, M, VM, ∅ Pkt/Spiel
export async function exportLeagueToPDF(league: League): Promise<void> {
  const createdDate = new Date(league.createdAt).toLocaleDateString('de-DE');
  
  // Load logo for PDF header
  const logoBase64 = await loadLogoBase64();
  
  const { doc, startY } = createStyledPDF(league.name, `Erstellt: ${createdDate}`, logoBase64 || undefined);
  const { margin } = PDF_CONFIG;
  
  let currentY = startY;

  // ============ STANDINGS TABLE ============
  currentY = drawSectionHeader(doc, 'Gesamttabelle', currentY);
  
  const tableStyles = getTableStyles();
  
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Spieler', 'Spiele', 'Pkt', 'Tore', 'Diff', 'M', 'VM', '∅ Pkt/Spiel']],
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
    ...tableStyles,
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 34 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'center', cellWidth: 10 },
      7: { halign: 'center', cellWidth: 10 },
      8: { halign: 'center', cellWidth: 20 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      // Highlight top 3 ranks
      if (data.section === 'body' && data.column.index === 0) {
        const rank = data.row.index + 1;
        if (rank <= 3) {
          data.cell.styles.textColor = getRankColorPDF(rank);
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Color goal difference (column 5)
      if (data.section === 'body' && data.column.index === 5) {
        const text = String(data.cell.raw);
        if (text.startsWith('+')) {
          data.cell.styles.textColor = PDF_COLORS.positive;
        } else if (text.startsWith('-')) {
          data.cell.styles.textColor = PDF_COLORS.negative;
        }
      }
      // Gold color for championships (column 6)
      if (data.section === 'body' && data.column.index === 6) {
        const value = Number(data.cell.raw);
        if (value > 0) {
          data.cell.styles.textColor = PDF_COLORS.gold;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Silver color for vice championships (column 7)
      if (data.section === 'body' && data.column.index === 7) {
        const value = Number(data.cell.raw);
        if (value > 0) {
          data.cell.styles.textColor = PDF_COLORS.silver;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  doc.save(`Liga_${league.name.replace(/\s/g, '_')}.pdf`);
}
