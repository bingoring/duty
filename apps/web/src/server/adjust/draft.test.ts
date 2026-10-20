import type { CellEdit, GridCell } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import {
  applyDraftLeaves,
  beforeOf,
  draftLeaveKeys,
  mergeRerolled,
  staleBefore,
  type DraftLeave,
} from './draft'
import { keptAdminKeys } from './reroll'

// 3-10 8·9: 근무 조정 저장 전 휴가·리롤 결과 합치기
const cell = (
  userId: string,
  date: string,
  code: GridCell['code'],
  extra: Partial<GridCell> = {},
): GridCell => ({
  userId,
  date,
  code,
  checkupHalf: false,
  ...extra,
})
const edit = (userId: string, date: string, after: CellEdit['after']['code']): CellEdit => ({
  userId,
  date,
  before: { code: 'D' },
  after: after === 'OFF' ? { code: 'OFF', offKind: 'regular' } : { code: after },
  kind: 'manual',
})
const leave = (userId: string, type: DraftLeave['type'], startDate: string, endDate: string): DraftLeave => ({
  userId,
  type,
  startDate,
  endDate,
  cells: [{ date: startDate, before: { code: 'D' } }],
})

describe('applyDraftLeaves', () => {
  const cells = [cell('a', '2026-10-01', 'D'), cell('a', '2026-10-02', 'E'), cell('b', '2026-10-01', 'N')]
  it('기간 안 그 사람 칸만 휴가로 바꾼다', () => {
    const out = applyDraftLeaves(cells, [leave('a', 'sick', '2026-10-02', '2026-10-05')])
    expect(out).toEqual([
      cells[0],
      { userId: 'a', date: '2026-10-02', code: 'LEAVE', leaveKind: 'sick', checkupHalf: false },
      cells[2],
    ])
  })
  it('검진은 S + 반차 표시, 특휴는 OFF special', () => {
    const out = applyDraftLeaves(cells, [
      leave('a', 'checkup', '2026-10-01', '2026-10-01'),
      leave('b', 'special', '2026-10-01', '2026-10-01'),
    ])
    expect(out[0]).toMatchObject({ code: 'S', checkupHalf: true })
    expect(out[2]).toMatchObject({ code: 'OFF', offKind: 'special' })
  })
})

describe('mergeRerolled', () => {
  it('이전 편집은 두고, 새 휴가가 덮는 칸의 편집만 빼고, 새 편집을 얹는다', () => {
    const prev = [edit('head', '2026-10-21', 'D'), edit('a', '2026-10-20', 'OFF')]
    const l = leave('a', 'sick', '2026-10-20', '2026-10-20')
    const next = [edit('c', '2026-10-22', 'N')]
    expect(mergeRerolled(prev, l, next)).toEqual([prev[0], next[0]])
    expect(draftLeaveKeys([l])).toEqual(new Set(['a|2026-10-20']))
  })
})

describe('staleBefore (R-ADJ-7)', () => {
  it('본 값과 지금 값이 다르거나 칸이 없으면 걸린다', () => {
    const at = new Map([
      ['a|2026-10-01', { code: 'D', offKind: null, leaveKind: null }],
      ['b|2026-10-01', { code: 'OFF', offKind: 'regular', leaveKind: null }],
    ])
    const items = [
      { userId: 'a', date: '2026-10-01', before: { code: 'D' as const } },
      { userId: 'b', date: '2026-10-01', before: { code: 'OFF' as const, offKind: 'sleeping' as const } },
      { userId: 'c', date: '2026-10-01', before: { code: 'D' as const } },
    ]
    expect(staleBefore(items, at).map((x) => x.userId)).toEqual(['b', 'c'])
    expect(beforeOf({ code: 'LEAVE', offKind: null, leaveKind: 'sick' })).toEqual({
      code: 'LEAVE',
      leaveKind: 'sick',
    })
  })
})

describe('keptAdminKeys (3-10 8)', () => {
  it('저장 전 편집 + from 이후 저장된 관리자 수정 칸', () => {
    const rows = [
      { userId: 'a', date: '2026-10-19', source: 'admin' },
      { userId: 'a', date: '2026-10-20', source: 'admin' },
      { userId: 'b', date: '2026-10-21', source: 'swap' },
      { userId: 'c', date: '2026-10-22', source: 'generated' },
    ]
    expect(keptAdminKeys(rows, [{ userId: 'head', date: '2026-10-25' }], '2026-10-20')).toEqual(
      new Set(['head|2026-10-25', 'a|2026-10-20']),
    )
  })
})
