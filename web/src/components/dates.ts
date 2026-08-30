/*
 * Extract-date formatters (V2-DESIGN-PLAN.md D10). CAPWATCH extract
 * timestamps name a calendar day at the national server; rendering them in
 * the browser's local zone shifts that day for anyone west of UTC (a
 * 2026-08-28T03:24Z extract reads "27 Aug" in Detroit). Every surface that
 * shows an extract date therefore formats in UTC so the day shown matches
 * the day the extract carries. en-GB puts the day first, matching the
 * approved mockups.
 */

/** "28 Aug" for an ISO timestamp, rendered on the UTC calendar day. */
export function formatExtractDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "28 Aug 2026, 03:24 UTC" for an ISO timestamp, UTC and labeled as such. */
export function formatExtractDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/**
 * "Jul 2026" for a 'yyyy-mm' month key (the logistics lastUsedOn grain).
 * Null renders as the ledger dash; anything unparseable renders verbatim.
 */
export function formatMonthKey(key: string | null): string {
  if (key === null) return '--'
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (m === null) return key
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return key
  const d = new Date(Date.UTC(year, month - 1, 1))
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
