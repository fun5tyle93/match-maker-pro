import * as XLSX from 'xlsx';
import autoTable from 'jspdf-autotable';
import { TrainingSession, League, Match } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';
import {
  createStyledPDF,
  drawSectionHeader,
  drawRoundHeader,
  getTableStyles,
  getCompactTableStyles,
  formatGoalDiff,
  getRankColorPDF,
  PDF_COLORS,
  PDF_CONFIG,
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
  const stats = calculatePlayerStats(session.players, session.matches);
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
  XLSX.utils.book_append_sheet(wb, standingsSheet, 'Tabelle');

  // Matches sheet grouped by round
  const matchesData = session.matches.map(m => ({
    'Runde': m.round,
    'Tisch': session.matches.filter(match => match.round === m.round).indexOf(m) + 1,
    'Heim': m.homePlayer.name,
    'Ergebnis': m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-',
    'Gast': m.awayPlayer.name,
  }));
  
  const matchesSheet = XLSX.utils.json_to_sheet(matchesData);
  XLSX.utils.book_append_sheet(wb, matchesSheet, 'Spiele');

  const date = new Date(session.date).toLocaleDateString('de-DE');
  const fileName = session.name 
    ? `${session.name.replace(/\s/g, '_')}.xlsx`
    : `Trainingsabend_${date.replace(/\./g, '-')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// Export training session to PDF with TKC71 branding
export function exportTrainingToPDF(session: TrainingSession): void {
  const stats = calculatePlayerStats(session.players, session.matches);
  const matchesByRound = groupMatchesByRound(session.matches);
  
  const date = new Date(session.date).toLocaleDateString('de-DE');
  // Use session name as title, with date as subtitle
  const title = session.name || `Trainingsabend ${date}`;
  
  const { doc, startY } = createStyledPDF(title, date);
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

  // ============ MATCHES BY ROUND (Two-column layout) ============
  currentY = drawSectionHeader(doc, 'Spiele', currentY);
  
  const { pageWidth } = PDF_CONFIG;
  const contentWidth = pageWidth - (margin * 2);
  const colWidth = (contentWidth - 4) / 2;
  const roundKeys = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
  
  // Calculate optimal layout: if 8 rounds or less, try to fit all on page
  const matchHeight = 4; // Height per match row
  const roundHeaderHeight = 8; // Height for round header
  
  let colStartY = currentY;
  let col = 0;
  let maxYInRow = currentY;

  roundKeys.forEach((roundNum, roundIndex) => {
    const matches = matchesByRound[roundNum];
    const roundTotalHeight = roundHeaderHeight + (matches.length * matchHeight) + 4;
    
    // Determine column position
    const xPos = margin + (col * (colWidth + 4));
    
    // Check if we need to start a new row of columns
    if (col === 0) {
      colStartY = maxYInRow + 2;
    }
    
    let roundY = colStartY;
    
    // Round header
    roundY = drawRoundHeader(doc, roundNum, xPos, roundY, colWidth);
    
    // Matches in this round
    doc.setFontSize(PDF_CONFIG.fontSize.small);
    doc.setFont('helvetica', 'normal');
    
    matches.forEach((match, mIdx) => {
      const tableNum = mIdx + 1;
      const homeText = match.homePlayer.name;
      const awayText = match.awayPlayer.name;
      const scoreText = match.isCompleted ? `${match.homeScore}:${match.awayScore}` : '-:-';
      
      // Draw match row
      doc.setTextColor(...PDF_COLORS.textMuted);
      doc.text(`T${tableNum}`, xPos + 2, roundY + 3);
      
      doc.setTextColor(...PDF_COLORS.text);
      doc.text(homeText, xPos + 10, roundY + 3);
      
      doc.setTextColor(...PDF_COLORS.accent);
      doc.setFont('helvetica', 'bold');
      doc.text(scoreText, xPos + colWidth / 2, roundY + 3, { align: 'center' });
      
      doc.setTextColor(...PDF_COLORS.text);
      doc.setFont('helvetica', 'normal');
      doc.text(awayText, xPos + colWidth - 2, roundY + 3, { align: 'right' });
      
      roundY += matchHeight;
    });
    
    // Track max Y for this row
    maxYInRow = Math.max(maxYInRow, roundY + 2);
    
    // Alternate columns
    col = (col + 1) % 2;
  });

  // Save the PDF
  const fileName = session.name 
    ? `${session.name.replace(/\s/g, '_')}.pdf`
    : `Trainingsabend_${date.replace(/\./g, '-')}.pdf`;
  doc.save(fileName);
}

// Export league to XLSX with all columns
export function exportLeagueToXLSX(league: League): void {
  const wb = XLSX.utils.book_new();

  const standingsData = league.playerStats.map((s, index) => {
    const totalPoints = s.points + s.pointsAgainst;
    const games = Math.floor(totalPoints / 2);
    const avgPoints = totalPoints > 0 ? ((s.points / totalPoints) * 2).toFixed(2) : '0.00';
    
    return {
      'Platz': index + 1,
      'Spieler': s.player.name,
      'M': s.championships || 0,
      'VM': s.viceChampionships || 0,
      '∅': avgPoints,
      'Spiele': games,
      'Punkte': `${s.points}:${s.pointsAgainst}`,
      'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
      'Diff': formatGoalDiff(s.goalDifference),
    };
  });
  
  const standingsSheet = XLSX.utils.json_to_sheet(standingsData);
  XLSX.utils.book_append_sheet(wb, standingsSheet, 'Gesamttabelle');

  XLSX.writeFile(wb, `Liga_${league.name.replace(/\s/g, '_')}.xlsx`);
}

// Export league to PDF with TKC71 branding and all columns
// Column order matches UI: #, Spieler, Spiele, Pkt, Tore, Diff, M, VM, ∅
export function exportLeagueToPDF(league: League): void {
  const createdDate = new Date(league.createdAt).toLocaleDateString('de-DE');
  
  const { doc, startY } = createStyledPDF(league.name, `Erstellt: ${createdDate}`);
  const { margin } = PDF_CONFIG;
  
  let currentY = startY;

  // ============ STANDINGS TABLE ============
  currentY = drawSectionHeader(doc, 'Gesamttabelle', currentY);
  
  const tableStyles = getTableStyles();
  
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Spieler', 'Spiele', 'Pkt', 'Tore', 'Diff', 'M', 'VM', '∅']],
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
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 40 },
      2: { halign: 'center', cellWidth: 16 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'center', cellWidth: 12 },
      8: { halign: 'center', cellWidth: 14 },
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
