import type { ReportMeta, ReportResult } from '@shared/reportContracts'
import { downloadBlob } from './download'
import { formatCell, slugify } from './format'

/** Excel needs a BOM to open UTF-8 CSVs with the right encoding. */
const BOM = '﻿'

function csvEscape(cell: string): string {
  if (/[",\r\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
  return cell
}

export function buildReportCsv(result: ReportResult): string {
  const lines: string[] = []
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
