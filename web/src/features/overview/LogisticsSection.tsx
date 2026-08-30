import type { LogisticsResponse, VehicleRow } from '@shared/logisticsContracts'
import {
  DataTable,
  VerdictGlyph,
  VerdictMark,
  type Column,
} from '../../components/ui'
import {
  FactLedger,
  FactRow,
  FiguresStrip,
  fmtDate,
  NotRecordedBody,
  plural,
} from './overviewShared'

/*
 * Logistics as a read-only fact sheet (D8 reversed by owner 2026-08-30):
 * ORMS remains the system of record; this view states facts and marks only
 * what is genuinely actionable (a down vehicle) or watch-worthy (a vehicle
 * unused for 60 days). Everything else is quiet ink.
 */

export interface LogisticsStatus {
  recorded: boolean
  score: string | null
  downCount: number
}

/** Collapsed-header inputs for the Section status slot. */
export function logisticsStatus(l: LogisticsResponse | undefined): LogisticsStatus | null {
  if (l === undefined) return null
  if (!l.recorded) return { recorded: false, score: null, downCount: 0 }
  const v = l.vehicleSummary
  return {
    recorded: true,
    score:
      v.total > 0
        ? `${v.roadable}/${v.total} roadable`
        : `${l.equipmentSummary.total} ${plural(l.equipmentSummary.total, 'asset')}`,
    downCount: v.downCount,
  }
}

function vehicleDescription(v: VehicleRow): string {
  return [v.year, v.make, v.type].filter(p => p !== null && p !== '').join(' ') || 'No description'
}

function RoadableCell({ roadable }: { roadable: boolean | null }) {
  if (roadable === false) return <VerdictMark kind="action" label="Down" />
  if (roadable === true) return <span className="text-ink2">Roadable</span>
  return <span className="text-ink2">Not recorded</span>
}

const vehicleColumns: readonly Column<VehicleRow>[] = [
  {
    key: 'capId',
    header: 'Vehicle',
    render: v => <span className="tnum font-medium text-ink">{v.capId}</span>,
    sortValue: v => v.capId,
  },
  {
    key: 'description',
    header: 'Description',
    render: v => <span className="text-ink2">{vehicleDescription(v)}</span>,
    sortValue: v => vehicleDescription(v),
  },
  {
    key: 'roadable',
    header: 'Status',
    render: v => <RoadableCell roadable={v.roadable} />,
    sortValue: v => (v.roadable === false ? 0 : v.roadable === true ? 1 : 2),
  },
  {
    key: 'lastUsed',
    header: 'Last used',
    render: v => <span className="tnum text-ink2">{fmtDate(v.lastUsedOn)}</span>,
    sortValue: v => (v.lastUsedOn !== null ? new Date(v.lastUsedOn) : null),
  },
  {
    key: 'lastMaint',
    header: 'Last maintained',
    render: v => <span className="tnum text-ink2">{fmtDate(v.lastMaintOn)}</span>,
    sortValue: v => (v.lastMaintOn !== null ? new Date(v.lastMaintOn) : null),
  },
  {
    key: 'miles90',
    header: 'Miles, 90 days',
    numeric: true,
    render: v => <span className="text-ink">{v.miles90.toLocaleString()}</span>,
    sortValue: v => v.miles90,
  },
]

export function LogisticsSection({ logistics }: { logistics: LogisticsResponse }) {
  if (!logistics.recorded) {
    return (
      <div data-testid="logistics-section">
        <NotRecordedBody>
          No vehicles or equipment recorded in ORMS for this scope. Units without recorded assets
          are never penalized here.
        </NotRecordedBody>
      </div>
    )
  }

  const v = logistics.vehicleSummary
  const eq = logistics.equipmentSummary

  return (
    <div className="space-y-6" data-testid="logistics-section">
      {v.total > 0 && (
        <FiguresStrip
          figures={[
            { label: 'Vehicles', value: v.total },
            { label: 'Roadable', value: v.roadable },
            {
              label: 'Down',
              value: (
                <span className="inline-flex items-baseline gap-2.5">
                  {v.downCount > 0 && (
                    <>
                      <VerdictGlyph kind="action" className="self-center" />
                      <span className="sr-only">Alert: </span>
                    </>
                  )}
                  {v.downCount}
                </span>
              ),
            },
            {
              label: 'Unused 60 days',
              value: (
                <span className="inline-flex items-baseline gap-2.5">
                  {v.unusedIn60d > 0 && (
                    <>
                      <VerdictGlyph kind="watch" className="self-center" />
                      <span className="sr-only">Warning: </span>
                    </>
                  )}
                  {v.unusedIn60d}
                </span>
              ),
            },
          ]}
        />
      )}

      {logistics.vehicles.length > 0 && (
        <DataTable
          columns={vehicleColumns}
          rows={logistics.vehicles}
          rowKey={veh => veh.capId}
          mobileCard={veh => (
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="tnum text-sm font-medium text-ink">{veh.capId}</span>
                <RoadableCell roadable={veh.roadable} />
              </div>
              <div className="mt-1 text-xs text-ink2">
                {vehicleDescription(veh)} · last used {fmtDate(veh.lastUsedOn)}
              </div>
            </div>
          )}
        />
      )}

      <FactLedger>
        <FactRow label="Equipment">
          {eq.total > 0
            ? `${eq.total} ${plural(eq.total, 'asset')} on record · ${eq.issuedCount} issued to members`
            : 'None on record'}
        </FactRow>
        {eq.byStatus.length > 0 && (
          <FactRow label="Equipment by status">
            {eq.byStatus
              .map(s => `${s.status !== '' ? s.status : 'Unrecorded'} ${s.count}`)
              .join(' · ')}
          </FactRow>
        )}
        {logistics.property.length > 0 && (
          <FactRow label="Real property">
            {`${logistics.property.length} ${plural(logistics.property.length, 'record')}`}
          </FactRow>
        )}
      </FactLedger>

      {logistics.property.length > 0 && (
        <div>
          <p className="kicker text-ink">Property</p>
          <FactLedger className="mt-1">
            {logistics.property.map((p, i) => (
              <FactRow key={i} label={p.propCode ?? 'No code'}>
                {[p.propType, [p.city, p.state].filter(Boolean).join(', ')]
                  .filter(part => part !== null && part !== '')
                  .join(' · ') || 'No detail recorded'}
              </FactRow>
            ))}
          </FactLedger>
        </div>
      )}

      <p className="max-w-[62ch] text-xs text-ink2">
        Read-only view of ORMS data from the CAPWATCH extract; corrections are made in ORMS and
        arrive with the next ingest.
      </p>
    </div>
  )
}
