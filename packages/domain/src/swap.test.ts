import { describe, expect, it } from 'vitest'
import { daysLeft, inNegotiation, sameCounts, swapToEdits, swappable } from './swap'

const cell = (code: string, offKind?: string) =>
  ({ userId: 'a', date: '2026-11-01', code, checkupHalf: false, ...(offKind ? { offKind } : {}) }) as never

describe('swappable (R-SWAP-3)', () => {
  it('D·E·N·일반 OFF만 바꿀 수 있다', () => {
    expect(['D', 'E', 'N'].map((c) => swappable(cell(c)))).toEqual([true, true, true])
    expect(swappable(cell('OFF', 'regular'))).toBe(true)
    expect(swappable(cell('OFF'))).toBe(true)
    expect(swappable(cell('OFF', 'sleeping'))).toBe(false)
    expect(swappable(cell('OFF', 'edu_cont'))).toBe(false)
    expect(swappable(cell('S'))).toBe(false)
    expect(swappable(cell('AL'))).toBe(false)
    expect(swappable(cell('LEAVE'))).toBe(false)
    expect(swappable(undefined)).toBe(false)
  })
})

describe('sameCounts', () => {
  it('before·after 코드 다중집합이 같아야 한다 (그날 D/E/N 개수 유지)', () => {
    const items = [
      { userId: 'a', before: { code: 'D' as const }, after: { code: 'E' as const } },
      { userId: 'b', before: { code: 'E' as const }, after: { code: 'N' as const } },
      { userId: 'c', before: { code: 'N' as const }, after: { code: 'D' as const } },
    ]
    expect(sameCounts(items)).toBe(true)
    expect(sameCounts([{ userId: 'a', before: { code: 'D' }, after: { code: 'OFF' } }])).toBe(false)
  })
})

describe('swapToEdits', () => {
  it('바뀐 사람만 편집으로, kind swap, OFF는 regular', () => {
    expect(
      swapToEdits('2026-11-01', [
        { userId: 'a', before: { code: 'D' }, after: { code: 'OFF' } },
        { userId: 'b', before: { code: 'OFF' }, after: { code: 'D' } },
        { userId: 'c', before: { code: 'E' }, after: { code: 'E' } },
      ]),
    ).toEqual([
      {
        userId: 'a',
        date: '2026-11-01',
        before: { code: 'D' },
        after: { code: 'OFF', offKind: 'regular' },
        kind: 'swap',
      },
      {
        userId: 'b',
        date: '2026-11-01',
        before: { code: 'OFF', offKind: 'regular' },
        after: { code: 'D' },
        kind: 'swap',
      },
    ])
  })
})

describe('협의 기간', () => {
  const plan = { negotiationStart: '2026-10-16', negotiationEnd: '2026-10-20' }
  it('시작일·끝일 포함', () => {
    expect(
      ['2026-10-15', '2026-10-16', '2026-10-20', '2026-10-21'].map((d) => inNegotiation(plan, d)),
    ).toEqual([false, true, true, false])
  })
  it('남은 날 (오늘 포함)', () => {
    expect(daysLeft(plan, '2026-10-18')).toBe(3)
    expect(daysLeft(plan, '2026-10-20')).toBe(1)
    expect(daysLeft(plan, '2026-10-21')).toBe(0)
  })
})
