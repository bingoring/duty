import { DEFAULT_RULES } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import type { MonthViewData, RowBalance, ScheduleCellRow, ViewUser } from '../schedule/types'
import { buildPeersView } from './view'

// Build Spec 2-10 business-rules §1 (R-PEER-*)
const user = (id: string, rank: number, over: Partial<ViewUser> = {}): ViewUser => ({
  id,
  employeeNo: `0010${rank}`,
  name: id,
  role: 'nurse',
  rotation: 'rotating',
  seniorityRank: rank,
  seniorityTier: 'senior',
  kTass: true,
  unionMember: false,
  employedFrom: null,
  employedUntil: null,
  ...over,
})

const bal = (over: Partial<RowBalance> = {}): RowBalance => ({
  offCarryBefore: 0,
  offCarryAfter: 0,
  nightBankBefore: 3,
  nightBankAfter: 3,
  actualOff: 11,
  baselineOff: 11,
  sleepingOff: 1,
  nightCount: 6,
  annual: 15,
  special: 5,
  founding: 0,
  checkup: 0.5,
  sick: 60,
  foundingEligible: null,
  eduContThisYear: 0,
  ...over,
})

const off = (userId: string, date: string): ScheduleCellRow => ({
  userId,
  date,
  code: 'OFF',
  offKind: 'regular',
  checkupHalf: false,
  source: 'auto',
})

function data(over: Partial<MonthViewData> = {}): MonthViewData {
  return {
    year: 2026,
    month: 10,
    today: '2026-10-13',
    viewerId: 'me',
    viewerRole: 'nurse',
    plan: {
      status: 'CONFIRMED',
      confirmedByName: '한수정',
      closedByName: null,
      negotiationStart: '2026-09-16',
      negotiationEnd: '2026-09-20',
    },
    nextPlan: null,
    rules: DEFAULT_RULES,
    users: [
      user('head', 1, { rotation: 'fixed_weekday', role: 'admin' }),
      user('b', 2),
      user('me', 3),
      user('c', 4),
    ],
    // b: 10/10–11, 10/24–25 / me: 10/31(토)만 / c: 없음
    cells: [
      off('b', '2026-10-10'),
      off('b', '2026-10-11'),
      off('b', '2026-10-24'),
      off('b', '2026-10-25'),
    ].concat(off('me', '2026-10-31')),
    holidays: [],
    balances: new Map([
      ['head', bal()],
      ['b', bal({ offCarryAfter: 2, nightBankAfter: 1 })],
      ['me', bal({ offCarryAfter: -1.5, nightBankAfter: 4, actualOff: 9, nightCount: 7, sleepingOff: 0 })],
      ['c', bal({ offCarryAfter: -1.5, nightBankAfter: 5 })],
    ]),
    todayCell: null,
    ...over,
  }
}

describe('buildPeersView', () => {
  it('수간호사를 빼고, 누적 OFF 오름차순 → 같으면 잔여 N 많은 순으로 정렬한다 (R-PEER-4·8)', () => {
    const v = buildPeersView(data())
    expect(v.rows.map((r) => r.name)).toEqual(['c', 'me', 'b'])
  })

  it('근무표와 같은 값을 보여 주고 누적 OFF는 색 없이 부호로 (R-PEER-5·6)', () => {
    const me = buildPeersView(data()).rows.find((r) => r.me)!
    expect(me).toMatchObject({ off: '9', acc: '−1.5', nights: '7', nLeft: '4', sleeping: '0' })
    expect(buildPeersView(data()).rows.find((r) => r.name === 'b')!.acc).toBe('+2')
  })

  it('주말 연휴 OFF: 첫 쌍 + 외 n, 월말 예정, 미배정 → 다음 달 우선 (R-PEER-7)', () => {
    const w = Object.fromEntries(buildPeersView(data()).rows.map((r) => [r.name, r.weekend]))
    expect(w).toEqual({ b: '10/10–11 외 1', me: '10/31–11/1 예정', c: '미배정 → 11월 우선' })
  })

  it('주말 통 OFF 규칙을 끄면 "미배정"만', () => {
    const rules = { ...DEFAULT_RULES, toggles: { ...DEFAULT_RULES.toggles, weekendPairOffMonthly: false } }
    expect(buildPeersView(data({ rules })).rows.find((r) => r.name === 'c')!.weekend).toBe('미배정')
  })

  it('내 행만 표시하고, 관리자(교대 근무자 아님)는 내 행이 없다 (R-PEER-9)', () => {
    expect(
      buildPeersView(data())
        .rows.filter((r) => r.me)
        .map((r) => r.name),
    ).toEqual(['me'])
    expect(buildPeersView(data({ viewerId: 'head' })).rows.some((r) => r.me)).toBe(false)
  })

  it('확정·마감 전인 달은 빈 상태 (R-PEER-3)', () => {
    const v = buildPeersView(data({ plan: null, cells: [], balances: new Map() }))
    expect(v.rows).toEqual([])
    expect(v.empty).toBe('10월 근무표가 아직 확정되지 않았습니다.')
  })

  it('제목과 월 이동 (R-PEER-2)', () => {
    expect(buildPeersView(data({ year: 2026, month: 12 }))).toMatchObject({
      title: '동료 현황 · 2026년 12월',
      prevYm: '2026-11',
      nextYm: '2027-01',
    })
  })
})
