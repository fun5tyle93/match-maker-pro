import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TrainingSession, League, PlayerStats, Match } from '@/types';
import { calculatePlayerStats } from './pairingGenerator';

// Export training session to XLSX
export function exportTrainingToXLSX(session: TrainingSession): void {
  const stats = calculatePlayerStats(session.players, session.matches);
  const wb = XLSX.utils.book_new();

  // Standings sheet
  const standingsData = stats.map((s, index) => ({
    'Platz': index + 1,
    'Spieler': s.player.name,
    'Punkte': `${s.points}:${s.pointsAgainst}`,
    'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
    'Diff': s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference,
  }));
  
  const standingsSheet = XLSX.utils.json_to_sheet(standingsData);
  XLSX.utils.book_append_sheet(wb, standingsSheet, 'Tabelle');

  // Matches sheet
  const matchesData = session.matches.map(m => ({
    'Runde': m.round,
    'Heim': m.homePlayer.name,
    'Ergebnis': m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-',
    'Gast': m.awayPlayer.name,
  }));
  
  const matchesSheet = XLSX.utils.json_to_sheet(matchesData);
  XLSX.utils.book_append_sheet(wb, matchesSheet, 'Spiele');

  const date = new Date(session.date).toLocaleDateString('de-DE');
  XLSX.writeFile(wb, `Trainingsabend_${date.replace(/\./g, '-')}.xlsx`);
}

// Export training session to PDF
export function exportTrainingToPDF(session: TrainingSession): void {
  const stats = calculatePlayerStats(session.players, session.matches);
  const doc = new jsPDF();
  
  const date = new Date(session.date).toLocaleDateString('de-DE');
  
  // Title
  doc.setFontSize(18);
  doc.text(`Trainingsabend - ${date}`, 14, 20);
  
  // Standings table
  doc.setFontSize(14);
  doc.text('Tabelle', 14, 35);
  
  autoTable(doc, {
    startY: 40,
    head: [['#', 'Spieler', 'Punkte', 'Tore', 'Diff']],
    body: stats.map((s, index) => [
      index + 1,
      s.player.name,
      `${s.points}:${s.pointsAgainst}`,
      `${s.goalsFor}:${s.goalsAgainst}`,
      s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference,
    ]),
    styles: { halign: 'center' },
    columnStyles: { 1: { halign: 'left' } },
  });
  
  // Matches table
  const finalY = (doc as any).lastAutoTable.finalY || 100;
  doc.setFontSize(14);
  doc.text('Spiele', 14, finalY + 15);
  
  autoTable(doc, {
    startY: finalY + 20,
    head: [['Runde', 'Heim', 'Ergebnis', 'Gast']],
    body: session.matches.map(m => [
      m.round,
      m.homePlayer.name,
      m.isCompleted ? `${m.homeScore}:${m.awayScore}` : '-',
      m.awayPlayer.name,
    ]),
    styles: { halign: 'center' },
    columnStyles: { 1: { halign: 'left' }, 3: { halign: 'left' } },
  });

  doc.save(`Trainingsabend_${date.replace(/\./g, '-')}.pdf`);
}

// Export league to XLSX
export function exportLeagueToXLSX(league: League): void {
  const wb = XLSX.utils.book_new();

  const standingsData = league.playerStats.map((s, index) => ({
    'Platz': index + 1,
    'Spieler': s.player.name,
    'Punkte': `${s.points}:${s.pointsAgainst}`,
    'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
    'Diff': s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference,
  }));
  
  const standingsSheet = XLSX.utils.json_to_sheet(standingsData);
  XLSX.utils.book_append_sheet(wb, standingsSheet, 'Tabelle');

  XLSX.writeFile(wb, `Liga_${league.name.replace(/\s/g, '_')}.xlsx`);
}

// Export league to PDF
export function exportLeagueToPDF(league: League): void {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(`${league.name}`, 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(128);
  const createdDate = new Date(league.createdAt).toLocaleDateString('de-DE');
  doc.text(`Erstellt am ${createdDate}`, 14, 28);
  doc.setTextColor(0);
  
  // Standings table
  doc.setFontSize(14);
  doc.text('Gesamttabelle', 14, 42);
  
  autoTable(doc, {
    startY: 47,
    head: [['#', 'Spieler', 'Punkte', 'Tore', 'Diff']],
    body: league.playerStats.map((s, index) => [
      index + 1,
      s.player.name,
      `${s.points}:${s.pointsAgainst}`,
      `${s.goalsFor}:${s.goalsAgainst}`,
      s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference,
    ]),
    styles: { halign: 'center' },
    columnStyles: { 1: { halign: 'left' } },
  });

  doc.save(`Liga_${league.name.replace(/\s/g, '_')}.pdf`);
}
