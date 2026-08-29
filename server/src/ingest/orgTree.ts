/**
 * Org tree anchoring. A wing-scope extract's Organization.txt is not
 * wing-scoped (the 2026-08 MIWG extract carries 1,452 org rows nationally), so
 * ingest derives an anchor org: the lowest common ancestor, via NextLevel with
 * cycle guards, of all member home ORGIDs, overridable by config.ANCHOR_ORGID.
 * org_closure covers only the anchor subtree (docs/ARCHITECTURE.md, Org tree
 * anchoring).
 */

/**
 * Synthetic node for members whose home orgid is missing from Organization.txt
 * or outside the anchor subtree; they attach here so they stay countable. No
 * organizations row is fabricated for it; the API layer labels it.
 */
export const UNASSIGNED_ORGID = -1

export interface OrgTreeInput {
  orgid: number
  nextLevel: number | null
}

export interface ClosureRow {
  ancestorOrgid: number
  descendantOrgid: number
  depth: number
}

export interface OrgTreeResult {
  anchorOrgid: number
  closureRows: ClosureRow[]
  /** Real orgids in the anchor subtree (excludes UNASSIGNED_ORGID). */
  subtreeOrgids: Set<number>
}

/** Upward chain self -> ... -> root, stopping on a cycle or a missing parent. */
function ancestorChain(orgid: number, parentOf: Map<number, number | null>): number[] {
  const chain: number[] = []
  const seen = new Set<number>()
  let current: number | null = orgid
  while (current !== null && parentOf.has(current) && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    const next: number | null | undefined = parentOf.get(current)
    current = next === undefined || next === current ? null : next
  }
  return chain
}

export function buildOrgClosure(
  orgs: readonly OrgTreeInput[],
  memberHomeOrgids: Iterable<number>,
  anchorOverride?: number,
): OrgTreeResult {
  const parentOf = new Map<number, number | null>()
  for (const o of orgs) {
    if (!parentOf.has(o.orgid)) parentOf.set(o.orgid, o.nextLevel)
  }

  let anchorOrgid: number
  if (anchorOverride !== undefined) {
    if (!parentOf.has(anchorOverride)) {
      throw new Error(`org tree: configured ANCHOR_ORGID ${anchorOverride} is not in Organization.txt`)
    }
    anchorOrgid = anchorOverride
  } else {
    // LCA fold: keep the candidate chain (LCA -> root); for each further home
    // org, walk upward to the first node already on the candidate chain.
    let candidate: number[] | null = null
    let candidateSet = new Set<number>()
    for (const orgid of new Set(memberHomeOrgids)) {
      if (!parentOf.has(orgid)) continue // out-of-extract home org; counts as UNASSIGNED later
      if (candidate === null) {
        candidate = ancestorChain(orgid, parentOf)
        candidateSet = new Set(candidate)
        continue
      }
      const chain = ancestorChain(orgid, parentOf)
      const common = chain.find(id => candidateSet.has(id))
      if (common === undefined) continue // disjoint forest; keep the first tree
      const idx = candidate.indexOf(common)
      if (idx > 0) {
        candidate = candidate.slice(idx)
        candidateSet = new Set(candidate)
      }
    }
    const derived = candidate?.[0]
    if (derived === undefined) {
      throw new Error(
        'org tree: no member home ORGID resolves in Organization.txt; set ANCHOR_ORGID to override',
      )
    }
    anchorOrgid = derived
  }

  const children = new Map<number, number[]>()
  for (const [orgid, parent] of parentOf) {
    if (parent === null || parent === orgid) continue
    const arr = children.get(parent)
    if (arr) arr.push(orgid)
    else children.set(parent, [orgid])
  }

  const closureRows: ClosureRow[] = []
  const subtreeOrgids = new Set<number>()
  // Iterative DFS carrying the ancestor path; visited set guards cycles.
  const stack: { orgid: number; path: number[] }[] = [{ orgid: anchorOrgid, path: [] }]
  while (stack.length > 0) {
    const frame = stack.pop() as { orgid: number; path: number[] }
    if (subtreeOrgids.has(frame.orgid)) continue
    subtreeOrgids.add(frame.orgid)
    closureRows.push({ ancestorOrgid: frame.orgid, descendantOrgid: frame.orgid, depth: 0 })
    for (let i = 0; i < frame.path.length; i++) {
      closureRows.push({
        ancestorOrgid: frame.path[i] as number,
        descendantOrgid: frame.orgid,
        depth: frame.path.length - i,
      })
    }
    const childPath = [...frame.path, frame.orgid]
    for (const child of children.get(frame.orgid) ?? []) {
      if (!subtreeOrgids.has(child)) stack.push({ orgid: child, path: childPath })
    }
  }

  // Attach the synthetic unassigned node under the anchor so out-of-tree
  // members remain countable in anchor-scoped closure joins.
  closureRows.push({ ancestorOrgid: UNASSIGNED_ORGID, descendantOrgid: UNASSIGNED_ORGID, depth: 0 })
  closureRows.push({ ancestorOrgid: anchorOrgid, descendantOrgid: UNASSIGNED_ORGID, depth: 1 })

  return { anchorOrgid, closureRows, subtreeOrgids }
}
