/**
 * Scheduled eServices CAPWATCH download. Failure classification drives the
 * scheduler: 'auth' stops retries until credentials change (eServices returns
 * 403 for bad credentials, a lapsed annual CAPWATCH attestation, and a charter
 * number in the ORGID slot alike); 'transient' is retried bounded
 * (docs/ARCHITECTURE.md, Ingest).
 */
import { config } from '../config.js'

export const CAPWATCH_URL = 'https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw'

export const FETCH_TIMEOUT_MS = 10 * 60 * 1000
export const MAX_RESPONSE_BYTES = 250 * 1024 * 1024

export type CapwatchFetchResult =
  | { kind: 'ok'; zip: Buffer }
  | { kind: 'auth'; message: string }
  | { kind: 'transient'; message: string }

const AUTH_HELP =
  'eServices rejected the download (401/403). This means one of: bad ESERVICES_USERNAME/PASSWORD, ' +
  'a lapsed annual CAPWATCH attestation for that account, or a charter number instead of a numeric ' +
  'ORGID in CAPWATCH_ORGID (eServices returns 403 for all three). Fix the configuration; the ' +
  'scheduler will not retry until it changes.'

async function readBodyCapped(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error(`response exceeded the ${MAX_RESPONSE_BYTES}-byte cap`)
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function fetchCapwatchZip(
  fetchImpl: typeof fetch = fetch,
): Promise<CapwatchFetchResult> {
  if (!config.ESERVICES_USERNAME || !config.ESERVICES_PASSWORD || !config.CAPWATCH_ORGID) {
    return {
      kind: 'auth',
      message:
        'CAPWATCH fetch is not configured: ESERVICES_USERNAME, ESERVICES_PASSWORD, and CAPWATCH_ORGID are all required.',
    }
  }
  const url = `${CAPWATCH_URL}?ORGID=${encodeURIComponent(config.CAPWATCH_ORGID)}&unitOnly=0`
  const basic = Buffer.from(
    `${config.ESERVICES_USERNAME}:${config.ESERVICES_PASSWORD}`,
  ).toString('base64')

  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    })
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown'
    return { kind: 'transient', message: `eServices fetch failed (${reason})` }
  }

  if (res.status === 401 || res.status === 403) {
    return { kind: 'auth', message: AUTH_HELP }
  }
  if (!res.ok) {
    return { kind: 'transient', message: `eServices returned HTTP ${res.status}` }
  }

  let zip: Buffer
  try {
    zip = await readBodyCapped(res)
  } catch (err) {
    return {
      kind: 'transient',
      message: `eServices download failed: ${err instanceof Error ? err.message : 'read error'}`,
    }
  }
  if (zip.length === 0) {
    return { kind: 'transient', message: 'eServices returned an empty body' }
  }
  return { kind: 'ok', zip }
}
