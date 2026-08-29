import { useState } from 'react'
import {
  CheckCircle2,
  CloudDownload,
  FileArchive,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react'
import type { IngestResponse } from '@shared/contracts'
import type { ApiError } from '../../api/client'
import { Badge, Banner, Card, DataTable, ProgressBar, Spinner, type Column } from '../../components/ui'
import { useFetchNow, useUploadAdoption, useUploadZip } from './adminApi'

const FILE_COLUMNS: Column<IngestResponse['fileStats'][number]>[] = [
  { key: 'file', header: 'File', render: r => <span className="font-mono text-xs">{r.file}</span> },
  { key: 'table', header: 'Table', render: r => <span className="font-mono text-xs">{r.table}</span> },
  { key: 'rows', header: 'Rows', align: 'right', render: r => r.rows.toLocaleString(), sortValue: r => r.rows },
  {
    key: 'rejects',
    header: 'Rejects',
    align: 'right',
    render: r =>
      r.rejects > 0 ? <span className="font-semibold text-red-700">{r.rejects}</span> : '0',
    sortValue: r => r.rejects,
  },
  {
    key: 'dropped',
    header: 'Dropped columns',
    render: r =>
      r.droppedColumns.length > 0 ? (
        <span className="font-mono text-xs text-amber-700">{r.droppedColumns.join(', ')}</span>
      ) : (
        <span className="text-slate-400">none</span>
      ),
  },
]

export function IngestResultSummary({ result }: { result: IngestResponse }) {
  return (
    <div className="space-y-3" data-testid="ingest-result">
      {result.ok ? (
        <Banner kind="info">
          <span className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
            Ingest run {result.runId ?? '?'} succeeded.
            {result.downloadDate && <Badge tone="blue">extract {result.downloadDate.slice(0, 10)}</Badge>}
            {result.anchorOrgid !== null && <Badge tone="slate">anchor org {result.anchorOrgid}</Badge>}
          </span>
        </Banner>
      ) : (
        <Banner kind="error">
          <span className="flex flex-wrap items-center gap-2">
            <XCircle className="h-4 w-4" aria-hidden />
            Ingest run {result.runId ?? '(no run recorded)'} failed:{' '}
            {result.error ?? 'no error message returned'}
          </span>
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
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">Skipped zip entries:</span>{' '}
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
              <FileArchive className="h-4 w-4 text-blue-600" aria-hidden /> CAPWATCH Zip Upload
            </span>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Upload a CAPWATCH extract zip (up to 250 MB). The dataset swaps in atomically after
              compute succeeds; a failed run leaves the current data untouched.
            </p>
            <input
              type="file"
              accept=".zip,application/zip"
              data-testid="ingest-zip-input"
              onChange={e => setZipFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={force}
                onChange={e => setForce(e.target.checked)}
                data-testid="ingest-force-toggle"
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              Force re-ingest even if this extract's DownLoadDate is not newer
            </label>
            <button
              type="button"
              data-testid="ingest-zip-upload"
              onClick={onUploadZip}
              disabled={!zipFile || anyRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
                <CloudDownload className="h-4 w-4 text-blue-600" aria-hidden /> eServices Fetch
              </span>
            }
          >
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Ask the server to download a fresh CAPWATCH extract from eServices with its
                configured credentials, then ingest it. The scheduled daily fetch uses the same
                path.
              </p>
              <button
                type="button"
                data-testid="ingest-fetch-now"
                onClick={() => fetchNow.mutate({ force })}
                disabled={anyRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
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
                <FileSpreadsheet className="h-4 w-4 text-blue-600" aria-hidden /> Google Adoption CSVs
              </span>
            }
          >
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Optional sideload for the Unit Overview adoption section. Upload one or both CSVs.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stats CSV (GoogleAdoptionStats.csv)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="ingest-adoption-stats-input"
                  onChange={e => setStatsFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm font-normal normal-case text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Users CSV (GoogleAdoptionUsers.csv)
                <input
                  type="file"
                  accept=".csv,text/csv"
                  data-testid="ingest-adoption-users-input"
                  onChange={e => setUsersFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm font-normal normal-case text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                />
              </label>
              <button
                type="button"
                data-testid="ingest-adoption-upload"
                onClick={onUploadAdoption}
                disabled={(!statsFile && !usersFile) || anyRunning}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
