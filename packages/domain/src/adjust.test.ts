import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  newViolations,
  replacementCandidates,
  swapEdits,
  uncoveredViolations,
  type CellEdit,
} from './adjust'
import { checkSchedule } from './checker'
import { input, nurse, row, rules } from './test-utils'

// 11월 1~3일만 보는 작은 병동: 인원 최소 1명, K-tass 1명
const R = rules({ minStaffPerShift: 1, minKTass: 1 })
const nurses = [nurse('a'), nurse('b'), nurse('c', { kTass: false }), nurse('d')]
function base() {
  return input({
    year: 2026,
    month: 11,
    rules: R,
    nurses,
    cells: [
      ...row('a', '2026-11-01', 'D E O'),
      ...row('b', '2026-11-01', 'E N O'),
      ...row('c', '2026-11-01', 'N O D'),
      ...row('d', '2026-11-01', 'O D E'),
    ],
  })
}
const edit = (userId: string, date: string, code: CellEdit['after']['code'], before = 'D'): CellEdit => ({
  userId,
  date,
  before: { code: before as CellEdit['before']['code'] },
  after: { code },
  kind: 'manual',
})

describe('applyEdits', () => {
  it('편집한 칸만 바꾸고, OFF는 regular, 검진 반차 표시는 유지한다', () => {
    const inp = base()
    inp.cells[0] = { ...inp.cells[0]!, checkupHalf: true }
    const out = applyEdits(inp.cells, [edit('a', '2026-11-01', 'OFF')])
    expect(out.find((c) => c.userId === 'a' && c.date === '2026-11-01')).toEqual({
      userId: 'a',
      date: '2026-11-01',
      code: 'OFF',
      offKind: 'regular',
      checkupHalf: true,
    })
    expect(out).toHaveLength(inp.cells.length)
    expect(out.find((c) => c.userId === 'b' && c.date === '2026-11-01')?.code).toBe('E')
  })

  it('슬리핑오프로 고르면 offKind sleeping', () => {
    const out = applyEdits(base().cells, [
      { ...edit('a', '2026-11-01', 'OFF'), after: { code: 'OFF', offKind: 'sleeping' } },
    ])
    expect(out.find((c) => c.userId === 'a' && c.date === '2026-11-01')?.offKind).toBe('sleeping')
  })
})

describe('newViolations (R-ADJ-4)', () => {
  it('편집으로 새로 생긴 위반만 돌려준다', () => {
    const inp = base()
    const before = checkSchedule(inp)
    // a 11/2 E → D: 11/1 D → 11/2 D 는 문제없지만, 11/2 E 담당이 없어진다
    const after = checkSchedule({ ...inp, cells: applyEdits(inp.cells, [edit('a', '2026-11-02', 'D', 'E')]) })
    const diff = newViolations(before, after)
    expect(diff.hardViolations.map((v) => [v.ruleId, v.dates, v.shift])).toEqual([
      ['H-KTASS', ['2026-11-02'], 'E'],
      ['H-STAFF', ['2026-11-02'], 'E'],
    ])
  })
})

describe('uncoveredViolations (R-ADJ-6)', () => {
  it('예외 편집이 같은 날짜(인원 규칙) 또는 같은 사람·날짜를 가리면 허용', () => {
    const inp = base()
    const edits = [{ ...edit('a', '2026-11-02', 'D', 'E'), override: { reason: '당일 결원' } }]
    const diff = newViolations(
      checkSchedule(inp),
      checkSchedule({ ...inp, cells: applyEdits(inp.cells, edits) }),
    )
    expect(uncoveredViolations(diff.hardViolations, edits)).toEqual([])
    const plain = [edit('a', '2026-11-02', 'D', 'E')]
    expect(uncoveredViolations(diff.hardViolations, plain)).toHaveLength(2)
  })
})

describe('swapEdits (R-ADJ-9)', () => {
  it('같은 날 두 사람의 칸을 바꾸는 편집 2개', () => {
    const inp = base()
    expect(swapEdits(inp.cells, '2026-11-02', 'a', 'c')).toEqual([
      {
        userId: 'a',
        date: '2026-11-02',
        before: { code: 'E' },
        after: { code: 'OFF', offKind: 'regular' },
        kind: 'swap',
      },
      {
        userId: 'c',
        date: '2026-11-02',
        before: { code: 'OFF', offKind: 'regular' },
        after: { code: 'E' },
        kind: 'swap',
      },
    ])
  })
})

describe('replacementCandidates (R-ADJ-10)', () => {
  it('그날 쉬는 교대 근무자, K-tass가 모자라면 K-tass 먼저, 새 필수 위반을 함께 돌려준다', () => {
    const inp = base()
    // a가 11/2 E에서 빠진 상태
    const trial = { ...inp, cells: applyEdits(inp.cells, [edit('a', '2026-11-02', 'OFF', 'E')]) }
    const out = replacementCandidates(trial, '2026-11-02', 'E')
    // 11/2에 쉬는 사람: a(방금 뺌), c. K-tass가 모자라므로 K-tass 보유자 a 먼저
    expect(out.map((c) => c.userId)).toEqual(['a', 'c'])
    expect(out[0]!.kTass).toBe(true)
    // a를 되돌리면 새 위반이 없다
    expect(out[0]!.newHard).toEqual([])
    // c를 E로 넣으면: K-tass 부족은 이미 있던 위반(새 위반 아님), 대신 11/1 N → 11/2 E(N-E)·11/2 E → 11/3 D(E-D)가 새로 생긴다
    expect(out[1]!.edit.after.code).toBe('E')
    expect([...new Set(out[1]!.newHard.map((v) => v.ruleId))].sort()).toEqual(['H-PATTERN', 'H-REST'])
  })

  it('K-tass 부족이 아니면 덜 일한 사람(이달 누적 OFF가 큰 사람) 먼저, 같으면 근무일이 적은 사람 (사용자 결정)', () => {
    // 11/1~4. x·y·z 모두 11/4에 쉼. y는 누적 이월 +2(더 쉼) → 먼저, x·z는 같고 z가 근무일이 적다
    const inp = input({
      year: 2026,
      month: 11,
      rules: rules({ minStaffPerShift: 1, minKTass: 0 }),
      nurses: [nurse('w'), nurse('x'), nurse('y', { offCarryBefore: 2 }), nurse('z')],
      cells: [
        ...row('w', '2026-11-01', 'D D D D'),
        ...row('x', '2026-11-01', 'O D E O'),
        ...row('y', '2026-11-01', 'O D E O'),
        ...row('z', '2026-11-01', 'O O E O'),
      ],
    })
    const out = replacementCandidates(inp, '2026-11-04', 'E')
    expect(out.map((c) => c.userId)).toEqual(['y', 'z', 'x'])
  })

  it('11×31 격자에서 편집 한 번 검사 < 50ms (1-3 §7)', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `n${i}`)
    const days = '2026-11-01'
    const big = input({
      year: 2026,
      month: 11,
      nurses: ids.map((id) => nurse(id)),
      cells: ids.flatMap((id, i) =>
        row(id, days, Array.from({ length: 30 }, (_, d) => ['D', 'E', 'N', 'O', 'O'][(d + i) % 5]).join(' ')),
      ),
    })
    const t0 = performance.now()
    for (let i = 0; i < 20; i++) {
      const trial = { ...big, cells: applyEdits(big.cells, [edit('n1', '2026-11-05', 'OFF')]) }
      newViolations(checkSchedule(big), checkSchedule(trial))
    }
    expect((performance.now() - t0) / 20).toBeLessThan(50)
  })
})
