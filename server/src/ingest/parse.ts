/**
 * CAPWATCH CSV parsing: header-name (never positional) mapping onto the
 * registry allowlist, with schema-driven typed conversion.
 *
 * CAPWATCH members are DOS-CRLF quoted CSV with a header row, named
 * <Table>.txt regardless of being CSV. Dates arrive as M/D/YYYY or MM/DD/YYYY,
 * optionally with a trailing time; 01/01/1900 is CAPWATCH's null sentinel and
 * any date field can carry it (v1 filters it in 40+ sites, centrally at
 * UtilsDateHelpers.html:4).
 */
import { parse } from 'csv-parse/sync'
import { toSnake, type ColumnType, type TableSpec } from './tables.js'

export type CellValue = number | string | boolean | Date | null

export interface ParsedTable {
  file: string
  table: string
  /** Snake-case Postgres column names, in TableSpec declaration order. */
  columns: string[]
  /** Row values aligned to `columns`. */
  rows: CellValue[][]
  dropped: {
    /** Upstream header names present in the file but not allowlisted. */
    columns: string[]
    /** Structurally short/long rows plus cell values that failed typed conversion. */
    rejects: number
  }
}

const DATE_RE =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function matchDate(raw: string): DateParts | null {
  const m = DATE_RE.exec(raw.trim())
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  let hour = m[4] === undefined ? 0 : Number(m[4])
  const minute = m[5] === undefined ? 0 : Number(m[5])
  const second = m[6] === undefined ? 0 : Number(m[6])
  const meridiem = m[7]?.toUpperCase()
  if (meridiem === 'PM' && hour < 12) hour += 12
  if (meridiem === 'AM' && hour === 12) hour = 0
  if (hour > 23 || minute > 59 || second > 59) return null
  return { year, month, day, hour, minute, second }
}

function isSentinel(p: DateParts): boolean {
  return p.year === 1900 && p.month === 1 && p.day === 1
}

/**
 * Date-column value: Date at UTC midnight (time-of-day discarded; the target
 * Postgres type is date), null for empty or the 01/01/1900 sentinel,
 * undefined for an unparseable non-empty value (a reject).
 */
export function parseCapwatchDate(raw: string): Date | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const p = matchDate(trimmed)
  if (!p) return undefined
  if (isSentinel(p)) return null
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

/**
 * Timestamp keeping the time component (for DownLoadDate.txt -> timestamptz).
 * The extract carries no zone indicator; the value is taken as UTC, which is
 * close enough for staleness alerting.
 */
export function parseCapwatchTimestamp(raw: string): Date | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const p = matchDate(trimmed)
  if (!p || isSentinel(p)) return null
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
}

const INT_RE = /^-?\d+$/

/** Typed conversion for one cell. Empty is null, never a reject. */
export function convertCell(
  type: ColumnType,
  raw: string | undefined,
): { value: CellValue; reject: boolean } {
  if (raw === undefined) return { value: null, reject: false }
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null, reject: false }
  switch (type) {
    case 'string':
      return { value: raw, reject: false }
    case 'int': {
      if (!INT_RE.test(trimmed)) return { value: null, reject: true }
      const n = Number(trimmed)
      if (!Number.isSafeInteger(n)) return { value: null, reject: true }
      return { value: n, reject: false }
    }
    case 'bool': {
      const v = trimmed.toLowerCase()
      if (v === 'true' || v === '1') return { value: true, reject: false }
      if (v === 'false' || v === '0') return { value: false, reject: false }
      return { value: null, reject: true }
    }
    case 'date': {
      const d = parseCapwatchDate(trimmed)
      if (d === undefined) return { value: null, reject: true }
      return { value: d, reject: false }
    }
  }
}

/**
 * Parse one registry file. Rows whose field count differs from the header are
 * counted as rejects and skipped (positional trust is broken for them); cell
 * values that fail typed conversion become null and count as rejects while the
 * row is kept. Errors never quote row content (ingest_runs.error is rendered
 * to admins).
 */
export function parseCsvTable(spec: TableSpec, buf: Buffer): ParsedTable {
  let records: string[][]
  try {
    records = parse(buf, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][]
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'CSV_PARSE_ERROR'
    throw new Error(`${spec.file}: CSV parse failed (${code})`)
  }

  const header = records[0]
  if (!header) {
    return {
      file: spec.file,
      table: spec.table,
      columns: Object.keys(spec.columns).map(toSnake),
      rows: [],
      dropped: { columns: [], rejects: 0 },
    }
  }

  const headerNames = header.map(h => h.trim())
  const specHeaders = Object.keys(spec.columns)
  const allowlist = new Set(specHeaders)
  const droppedColumns = headerNames.filter(h => !allowlist.has(h))

  const indexByHeader = new Map<string, number>()
  headerNames.forEach((h, i) => {
    if (!indexByHeader.has(h)) indexByHeader.set(h, i)
  })
  const plan = specHeaders.map(h => ({
    type: spec.columns[h] as ColumnType,
    index: indexByHeader.get(h) ?? -1,
  }))

  const rows: CellValue[][] = []
  let rejects = 0
  for (let r = 1; r < records.length; r++) {
    const record = records[r]
    if (!record) continue
    if (record.length !== headerNames.length) {
      rejects++
      continue
    }
    const row: CellValue[] = new Array(plan.length)
    for (let c = 0; c < plan.length; c++) {
      const p = plan[c] as { type: ColumnType; index: number }
      if (p.index === -1) {
        row[c] = null
        continue
      }
      const { value, reject } = convertCell(p.type, record[p.index])
      if (reject) rejects++
      row[c] = value
    }
    rows.push(row)
  }

  return {
    file: spec.file,
    table: spec.table,
    columns: specHeaders.map(toSnake),
    rows,
    dropped: { columns: droppedColumns, rejects },
  }
}

/** DownLoadDate.txt: a header row and a single quoted timestamp value. */
export function parseDownloadDate(buf: Buffer): Date | null {
  let records: string[][]
  try {
    records = parse(buf, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][]
  } catch {
    return null
  }
  const value = records[1]?.[0]
  if (value === undefined) return null
  return parseCapwatchTimestamp(value)
}
