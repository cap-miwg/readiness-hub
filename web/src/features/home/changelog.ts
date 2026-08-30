import changelogRaw from '../../../../CHANGELOG.md?raw'

/*
 * The What's New panel (V2-DESIGN-PLAN.md section 5): release notes baked
 * from CHANGELOG.md at build time, never fetched. Vite inlines the file via
 * the ?raw import; the parser reads only the latest release block.
 */

export interface ChangelogEntry {
  /** Release version from the `## version` heading ("2.0.0"). */
  version: string
  /** `### area` subheading the entry sits under ("Unit Overview"); '' if none. */
  area: string
  /** One plain-language entry, continuation lines joined. */
  text: string
}

export const CHANGELOG_URL = 'https://github.com/cap-miwg/readiness-hub/blob/main/CHANGELOG.md'

/** Max entries the Home panel shows; the full file is one click away. */
export const WHATS_NEW_CAP = 5

/**
 * Parse the latest `## version` block into entries. Format contract (stated
 * at the top of CHANGELOG.md): one `## version` heading per release, `### area`
 * subheadings, `- ` bullets with indented continuation lines.
 */
export function parseChangelog(md: string, cap: number = WHATS_NEW_CAP): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let version: string | null = null
  let area = ''
  let current: string[] | null = null

  const flush = () => {
    if (version !== null && current !== null && current.length > 0) {
      entries.push({ version, area, text: current.join(' ') })
    }
    current = null
  }

  for (const line of md.split(/\r?\n/)) {
    // `## 2.0.0 (unreleased)` but not `### area` (## must be followed by space).
    const release = /^##\s+(\S+)/.exec(line)
    if (release !== null) {
      flush()
      if (version !== null) break // only the latest release block
      version = release[1] ?? ''
      continue
    }
    if (version === null) continue
    const heading = /^###\s+(.+)$/.exec(line)
    if (heading !== null) {
      flush()
      area = (heading[1] ?? '').trim()
      continue
    }
    const bullet = /^-\s+(.+)$/.exec(line)
    if (bullet !== null) {
      flush()
      current = [(bullet[1] ?? '').trim()]
      continue
    }
    if (current !== null && /^\s+\S/.test(line)) {
      current.push(line.trim())
      continue
    }
    flush()
  }
  flush()
  return entries.slice(0, cap)
}

/** The baked panel content: latest release, capped. */
export const WHATS_NEW: readonly ChangelogEntry[] = parseChangelog(changelogRaw)
