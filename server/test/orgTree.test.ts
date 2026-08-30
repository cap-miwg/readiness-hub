import { describe, expect, it } from 'vitest'
import {
  buildOrgClosure,
  UNASSIGNED_ORGID,
  type ClosureRow,
  type OrgTreeInput,
} from '../src/ingest/orgTree.js'

// region 1 -> wing 100 -> { group 200 -> { sq 301, sq 302 }, sq 400 }
const orgs: OrgTreeInput[] = [
  { orgid: 1, nextLevel: null },
  { orgid: 100, nextLevel: 1 },
  { orgid: 200, nextLevel: 100 },
  { orgid: 301, nextLevel: 200 },
  { orgid: 302, nextLevel: 200 },
  { orgid: 400, nextLevel: 100 },
]

function row(rows: ClosureRow[], ancestor: number, descendant: number): ClosureRow | undefined {
  return rows.find(r => r.ancestorOrgid === ancestor && r.descendantOrgid === descendant)
}

describe('buildOrgClosure', () => {
  it('anchors at the lowest common ancestor of member home orgids', () => {
    const result = buildOrgClosure(orgs, [301, 302])
    expect(result.anchorOrgid).toBe(200)
    expect(result.subtreeOrgids).toEqual(new Set([200, 301, 302]))
    expect(row(result.closureRows, 200, 200)?.depth).toBe(0)
    expect(row(result.closureRows, 301, 301)?.depth).toBe(0)
    expect(row(result.closureRows, 200, 301)?.depth).toBe(1)
    expect(row(result.closureRows, 200, 302)?.depth).toBe(1)
    expect(row(result.closureRows, 200, 400)).toBeUndefined()
    expect(row(result.closureRows, 100, 200)).toBeUndefined()
  })

  it('widens the anchor when members sit in different branches', () => {
    const result = buildOrgClosure(orgs, [301, 400])
    expect(result.anchorOrgid).toBe(100)
    expect(result.subtreeOrgids).toEqual(new Set([100, 200, 301, 302, 400]))
    expect(row(result.closureRows, 100, 301)?.depth).toBe(2)
    expect(row(result.closureRows, 100, 400)?.depth).toBe(1)
  })

  it('honors the anchor override instead of the derived LCA', () => {
    const result = buildOrgClosure(orgs, [301, 302], 100)
    expect(result.anchorOrgid).toBe(100)
    expect(result.subtreeOrgids.has(400)).toBe(true)
  })

  it('rejects an override orgid that is not in the extract', () => {
    expect(() => buildOrgClosure(orgs, [301], 999)).toThrow(/ANCHOR_ORGID 999/)
  })

  it('terminates on a NextLevel cycle and still emits a closure', () => {
    const cyclic: OrgTreeInput[] = [
      { orgid: 10, nextLevel: 11 },
      { orgid: 11, nextLevel: 10 },
    ]
    const result = buildOrgClosure(cyclic, [10])
    expect(result.anchorOrgid).toBe(10)
    expect(result.subtreeOrgids).toEqual(new Set([10, 11]))
    expect(row(result.closureRows, 10, 11)?.depth).toBe(1)
    expect(row(result.closureRows, 10, 10)?.depth).toBe(0)
  })

  it('attaches the synthetic UNASSIGNED node under the anchor for out-of-tree members', () => {
    expect(UNASSIGNED_ORGID).toBe(-1)
    const result = buildOrgClosure(orgs, [301, 99999])
    expect(result.anchorOrgid).toBe(301) // 99999 does not resolve; it cannot move the LCA
    expect(result.subtreeOrgids.has(99999)).toBe(false)
    expect(result.subtreeOrgids.has(UNASSIGNED_ORGID)).toBe(false)
    expect(row(result.closureRows, UNASSIGNED_ORGID, UNASSIGNED_ORGID)?.depth).toBe(0)
    expect(row(result.closureRows, 301, UNASSIGNED_ORGID)?.depth).toBe(1)
  })

  it('throws with guidance when no member home org resolves at all', () => {
    expect(() => buildOrgClosure(orgs, [99998, 99999])).toThrow(/ANCHOR_ORGID/)
  })
})
