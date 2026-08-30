/*
 * Pure display helpers for the Home platform page: greeting, date phrases,
 * cron humanizing, and band words. en-GB day-first dates match the approved
 * mockups (docs/design/mockups/quiet-authority/home.html).
 */

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** First name when the display name splits, else the name, else the mailbox. */
export function firstNameOf(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed !== '') return trimmed.split(/\s+/)[0] ?? trimmed
  const local = email.split('@')[0] ?? ''
  return local
}

/** "Friday 29 August 2026" for the greeting kicker. */
export function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function parsed(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "28 August" for the extract kicker phrase. */
export function dayMonthLong(iso: string): string {
  const d = parsed(iso)
  return d === null ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/** "26 Aug" for announcement and qualification dates. */
export function dayMonthShort(iso: string): string {
  const d = parsed(iso)
  return d === null ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "28 August 2026" for the Current extract fact row. */
export function fullDateLong(iso: string): string {
  const d = parsed(iso)
  return d === null
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "29 Aug, 05:12" for the Ingested fact row. */
export function dateTimeShort(iso: string): string {
  const d = parsed(iso)
  return d === null
    ? iso
    : d.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const DOW = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * Humanize the common shapes of a 5-field CAPWATCH_FETCH_CRON expression
 * (MetaResponse.ingestSchedule): daily, weekly on one weekday, monthly on one
 * day. Anything fancier returns null and the caller shows the raw expression.
 */
export function humanizeCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minRaw, hourRaw, dom, mon, dow] = parts
  const minute = Number(minRaw)
  const hour = Number(hourRaw)
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  if (dom === '*' && mon === '*' && dow === '*') return `Daily at ${time}`
  if (dom === '*' && mon === '*' && dow !== undefined && /^[0-7]$/.test(dow)) {
    const day = DOW[Number(dow) % 7]
    return `${day}s at ${time}`
  }
  if (mon === '*' && dow === '*' && dom !== undefined && /^\d{1,2}$/.test(dom)) {
    return `Monthly on day ${Number(dom)} at ${time}`
  }
  return null
}

/**
 * Band words beside score numerals (the grafted Command Ledger convention).
 * Keys are the shared ES readiness / sustainability rating values.
 */
const BAND_WORDS: Readonly<Record<string, string>> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  'needs-attention': 'Needs attention',
}

export function bandWordOf(rating: string | null | undefined): string | undefined {
  if (rating === null || rating === undefined) return undefined
  return BAND_WORDS[rating]
}
