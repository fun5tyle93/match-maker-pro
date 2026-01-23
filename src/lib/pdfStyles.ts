import jsPDF from 'jspdf';

// TKC71 Hirschlanden Design System Colors (RGB)
export const PDF_COLORS = {
  // Primary Yellow (from app)
  primary: [234, 179, 8] as [number, number, number],
  primaryDark: [202, 138, 4] as [number, number, number],
  
  // Accent Red (from app)
  accent: [220, 38, 38] as [number, number, number],
  accentDark: [185, 28, 28] as [number, number, number],
  
  // Text colors
  text: [31, 41, 55] as [number, number, number],
  textMuted: [107, 114, 128] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  
  // Background colors
  background: [255, 255, 255] as [number, number, number],
  backgroundAlt: [249, 250, 251] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  
  // Rank colors
  gold: [234, 179, 8] as [number, number, number],
  silver: [156, 163, 175] as [number, number, number],
  bronze: [180, 83, 9] as [number, number, number],
  
  // Positive/Negative
  positive: [22, 163, 74] as [number, number, number],
  negative: [220, 38, 38] as [number, number, number],
};

// PDF Configuration
export const PDF_CONFIG = {
  pageWidth: 210, // A4 width in mm
  pageHeight: 297, // A4 height in mm
  margin: 12,
  headerHeight: 22,
  fontSize: {
    title: 16,
    subtitle: 12,
    heading: 10,
    body: 8,
    small: 7,
  },
  lineHeight: {
    heading: 6,
    body: 4,
    small: 3,
  },
};

// Create a styled PDF document with TKC71 branding and logo
export function createStyledPDF(title: string, subtitle?: string, logoBase64?: string): { doc: jsPDF; startY: number } {
  const doc = new jsPDF('p', 'mm', 'a4');
  const { pageWidth, margin, headerHeight } = PDF_CONFIG;

  // Header background with gradient effect (yellow bar)
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageWidth, headerHeight + 8, 'F');
  
  // Accent line at bottom of header
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(0, headerHeight + 6, pageWidth, 2, 'F');

  // Add logo centered at top if provided
  if (logoBase64) {
    const logoSize = 20;
    const logoX = (pageWidth - logoSize) / 2;
    doc.addImage(logoBase64, 'PNG', logoX, 3, logoSize, logoSize);
  }

  // Title text (left side)
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFontSize(PDF_CONFIG.fontSize.title);
  doc.setFont('helvetica', 'bold');
  doc.text('TKC71 Hirschlanden', margin, 12);

  // Subtitle / Session name
  doc.setFontSize(PDF_CONFIG.fontSize.subtitle);
  doc.setFont('helvetica', 'normal');
  doc.text(title, margin, 20);

  // Right-aligned date if provided
  if (subtitle) {
    doc.setFontSize(PDF_CONFIG.fontSize.body);
    doc.text(subtitle, pageWidth - margin, 20, { align: 'right' });
  }

  // Reset text color for content
  doc.setTextColor(...PDF_COLORS.text);

  return { doc, startY: headerHeight + 16 };
}

// Load logo as base64 for PDF embedding
export async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch('/images/tkc71-logo.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Draw a section header with accent styling
export function drawSectionHeader(doc: jsPDF, text: string, y: number): number {
  const { margin } = PDF_CONFIG;
  
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(margin, y, 3, 6, 'F');
  
  doc.setTextColor(...PDF_COLORS.text);
  doc.setFontSize(PDF_CONFIG.fontSize.heading);
  doc.setFont('helvetica', 'bold');
  doc.text(text, margin + 5, y + 4.5);
  
  return y + 10;
}

// Get autoTable styles matching app design
export function getTableStyles() {
  return {
    styles: {
      fontSize: PDF_CONFIG.fontSize.body,
      cellPadding: 1.5,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
      font: 'helvetica',
      textColor: PDF_COLORS.text,
    },
    headStyles: {
      fillColor: PDF_COLORS.accent,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold' as const,
      halign: 'center' as const,
      fontSize: PDF_CONFIG.fontSize.body,
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.backgroundAlt,
    },
    columnStyles: {
      0: { halign: 'center' as const, cellWidth: 8 }, // Rank column
    },
  };
}

// Get compact table styles for fitting more content
export function getCompactTableStyles() {
  return {
    styles: {
      fontSize: PDF_CONFIG.fontSize.small,
      cellPadding: 1,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.1,
      font: 'helvetica',
      textColor: PDF_COLORS.text,
    },
    headStyles: {
      fillColor: PDF_COLORS.accent,
      textColor: PDF_COLORS.white,
      fontStyle: 'bold' as const,
      halign: 'center' as const,
      fontSize: PDF_CONFIG.fontSize.small,
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.backgroundAlt,
    },
  };
}

// Draw round header for training export
export function drawRoundHeader(doc: jsPDF, roundNumber: number, x: number, y: number, width: number): number {
  // Round label background
  doc.setFillColor(...PDF_COLORS.primary);
  doc.roundedRect(x, y, width, 5, 1, 1, 'F');
  
  // Round text
  doc.setTextColor(...PDF_COLORS.text);
  doc.setFontSize(PDF_CONFIG.fontSize.body);
  doc.setFont('helvetica', 'bold');
  doc.text(`Runde ${roundNumber}`, x + width / 2, y + 3.5, { align: 'center' });
  
  return y + 7;
}

// Format goal difference with sign
export function formatGoalDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// Get rank color for PDF
export function getRankColorPDF(rank: number): [number, number, number] {
  switch (rank) {
    case 1: return PDF_COLORS.gold;
    case 2: return PDF_COLORS.silver;
    case 3: return PDF_COLORS.bronze;
    default: return PDF_COLORS.text;
  }
}
