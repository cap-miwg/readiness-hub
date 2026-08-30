import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  Clock,
  FileText,
  GraduationCap,
  List,
  Plane,
  RefreshCw,
  Shield,
  ShieldCheck,
  Stamp,
  Target,
  Tent,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

// Icon names served by ReportMeta.icon (server reports/catalog.ts, v1 parity
// with Index.html:4274-4455 reportCatalog, plus the module-roadmap additions:
// CalendarCheck for expiring-quals windows, UserMinus for the transfers
// ledger). Unknown names fall back to FileText. All report icons render
// monochrome ink: ReportMeta.accent is served for v1 parity and deliberately
// ignored, because category is never a color (V2-DESIGN-PLAN.md section 3).
const REPORT_ICONS: Record<string, LucideIcon> = {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  Clock,
  FileText,
  GraduationCap,
  List,
  Plane,
  RefreshCw,
  Shield,
  ShieldCheck,
  Stamp,
  Target,
  Tent,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
}

export function reportIcon(name: string): LucideIcon {
  return REPORT_ICONS[name] ?? FileText
}

export function formatTagLabel(tag: string): string {
  return tag
    .split(' ')
    .map(w => (w === '&' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Render one report cell value as display text (rows are Record<string, unknown>). */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(formatCell).filter(s => s !== '').join('; ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
