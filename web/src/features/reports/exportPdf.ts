import type { jsPDF } from 'jspdf'
import type { ReportMeta, ReportResult } from '@shared/reportContracts'
import { formatCell, slugify } from './format'

/** Lazy-load the PDF stack so it stays out of the main bundle. */
export async function loadPdfLibs() {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable: autoTableMod.default }
}

// Wide reports forced to landscape regardless of column count
// (v1 Index.html:5831-5849 detectOrientation).
const LANDSCAPE_REPORT_IDS: ReadonlySet<string> = new Set([
  'promotion-requirements',
  'aerospace-education',
  'encampment-status',
  'near-promotion',
  'cac-representatives',
  'promotion',
  'tlc-compliance',
])

export type PdfOrientation = 'portrait' | 'landscape'

export function orientationFor(reportId: string, columnCount: number): PdfOrientation {
  if (LANDSCAPE_REPORT_IDS.has(reportId) || columnCount > 6) return 'landscape'
  return 'portrait'
}

function addHeader(doc: jsPDF, title: string, result: ReportResult): number {
  let y = 15
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const scopeSuffix = result.scope.descendants ? ' (including sub-units)' : ''
  doc.text(`Scope: ${result.scope.orgName}${scopeSuffix}`, 15, y)
  y += 5
  doc.text(`Members in scope: ${result.scope.memberCount}`, 15, y)
  y += 5
  doc.text(`Generated: ${new Date(result.generatedAt).toLocaleString()}`, 15, y)
  return y + 8
}

export async function exportReportPdf(meta: ReportMeta, result: ReportResult): Promise<void> {
  const { jsPDF, autoTable } = await loadPdfLibs()
  const doc = new jsPDF({
    orientation: orientationFor(meta.id, result.columns.length),
    unit: 'mm',
    format: 'a4',
  })
  const startY = addHeader(doc, meta.title, result)

  if (result.rows.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text('No rows for this scope.', 15, startY + 4)
  } else {
    autoTable(doc, {
      startY,
      head: [result.columns.map(c => c.header)],
      body: result.rows.map(row => result.columns.map(c => formatCell(row[c.key]))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 15, right: 15 },
      theme: 'grid',
    })
  }

  const date = result.generatedAt.slice(0, 10)
  doc.save(`${slugify(result.scope.orgName)}-${slugify(meta.title)}-${date}.pdf`)
}
