import type { ReportMeta, ReportResult } from '@shared/reportContracts'
import { formatExtractDay } from '../../components/dates'
import { downloadBlob } from './download'
import { formatCell, slugify } from './format'

/** Excel needs a BOM to open UTF-8 CSVs with the right encoding. */
const BOM = '﻿'

/**
 * OWASP CSV-injection guidance: a cell starting with = + - @ tab or CR is
 * treated as a formula by Excel/Sheets, so member-supplied text (names,
 * remarks) could execute on an operator's machine. A leading single quote
 * makes Excel render the cell as literal text.
 */
function neutralizeFormula(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
}

function csvEscape(raw: string): string {
  const cell = neutralizeFormula(raw)
  if (/[",\r\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
  return cell
}

/**
 * Provenance preamble ("As of" is reserved for extract dates): the day the
 * CAPWATCH extract was built, then the day the file left the app.
 */
export function csvPreamble(result: ReportResult, exportedAtIso: string): string {
  const exported = formatExtractDay(exportedAtIso)
  if (result.extractDate == null) return `# Extract date unknown, exported ${exported}`
  return `# Data as of ${formatExtractDay(result.extractDate)}, exported ${exported}`
}

export function buildReportCsv(
  result: ReportResult,
  exportedAtIso: string = new Date().toISOString(),
): string {
  const lines: string[] = []
  lines.push(csvPreamble(result, exportedAtIso))
  lines.push(result.columns.map(c => csvEscape(c.header)).join(','))
  for (const row of result.rows) {
    lines.push(result.columns.map(c => csvEscape(formatCell(row[c.key]))).join(','))
  }
  return BOM + lines.join('\r\n') + '\r\n'
}

export function exportReportCsv(meta: ReportMeta, result: ReportResult): void {
  const date = result.generatedAt.slice(0, 10)
  const filename = `${slugify(result.scope.orgName)}-${slugify(meta.title)}-${date}.csv`
  downloadBlob(new Blob([buildReportCsv(result)], { type: 'text/csv;charset=utf-8' }), filename)
}
