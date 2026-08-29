import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
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
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

// Icon names served by ReportMeta.icon (server reports/catalog.ts, v1 parity
// with Index.html:4274-4455 reportCatalog). Unknown names fall back to FileText.
const REPORT_ICONS: Record<string, LucideIcon> = {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
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
  UserPlus,
  Users,
}

export function reportIcon(name: string): LucideIcon {
  return REPORT_ICONS[name] ?? FileText
}

interface AccentClasses {
  iconBox: string
  chip: string
}

// Full literal class strings per accent: Tailwind's scanner cannot see
// dynamically assembled class names.
const ACCENTS: Record<string, AccentClasses> = {
  blue: { iconBox: 'bg-blue-100 text-blue-700', chip: 'bg-blue-100 text-blue-800' },
  amber: { iconBox: 'bg-amber-100 text-amber-700', chip: 'bg-amber-100 text-amber-800' },
  green: { iconBox: 'bg-green-100 text-green-700', chip: 'bg-green-100 text-green-800' },
  emerald: { iconBox: 'bg-emerald-100 text-emerald-700', chip: 'bg-emerald-100 text-emerald-800' },
  purple: { iconBox: 'bg-purple-100 text-purple-700', chip: 'bg-purple-100 text-purple-800' },
}

const DEFAULT_ACCENT: AccentClasses = {
  iconBox: 'bg-slate-100 text-slate-600',
  chip: 'bg-slate-100 text-slate-700',
}

export function reportAccent(accent: string): AccentClasses {
  return ACCENTS[accent] ?? DEFAULT_ACCENT
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
