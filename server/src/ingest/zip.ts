/**
 * CAPWATCH zip handling. The raw zip lives in memory only and is never written
 * to disk: Member.txt carries an SSN column that is dropped at parse and must
 * never be persisted (docs/ARCHITECTURE.md, PII posture). Only exact registry
 * filenames (plus DownLoadDate.txt, the extract's own timestamp) are inflated;
 * everything else in the archive is reported as skipped and never decompressed.
 */
import AdmZip from 'adm-zip'
import { TABLES_BY_FILE } from './tables.js'

export const DOWNLOAD_DATE_FILE = 'DownLoadDate.txt'

export const MAX_ZIP_ENTRIES = 500
export const MAX_ENTRY_BYTES = 120 * 1024 * 1024
export const MAX_TOTAL_BYTES = 600 * 1024 * 1024

export interface ZipExtract {
  /** Registry filename -> file contents. */
  files: Map<string, Buffer>
  /** Entry names present in the zip but not extracted (unregistered). */
  skipped: string[]
}

function defaultAllowedNames(): Set<string> {
  return new Set([...TABLES_BY_FILE.keys(), DOWNLOAD_DATE_FILE])
}

export function extractRegistryFiles(
  zipBuf: Buffer,
  allowedNames: ReadonlySet<string> = defaultAllowedNames(),
): ZipExtract {
  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuf)
  } catch (err) {
    throw new Error(`zip: cannot read archive (${err instanceof Error ? err.message : 'unknown'})`)
  }
  const entries = zip.getEntries().filter(e => !e.isDirectory)
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`zip: ${entries.length} entries exceeds the ${MAX_ZIP_ENTRIES}-entry limit`)
  }

  let declaredTotal = 0
  for (const entry of entries) {
    declaredTotal += entry.header.size
    if (declaredTotal > MAX_TOTAL_BYTES) {
      throw new Error(
        `zip: declared uncompressed size exceeds the ${MAX_TOTAL_BYTES}-byte total limit`,
      )
    }
  }

  const files = new Map<string, Buffer>()
  const skipped: string[] = []
  let inflatedTotal = 0
  for (const entry of entries) {
    const name = entry.entryName
    if (!allowedNames.has(name)) {
      skipped.push(name)
      continue
    }
    if (entry.header.size > MAX_ENTRY_BYTES) {
      throw new Error(`zip: ${name} declares ${entry.header.size} bytes, per-entry limit is ${MAX_ENTRY_BYTES}`)
    }
    const data = entry.getData()
    // The local header can lie about the size; re-check what actually inflated.
    if (data.length > MAX_ENTRY_BYTES) {
      throw new Error(`zip: ${name} inflated past the ${MAX_ENTRY_BYTES}-byte per-entry limit`)
    }
    inflatedTotal += data.length
    if (inflatedTotal > MAX_TOTAL_BYTES) {
      throw new Error(`zip: inflated size exceeds the ${MAX_TOTAL_BYTES}-byte total limit`)
    }
    files.set(name, data)
  }
  return { files, skipped }
}
