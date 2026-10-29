import { describe, expect, it } from 'vitest'
import type { AdjustView } from './view'
import { swapDates, swapGroups } from './mobile'

const D = '2026-10-20'
const cells = [
  { userId: 'h', date: D, code: 'S' },
  { userId: 'me', date: D, code: 'N' },
  { userId: 'a', date: D, code: 'D' },
  { userId: 'b', date: D, code: 'E' },
  { userId: 'c', date: D, code: 'OFF', offKind: 'regular' },
  { userId: 'd', date: D, code: 'AL' },
  { userId: 'e', date: D, code: 'E' },
]
const ids = ['h', 'me', 'a', 'b', 'c', 'd', 'e']
const names = Object.fromEntries(
  ids.map((id) => [
    id,
    { name: `이름${id}`, kTass: false, rotation: id === 'h' ? 'fixed_weekday' : 'rotating' },
  ]),
)
const view = {
  ym: '2026-10',
  today: '2026-10-13',
  grid: {
    days: ['2026-10-01', '2026-10-13', D].map((date) => ({ date })),
    rows: ids.map((userId) => ({ userId })),
  },
  checkInput: { cells },
  names,
  swap: {
    window: { open: true, label: '' },
    selectable: ids.filter((x) => x !== 'e'),
    received: [],
    sent: [],
    pendingByCell: {},
  },
} as unknown as AdjustView

describe('3-12 모바일 교환 대상', () => {
  it('그날 내 근무와 근무별 묶음(표 순서), 나는 빠진다', () => {
    const r = swapGroups(view, D, 'me')
    expect(r.mine).toBe('N')
    expect(r.groups.map((g) => g.code)).toEqual(['D', 'E', 'S', 'OFF', '휴가'])
    expect(r.groups.find((g) => g.code === 'E')!.people.map((p) => p.id)).toEqual(['b', 'e'])
  })
  it('휴가 칸·교환 대상 밖 사람은 고를 수 없다, 수간호사 S는 고를 수 있다', () => {
    const all = swapGroups(view, D, 'me').groups.flatMap((g) => g.people)
    expect(all.find((p) => p.id === 'd')?.selectable).toBe(false)
    expect(all.find((p) => p.id === 'e')?.selectable).toBe(false)
    expect(all.find((p) => p.id === 'h')?.selectable).toBe(true)
    expect(all.find((p) => p.id === 'a')).toMatchObject({ name: '이름a', code: 'D', selectable: true })
  })
  it('근무표에 없는 날짜면 내 근무 null, 묶음 없음', () =>
    expect(swapGroups(view, '2026-10-02', 'me')).toEqual({ mine: null, groups: [] }))
  it('교환 날짜 = 그 달 날짜 전부(데스크톱과 같음)', () =>
    expect(swapDates(view)).toEqual(['2026-10-01', '2026-10-13', D]))
})
