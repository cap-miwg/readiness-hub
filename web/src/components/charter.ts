import type { OrgTreeNode } from '@shared/contracts'

/*
 * Charter number display (V2-DESIGN-PLAN.md section 4, canonical formats):
 * selector rows and chips use the short charter (`MI-104`), page mastheads
 * the full charter (`GLR-MI-104`), exports the full charter. The number is
 * the stable identifier; unit names may truncate, charters never do.
 */

/** Unit numbers display zero-stripped then 3-padded (server normalizeUnit parity). */
export function normalizeUnitDisplay(unit: string): string {
  const stripped = unit.trim().replace(/^0+/, '')
  return (stripped !== '' ? stripped : '0').padStart(3, '0')
}

/**
 * Short charter chip for selector rows and scope chips. OrgTreeNode does not
 * carry the wing prefix yet; when the API adds `wing` to the tree node this
 * upgrades to `MI-104` with no call-site change, until then chips show the
 * padded unit number alone. Empty for the synthetic Unassigned node.
 */
export function charterOf(node: Pick<OrgTreeNode, 'unit'> & { wing?: string }): string {
  if (!node.unit) return ''
  const unit = normalizeUnitDisplay(node.unit)
  return node.wing ? `${node.wing}-${unit}` : unit
}

export interface FlatOrg {
  orgid: number
  name: string
  charter: string
  depth: number
  memberCount: number
}

/** Depth-first flatten of the /api/orgs tree for pickers and reconciliation. */
export function flattenOrgTree(node: OrgTreeNode, depth = 0, out: FlatOrg[] = []): FlatOrg[] {
  out.push({
    orgid: node.orgid,
    name: node.name,
    charter: charterOf(node),
    depth,
    memberCount: node.memberCount,
  })
  for (const child of node.children) flattenOrgTree(child, depth + 1, out)
  return out
}
