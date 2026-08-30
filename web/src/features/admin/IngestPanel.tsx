import { useState } from 'react'
import { CloudDownload, FileArchive, FileSpreadsheet, Upload } from 'lucide-react'
import type { IngestResponse } from '@shared/contracts'
import type { ApiError } from '../../api/client'
import {
  Badge,
  Banner,
  Card,
  DataTable,
  ProgressBar,
  Spinner,
  VerdictMark,
  type Column,
} from '../../components/ui'
import { useFetchNow, useUploadAdoption, useUploadZip } from './adminApi'

const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md bg-symbol px-4 py-2 text-sm font-semibold text-paper transition-colors disabled:opacity-50'
const FILE_INPUT =
  'block w-full text-sm text-ink2 file:mr-3 file:rounded-md file:border-0 file:bg-gray20 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-symbol-20'

const FILE_COLUMNS: Column<IngestResponse['fileStats'][number]>[] = [
  { key: 'file', header: 'File', render: r => <span className="font-mono text-xs">{r.file}</span> },
  { key: 'table', header: 'Table', render: r => <span className="font-mono text-xs">{r.table}</span> },
  { key: 'rows', header: 'Rows', numeric: true, render: r => r.rows.toLocaleString(), sortValue: r => r.rows },
  {
    key: 'rejects',
    header: 'Rejects',
    numeric: true,
    render: r =>
      r.rejects > 0 ? <VerdictMark kind="action" label={r.rejects.toLocaleString()} /> : '0',
    sortValue: r => r.rejects,
  },
  {
    key: 'dropped',
    header: 'Dropped columns',
    render: r =>
      r.droppedColumns.length > 0 ? (
        <VerdictMark
          kind="watch"
          label={<span className="font-mono text-xs">{r.droppedColumns.join(', ')}</span>}
        />
      ) : (
        <span className="text-muted">none</span>
      ),
  },
]

export function IngestResultSummary({ result }: { result: IngestResponse }) {
  return (
    <div className="space-y-3" data-testid="ingest-result">
      {result.ok ? (
        <Banner kind="info">
          <span className="flex flex-wrap items-center gap-2">
            Ingest run {result.runId ?? '?'} succeeded.
            {result.downloadDate && <Badge tone="blue">extract {result.downloadDate.slice(0, 10)}</Badge>}
            {result.anchorOrgid !== null && <Badge tone="slate">anchor org {result.anchorOrgid}</Badge>}
          </span>
        </Banner>
      ) : (
        <Banner kind="error">
          Ingest run {result.runId ?? '(no run recorded)'} failed:{' '}
          {result.error ?? 'no error message returned'}
        </Banner>
      )}
      {result.fileStats.length > 0 && (
        <DataTable
          columns={FILE_COLUMNS}
          rows={result.fileStats}
          rowKey={r => r.file}
          maxHeight="40vh"
        />
      )}
      {result.skippedEntries.length > 0 && (
        <div className="rounded-md bg-gray20 px-3 py-2 text-xs text-ink2">
          <span className="font-medium text-ink">Skipped zip entries:</span>{' '}
          {result.skippedEntries.join(', ')}
        </div>
      )}
    </div>
  )
}

function errorText(err: ApiError): string {
  return `${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`
}

export default function IngestPanel({ devAuth }: { devAuth: boolean }) {
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [force, setForce] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)

  const [statsFile, setStatsFile] = useState<File | null>(null)
  const [usersFile, setUsersFile] = useState<File | null>(null)
  const [adoptionProgress, setAdoptionProgress] = useState(0)

  const upload = useUploadZip()
  const fetchNow = useFetchNow()
  const adoption = useUploadAdoption()

  const anyRunning = upload.isPending || fetchNow.isPending || adoption.isPending

  const onUploadZip = () => {
    if (!zipFile) return
    setZipProgress(0)
    upload.mutate({ file: zipFile, force, onProgress: setZipProgress })
  }

  const onUploadAdoption = () => {
    if (!statsFile && !usersFile) return
    setAdoptionProgress(0)
    adoption.mutate({ stats: statsFile, users: usersFile, onProgress: setAdoptionProgress })
  }

  return (
    <div className="space-y-4">
      {devAuth && (
        <Banner kind="warn">
          AUTH_MODE=dev refuses real-data ingest unless the server sets
          DEV_ALLOW_REAL_INGEST=true. Uploads will return 403 until then.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-ink2" aria-hidden /> CAPWATCH Zip Upload
            </span>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-ink2">
              Upload a CAPWATCH extract zip (up to 250 MB). The dataset swaps in atomically after
              compute succeeds; a failed run leaves the current data untouched.
            </p>
            <input
              type="file"
              accept=".zip,application/zip"
              data-testid="ingest-zip-input"
              onChange={e => setZipFile(e.target.files?.[0] ?? null)}
              className={FILE_INPUT}
            />
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={force}
                onChange={e => setForce(e.target.checked)}
                data-testid="ingest-force-toggle"
                className="rounded accent-symbol"
              />
              Force re-ingest even if this extract's DownLoadDate is not newer
            </label>
            <button
              type="button"
              data-testid="ingest-zip-upload"
              onClick={onUploadZip}
              disabled={!zipFile || anyRunning}
              className={PRIMARY_BUTTON}
            >
              {upload.isPending ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden />}
              {upload.isPending
                ? zipProgress < 100
                  ? `Uploading ${zipProgress}%`
                  : 'Processing on the server...'
                : 'Upload and ingest'}
            </button>
            {upload.isPending && <ProgressBar value={zipProgress} label="Upload progress" />}
            {upload.error && <Banner kind="error">Upload failed. {errorText(upload.error)}</Banner>}
            {upload.data && <IngestResultSummary result={upload.data} />}
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                <CloudDownload className="h-4 w-4 text-ink2" aria-hidden /> eServices Fetch
              </span>
            }
          >
            <div className="space-y-3">
              <p className="text-sm text-ink2">
                Ask the server to download a fresh CAPWATCH extract from eServices with its
                configured credentials, then ingest it. The scheduled daily fetch uses the same
                path.
              </p>
              <button
                type="button"
                data-testid="ingest-fetch-now"
                onClick={() => fetchNow.mutate({ force })}
                disabled={anyRunning}
                className={PRIMARY_BUTTON}
              >
                {fetchNow.isPending ? <Spinner /> : <CloudDownload className="h-4 w-4" aria-hidden />}
                {fetchNow.isPending ? 'Fetching and ingesting...' : 'Fetch now'}
              </button>
              {fetchNow.error && (
                <Banner kind="error">Fetch failed. {errorText(fetchNow.error)}</Banner>
              )}
              {fetchNow.data && <IngestResultSummary result={fetchNow.data} />}
            </div>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-ink2" aria-hidden /> Google Adoption CSVs
              </span>
            }
          >
            <div className="space-y-3">
              <p className="text-sm text-ink2">
                Optional sideload for the Unit Overview adoption section. Upload one or both CSVs.
              </p>
              <label className="kicker block text-ink">
                Stats CSV (GoogleAdoptionStats.csv)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="ingest-adoption-stats-input"
                  onChange={e => setStatsFile(e.target.files?.[0] ?? null)}
                  className={`mt-1 font-sans font-normal normal-case tracking-normal ${FILE_INPUT}`}
                />
              </label>
              <label className="kicker block text-ink">
                Users CSV (GoogleAdoptionUsers.csv)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="ingest-adoption-users-input"
                  onChange={e => setUsersFile(e.target.files?.[0] ?? null)}
                  className={`mt-1 font-sans font-normal normal-case tracking-normal ${FILE_INPUT}`}
                />
              </label>
              <button
                type="button"
                data-testid="ingest-adoption-upload"
                onClick={onUploadAdoption}
                disabled={(!statsFile && !usersFile) || anyRunning}
                className={PRIMARY_BUTTON}
              >
                {adoption.isPending ? <Spinner /> : <Upload className="h-4 w-4" aria-hidden />}
                {adoption.isPending ? `Uploading ${adoptionProgress}%` : 'Upload adoption data'}
              </button>
              {adoption.isPending && <ProgressBar value={adoptionProgress} label="Upload progress" />}
              {adoption.error && (
                <Banner kind="error">Adoption upload failed. {errorText(adoption.error)}</Banner>
              )}
              {adoption.data && <IngestResultSummary result={adoption.data} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
