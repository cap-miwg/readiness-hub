import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileDown,
  Image,
  Mail,
  Network,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import clsx from 'clsx'
import type { OrgChartResponse, MemberProfileResponse, OrgTreeNode } from '@shared/contracts'

type OrgChartNode = NonNullable<OrgChartResponse['orgchart']>
import { ApiError, apiFetch, useOrgs } from '../api/client'
import { useFlagParam, useOrgScope } from '../lib/urlState'
import { Badge, Banner, EmptyState, Modal, PageHeader, Spinner } from '../components/ui'
import { downloadDataUrl } from '../features/reports/download'
import { loadPdfLibs } from '../features/reports/exportPdf'
import { slugify } from '../features/reports/format'

/*
 * Org Chart (V2-DESIGN-PLAN.md section 6): the tree stays for desktop and
 * export, drawn in ink boxes with hairline connectors; below the large
 * breakpoint a collapsible position list replaces the canvas. Vacancy is a
 * neutral bordered chip (a vacancy is a fact, not a verdict); command-chain
 * emphasis comes from type weight, never color.
 */

const QUIET_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted disabled:opacity-50'

// Command chain node ids (v1 ComponentsOrgNode.html:18-22, adapted to the v2
// compute ids where the root is 'commander' rather than 'root').
const COMMAND_CHAIN_IDS: ReadonlySet<string> = new Set([
  'root',
  'commander',
  'deputy',
  'cds',
  'cdc',
  'ccmdr',
  'c_dep_ops',
  'c_dep_sup',
  'c_first',
  'flight_cmdr',
  'flight_sgt',
])

function collectNodeIds(node: OrgChartNode, out: string[] = []): string[] {
  out.push(node.id)
  for (const child of node.children) collectNodeIds(child, out)
  return out
}

function findOrgName(node: OrgTreeNode, orgid: number): string | null {
  if (node.orgid === orgid) return node.name
  for (const child of node.children) {
    const found = findOrgName(child, orgid)
    if (found !== null) return found
  }
  return null
}

function visibleChildrenOf(
  node: OrgChartNode,
  hideVacant: boolean,
  commandChainOnly: boolean,
): OrgChartNode[] {
  let children = node.children
  if (hideVacant) children = children.filter(c => !c.vacant)
  if (commandChainOnly) children = children.filter(c => COMMAND_CHAIN_IDS.has(c.id))
  return children
}

interface FlatChartRow {
  depth: number
  title: string
  chain: string
  members: string
  status: string
}

function flattenChart(
  node: OrgChartNode,
  hideVacant: boolean,
  commandChainOnly: boolean,
  depth = 0,
  out: FlatChartRow[] = [],
): FlatChartRow[] {
  out.push({
    depth,
    title: node.title,
    chain: node.type === 'cadet' ? 'Cadet' : 'Senior',
    members: node.members.map(m => m.display).join('\n'),
    status: node.members.length > 0 ? 'Filled' : 'Vacant',
  })
  for (const child of visibleChildrenOf(node, hideVacant, commandChainOnly)) {
    flattenChart(child, hideVacant, commandChainOnly, depth + 1, out)
  }
  return out
}

async function exportChartPdf(
  root: OrgChartNode,
  orgName: string,
  descendants: boolean,
  hideVacant: boolean,
  commandChainOnly: boolean,
): Promise<void> {
  const rows = flattenChart(root, hideVacant, commandChainOnly)
  const { jsPDF, autoTable } = await loadPdfLibs()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 15
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Organizational Chart', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Unit: ${orgName}${descendants ? ' (including sub-units)' : ''}`, 15, y)
  y += 5
  const filters: string[] = []
  if (hideVacant) filters.push('vacant positions hidden')
  if (commandChainOnly) filters.push('command chain only')
  doc.text(`Filters: ${filters.length > 0 ? filters.join(', ') : 'none'}`, 15, y)
  y += 5
  doc.text(`Generated: ${new Date().toLocaleString()}`, 15, y)
  autoTable(doc, {
    startY: y + 8,
    head: [['Position', 'Chain', 'Members', 'Status']],
    body: rows.map(r => [' '.repeat(r.depth * 3) + r.title, r.chain, r.members, r.status]),
    styles: { fontSize: 8, cellPadding: 2 },
    // Symbol Blue #001871, the one chromatic voice (design plan section 3).
    headStyles: { fillColor: [0, 24, 113], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    margin: { left: 15, right: 15 },
    theme: 'grid',
  })
  doc.save(`${slugify(orgName)}-org-chart-${new Date().toISOString().slice(0, 10)}.pdf`)
}

/** Vacancy is a fact, not a verdict: a quiet bordered chip, no color. */
function VacantChip() {
  return (
    <span className="inline-flex items-center self-center rounded border border-hairline px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
      Vacant
    </span>
  )
}

function ChartNode({
  node,
  hideVacant,
  commandChainOnly,
  expanded,
  onToggle,
  onMemberClick,
}: {
  node: OrgChartNode
  hideVacant: boolean
  commandChainOnly: boolean
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onMemberClick: (capid: number) => void
}) {
  const children = visibleChildrenOf(node, hideVacant, commandChainOnly)
  const hasChildren = children.length > 0
  const isCollapsed = !expanded.has(node.id)
  // Command-chain emphasis via weight, never color (approved page grammar).
  const isChain = COMMAND_CHAIN_IDS.has(node.id)

  return (
    <div className="mx-2 my-1 flex flex-col items-center">
      <div
        data-testid={`orgchart-node-${node.id}`}
        className="relative z-10 mb-3 w-56 rounded-md border border-hairline bg-paper"
      >
        <div
          className="flex items-center justify-center gap-1 border-b border-hairline px-3 py-2 text-center"
          title={node.title}
        >
          <span
            className={clsx(
              'kicker flex-1 whitespace-normal text-center leading-tight',
              isChain ? 'font-bold text-ink' : 'text-ink2',
            )}
          >
            {node.title}
          </span>
          {hasChildren && (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="rounded px-1.5 py-0.5 text-muted transition-colors hover:bg-gray20 hover:text-ink"
              title={isCollapsed ? 'Expand' : 'Collapse'}
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronUp className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}
        </div>
        <div className="flex min-h-[40px] flex-col justify-center p-2">
          {node.members.length > 0 ? (
            node.members.map((m, i) => {
              const capid = m.capid
              return capid !== null ? (
                <button
                  key={`${capid}-${i}`}
                  type="button"
                  data-testid={`orgchart-member-${capid}`}
                  onClick={() => onMemberClick(capid)}
                  className="cursor-pointer rounded border-b border-hairline px-1 py-1 text-left text-xs font-medium text-ink transition-colors last:border-0 hover:bg-gray20"
                  title="View profile"
                >
                  {m.display}
                </button>
              ) : (
                <div
                  key={`synthetic-${i}`}
                  className="border-b border-hairline px-1 py-1 text-xs font-medium text-ink last:border-0"
                >
                  {m.display}
                </div>
              )
            })
          ) : (
            <div className="flex justify-center">
              <VacantChip />
            </div>
          )}
        </div>
      </div>

      {hasChildren && !isCollapsed && (
        <div className="relative flex w-full flex-col items-center">
          <div className="h-4 w-px bg-hairline" />
          <div className="relative flex items-start justify-center gap-2">
            {children.length > 1 && (
              <div className="absolute left-0 right-0 top-0 h-px w-full bg-hairline" />
            )}
            {children.map(child => (
              <div key={child.id} className="relative flex flex-col items-center">
                {children.length > 1 && <div className="h-4 w-px bg-hairline" />}
                <ChartNode
                  node={child}
                  hideVacant={hideVacant}
                  commandChainOnly={commandChainOnly}
                  expanded={expanded}
                  onToggle={onToggle}
                  onMemberClick={onMemberClick}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Below-lg position list (the collapsed-section pattern from Unit Overview) ---

interface PositionRowData {
  node: OrgChartNode
  depth: number
}

function flattenVisible(
  node: OrgChartNode,
  hideVacant: boolean,
  commandChainOnly: boolean,
  depth = 0,
  out: PositionRowData[] = [],
): PositionRowData[] {
  out.push({ node, depth })
  for (const child of visibleChildrenOf(node, hideVacant, commandChainOnly)) {
    flattenVisible(child, hideVacant, commandChainOnly, depth + 1, out)
  }
  return out
}

function PositionMembers({
  node,
  onMemberClick,
}: {
  node: OrgChartNode
  onMemberClick: (capid: number) => void
}) {
  if (node.members.length === 0) return <VacantChip />
  return (
    <div className="flex flex-col items-start">
      {node.members.map((m, i) =>
        m.capid !== null ? (
          <button
            key={`${m.capid}-${i}`}
            type="button"
            data-testid={`orgchart-list-member-${m.capid}`}
            onClick={() => onMemberClick(m.capid as number)}
            className="py-0.5 text-left text-sm text-ink underline-offset-2 hover:underline"
            title="View profile"
          >
            {m.display}
          </button>
        ) : (
          <span key={`synthetic-${i}`} className="py-0.5 text-sm text-ink">
            {m.display}
          </span>
        ),
      )}
    </div>
  )
}

function PositionGroup({
  node,
  hideVacant,
  commandChainOnly,
  onMemberClick,
}: {
  node: OrgChartNode
  hideVacant: boolean
  commandChainOnly: boolean
  onMemberClick: (capid: number) => void
}) {
  const [open, setOpen] = useState(false)
  const rows = useMemo(
    () => flattenVisible(node, hideVacant, commandChainOnly),
    [node, hideVacant, commandChainOnly],
  )
  const vacant = rows.filter(r => r.node.members.length === 0).length
  const bodyId = `orgchart-group-${node.id}`

  return (
    <section className="border-t border-hairline">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid={`orgchart-group-toggle-${node.id}`}
        className="flex w-full items-center gap-3 py-3.5 text-left"
      >
        <ChevronRight
          aria-hidden
          className={clsx('h-3.5 w-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
        />
        <span className="min-w-0 flex-1 font-display text-[15px] font-semibold text-ink">
          {node.title}
        </span>
        <span className="tnum shrink-0 text-[13px] text-ink">
          {rows.length} {rows.length === 1 ? 'position' : 'positions'}
          {vacant > 0 && <span className="text-ink2"> · {vacant} vacant</span>}
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="pb-4">
        {rows.map(({ node: n, depth }) => (
          <div
            key={n.id}
            className="border-t border-hairline py-2"
            style={{ marginLeft: depth * 16 }}
          >
            <div className="kicker text-ink">{n.title}</div>
            <div className="mt-1">
              <PositionMembers node={n} onMemberClick={onMemberClick} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MobilePositionList({
  root,
  hideVacant,
  commandChainOnly,
  onMemberClick,
}: {
  root: OrgChartNode
  hideVacant: boolean
  commandChainOnly: boolean
  onMemberClick: (capid: number) => void
}) {
  const groups = visibleChildrenOf(root, hideVacant, commandChainOnly)
  return (
    <div data-testid="orgchart-mobile-list" className="lg:hidden">
      <div className="border-t border-hairline py-3.5">
        <div className="kicker text-ink">{root.title}</div>
        <div className="mt-1">
          <PositionMembers node={root} onMemberClick={onMemberClick} />
        </div>
      </div>
      {groups.map(child => (
        <PositionGroup
          key={child.id}
          node={child}
          hideVacant={hideVacant}
          commandChainOnly={commandChainOnly}
          onMemberClick={onMemberClick}
        />
      ))}
      {groups.length === 0 && (
        <p className="border-t border-hairline py-3 text-sm text-ink2">
          No subordinate positions in view with the current filters.
        </p>
      )}
    </div>
  )
}

// --- Member profile modal ---

function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="kicker text-ink">{label}</div>
      <div className="text-sm text-ink">{value ?? <span className="text-muted">n/a</span>}</div>
    </div>
  )
}

const CADET_STATE_TONES: Record<string, 'green' | 'blue' | 'amber' | 'slate' | 'indigo'> = {
  SPAATZ_COMPLETE: 'indigo',
  READY: 'green',
  TIME_PENDING: 'amber',
  NEARLY_READY: 'amber',
  IN_PROGRESS: 'blue',
  NOT_STARTED: 'slate',
}

function MemberProfileModal({
  capid,
  orgNameOf,
  onClose,
}: {
  capid: number | null
  orgNameOf: (orgid: number) => string | null
  onClose: () => void
}) {
  const profileQ = useQuery<MemberProfileResponse, ApiError>({
    queryKey: ['member', capid],
    queryFn: () => apiFetch<MemberProfileResponse>(`/api/members/${capid}`),
    enabled: capid !== null,
    staleTime: 60_000,
  })
  const p = profileQ.data

  return (
    <Modal
      open={capid !== null}
      onClose={onClose}
      size="lg"
      title={
        p ? (
          <span className="flex items-center gap-2">
            {p.rank} {p.fullName}
            <Badge tone="slate">CAPID {p.capid}</Badge>
          </span>
        ) : (
          `Member ${capid ?? ''}`
        )
      }
    >
      {profileQ.isPending && (
        <div className="flex justify-center py-8">
          <Spinner label="Loading member profile..." />
        </div>
      )}
      {profileQ.error && (
        <Banner kind={profileQ.error.status === 404 ? 'warn' : 'error'}>
          {profileQ.error.status === 404
            ? `No computed profile for CAPID ${capid}. The member may be outside the ingested scope or excluded by member-type settings.`
            : `Could not load the member profile (${profileQ.error.status || 'network'}): ${profileQ.error.message}`}
        </Banner>
      )}
      {p && (
        <div className="space-y-4" data-testid="member-profile">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={p.isCadetScope ? 'indigo' : 'blue'}>{p.memberType}</Badge>
            {p.isSeniorScope && p.currentLevel && <Badge tone="blue">Level: {p.currentLevel}</Badge>}
            {p.isCadetScope && p.phase && <Badge tone="indigo">Phase {p.phase}</Badge>}
            {p.promotable && <Badge tone="green">Promotable</Badge>}
            {p.cadetState && (
              <Badge tone={CADET_STATE_TONES[p.cadetState] ?? 'slate'}>
                {p.cadetState.replaceAll('_', ' ')}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ProfileField label="Unit" value={orgNameOf(p.orgid) ?? `Org ${p.orgid}`} />
            <ProfileField label="Joined" value={p.joined} />
            <ProfileField label="Expires" value={p.expiration} />
            <ProfileField label="Rank date" value={p.rankDate} />
            <ProfileField label="Age" value={p.age !== null ? String(p.age) : null} />
            <ProfileField
              label="Email"
              value={
                p.email ? (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted" aria-hidden />
                    <span className="break-all">{p.email}</span>
                    {p.doNotContact && <Badge tone="red">do not contact</Badge>}
                  </span>
                ) : null
              }
            />
          </div>

          <div>
            <div className="kicker mb-1 text-ink">Emergency Services</div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">Active {p.esSummary.counts.active}</Badge>
              <Badge tone="blue">Training {p.esSummary.counts.training}</Badge>
              <Badge tone="red">Expired {p.esSummary.counts.expired}</Badge>
              <Badge tone="amber">Expiring soon {p.esExpiringCount}</Badge>
            </div>
          </div>

          {p.restricted && (
            <div className="rounded-md border border-hairline p-3">
              <div className="kicker mb-2 flex items-center gap-1.5 text-ink">
                <ShieldAlert className="h-3.5 w-3.5 text-ink2" aria-hidden /> Restricted (admin
                only)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ProfileField label="Date of birth" value={p.restricted.dob} />
                <ProfileField label="Parent email" value={p.restricted.parentEmail} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function OrgChart() {
  const orgsQ = useOrgs()
  const { scope } = useOrgScope()
  const orgid = scope.orgid ?? orgsQ.data?.anchorOrgid ?? null

  // Hide Vacant defaults ON; the URL flag stores the inverted choice so the
  // default needs no query param.
  const [showVacant, setShowVacant] = useFlagParam('showVacant')
  const hideVacant = !showVacant
  const [commandChainOnly, setCommandChainOnly] = useFlagParam('commandChain')

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [profileCapid, setProfileCapid] = useState<number | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportingPng, setExportingPng] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  const chartQ = useQuery<OrgChartResponse, ApiError>({
    queryKey: ['orgchart', orgid, scope.descendants],
    queryFn: () =>
      apiFetch<OrgChartResponse>(
        `/api/orgs/${orgid}/orgchart${scope.descendants ? '?descendants=1' : ''}`,
      ),
    enabled: orgid !== null,
    staleTime: 60_000,
  })

  const root = chartQ.data?.orgchart ?? null
  const allIds = useMemo(() => (root ? collectNodeIds(root) : []), [root])

  useEffect(() => {
    setExpanded(new Set(allIds))
  }, [allIds])

  const orgName = useMemo(() => {
    if (orgid === null || !orgsQ.data) return null
    return findOrgName(orgsQ.data.tree, orgid)
  }, [orgsQ.data, orgid])
  const displayOrgName = orgName ?? (orgid !== null ? `Org ${orgid}` : 'Unit')

  const fullyExpanded = allIds.length > 0 && expanded.size >= allIds.length
  const toggleNode = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleExpandAll = () => {
    setExpanded(fullyExpanded ? new Set() : new Set(allIds))
  }

  const onExportPng = async () => {
    const el = canvasRef.current
    if (!el) return
    setExportError(null)
    setExportingPng(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
      })
      downloadDataUrl(
        canvas.toDataURL('image/png'),
        `${slugify(displayOrgName)}-org-chart-${new Date().toISOString().slice(0, 10)}.png`,
      )
    } catch (err) {
      setExportError(
        `PNG export failed: ${err instanceof Error ? err.message : String(err)}. Try the PDF export instead.`,
      )
    } finally {
      setExportingPng(false)
    }
  }

  const allInViewVacant = root !== null && hideVacant && root.vacant

  return (
    <div className="space-y-4">
      <PageHeader
        title="Org Chart"
        subtitle={`Duty position chart for ${displayOrgName}${scope.descendants ? ' including sub-units' : ''}`}
      />

      <div className="flex flex-col gap-3 border-y border-hairline py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-ink2" aria-hidden />
          <h2 className="kicker whitespace-nowrap text-ink">Organizational Chart</h2>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:gap-3 lg:justify-end">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              data-testid="orgchart-toggle-hide-vacant"
              checked={hideVacant}
              onChange={e => setShowVacant(!e.target.checked)}
              className="rounded accent-symbol"
            />
            <span>Hide Vacant Positions</span>
          </label>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              data-testid="orgchart-toggle-command-chain"
              checked={commandChainOnly}
              onChange={e => setCommandChainOnly(e.target.checked)}
              className="rounded accent-symbol"
            />
            <span>Command Chain Only</span>
          </label>
          <button
            type="button"
            data-testid="orgchart-expand-all"
            onClick={toggleExpandAll}
            disabled={root === null}
            className={clsx(QUIET_BUTTON, 'hidden lg:inline-flex')}
          >
            {fullyExpanded ? (
              <ChevronUp className="h-3 w-3" aria-hidden />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden />
            )}
            {fullyExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          <div className="hidden h-6 w-px bg-hairline lg:block" aria-hidden />
          <button
            type="button"
            data-testid="orgchart-export-png"
            onClick={() => void onExportPng()}
            disabled={root === null || exportingPng}
            className={clsx(QUIET_BUTTON, 'hidden lg:inline-flex')}
          >
            {exportingPng ? <Spinner /> : <Image className="h-4 w-4" aria-hidden />} PNG
          </button>
          <button
            type="button"
            data-testid="orgchart-export-pdf"
            onClick={() => {
              if (root) {
                void exportChartPdf(
                  root,
                  displayOrgName,
                  scope.descendants,
                  hideVacant,
                  commandChainOnly,
                )
              }
            }}
            disabled={root === null}
            className={QUIET_BUTTON}
          >
            <FileDown className="h-4 w-4" aria-hidden /> PDF
          </button>
        </div>
      </div>

      {exportError && <Banner kind="error">{exportError}</Banner>}

      {chartQ.isPending && orgid !== null && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading org chart..." />
        </div>
      )}

      {orgid === null && orgsQ.isPending && (
        <div className="flex justify-center py-16">
          <Spinner label="Resolving unit scope..." />
        </div>
      )}

      {orgid === null && orgsQ.error && (
        <Banner kind="error">
          Could not resolve the unit scope from /api/orgs ({orgsQ.error.status || 'network'}):{' '}
          {orgsQ.error.message}
        </Banner>
      )}

      {chartQ.error && (
        <Banner
          kind="error"
          action={
            <button type="button" onClick={() => void chartQ.refetch()} className={QUIET_BUTTON}>
              <RefreshCw className="h-3 w-3" aria-hidden /> Retry
            </button>
          }
        >
          Could not load the org chart ({chartQ.error.status || 'network'}): {chartQ.error.message}
        </Banner>
      )}

      {chartQ.data && root === null && (
        <EmptyState
          icon={Network}
          title="No organization data available"
          message="The server returned no org chart for this scope."
          diagnostic={`GET /api/orgs/${orgid}/orgchart descendants=${scope.descendants ? '1' : '0'} returned orgchart: null`}
        />
      )}

      {root && allInViewVacant && (
        <EmptyState
          icon={Check}
          title="Every position in view is vacant"
          message="Uncheck Hide Vacant Positions to see the position structure."
          diagnostic={`root node '${root.id}' is vacant with hideVacant=1`}
        />
      )}

      {root && !allInViewVacant && (
        <>
          <div
            ref={canvasRef}
            data-testid="orgchart-canvas"
            className="hidden min-h-[400px] overflow-auto border-t border-hairline bg-paper px-3 pb-6 pt-6 sm:min-h-[600px] sm:px-6 sm:pb-10 sm:pt-10 lg:block lg:px-10"
          >
            <div className="inline-block min-w-full">
              <div className="flex flex-col items-center">
                <ChartNode
                  node={root}
                  hideVacant={hideVacant}
                  commandChainOnly={commandChainOnly}
                  expanded={expanded}
                  onToggle={toggleNode}
                  onMemberClick={setProfileCapid}
                />
              </div>
            </div>
          </div>

          <MobilePositionList
            root={root}
            hideVacant={hideVacant}
            commandChainOnly={commandChainOnly}
            onMemberClick={setProfileCapid}
          />
        </>
      )}

      <MemberProfileModal
        capid={profileCapid}
        orgNameOf={id => (orgsQ.data ? findOrgName(orgsQ.data.tree, id) : null)}
        onClose={() => setProfileCapid(null)}
      />
    </div>
  )
}
