import { describe, expect, it } from 'vitest'
import { baselineOff, reverseEntries, settleMonth, summarizeNurse } from './settlement'
import { loadPaper, nurse, row } from './test-utils'

const OCT = { year: 2026, month: 10 }
const HOL = [
  { date: '2026-10-03', kind: 'public' as const },
  { date: '2026-10-05', kind: 'substitute' as const },
  { date: '2026-10-09', kind: 'public' as const },
  { date: '2026-10-20', kind: 'founding_day' as const },
]

describe('baselineOff (R-BASE-1·2)', () => {
  it('2026-10은 주말 9 + 10/5 + 10/9 = 11 (개원기념일 제외)', () => {
    expect(baselineOff(nurse('a'), 2026, 10, HOL)).toBe(11)
  })

  it('월 중간 입사·퇴사는 재직일의 빨간 날만 센다', () => {
    expect(baselineOff(nurse('a', { employedFrom: '2026-10-10' }), 2026, 10, HOL)).toBe(7)
    expect(baselineOff(nurse('a', { employedUntil: '2026-10-05' }), 2026, 10, HOL)).toBe(3)
  })
})

describe('settleMonth', () => {
  const settle = (spec: string, over = {}) =>
    settleMonth({
      nurse: nurse('a', over),
      ...OCT,
      cells: row('a', '2026-10-01', spec),
      holidays: HOL,
      sleepingOffPerN: 6,
    })

  it('실제 OFF = regular + 보수교육 + 노조교육. 슬리핑·특휴·개원·연차·휴가는 제외 (R-SETTLE-1)', () => {
    const r = settle('O EC EU SO SP FO A L N')
    expect([r.actualOff, r.sleepingOff, r.nightCount]).toEqual([3, 1, 1])
  })

  it('누적 OFF = 이월 + 실제 − 기준, 잔여 N = 이월 + N − 6 × 슬리핑 (R-SETTLE-2·3)', () => {
    // 기준 11, 실제 OFF 12 → +1
    const spec = Array(12).fill('O').join(' ') + ' N N N N N N N SO'
    const r = settle(spec, { offCarryBefore: -2, nightBankBefore: 3 })
    expect([r.baselineOff, r.offCarryBefore, r.offCarryAfter]).toEqual([11, -2, -1])
    expect([r.nightBankBefore, r.nightBankAfter]).toEqual([3, 4])
  })

  it('부여하지 못한 슬리핑오프는 잔여 N에 남는다', () => {
    const r = settle('N N N O O N N N O O N N', { nightBankBefore: 5 })
    expect([r.sleepingOff, r.nightBankAfter]).toEqual([0, 13])
  })

  it('원장 증감은 0이 아닌 것만 (R-SETTLE-5)', () => {
    const r = settle('O EC EU SO SP FO A L N D+', { offCarryBefore: 0, nightBankBefore: 5 })
    expect(Object.fromEntries(r.entries.map((e) => [e.account, e.delta]))).toEqual({
      off_carry: 3 - 11,
      night_bank: 1 - 6,
      annual_leave: -1,
      special_leave: -1,
      founding_off: -1,
      checkup: -0.5,
      sick_leave: -1,
      edu_cont: 1,
      edu_union: 1,
    })
  })

  it('수간호사는 기준 OFF = 실제 OFF라서 누적이 변하지 않는다 (R-SETTLE-4)', () => {
    const r = settle('D D O O', { rotation: 'fixed_weekday' })
    expect([r.baselineOff, r.offCarryAfter]).toEqual([2, 0])
    expect(r.entries.find((e) => e.account === 'off_carry')).toBeUndefined()
  })

  it('주말 통 OFF 달성 여부를 기록한다 (R-SETTLE-7)', () => {
    expect(settle('D D O O').weekendPairAchieved).toBe(true)
    expect(settle('D D O D').weekendPairAchieved).toBe(false)
  })
})

describe('reverseEntries (R-SETTLE-6, INV4)', () => {
  it('부호를 뒤집어 합이 0이 된다', () => {
    const e = [
      { account: 'off_carry' as const, delta: 2 },
      { account: 'checkup' as const, delta: -0.5 },
    ]
    const sum = [...e, ...reverseEntries(e)].reduce((s, x) => s + x.delta, 0)
    expect(sum).toBe(0)
    expect(reverseEntries(e)).toEqual([
      { account: 'off_carry', delta: -2 },
      { account: 'checkup', delta: 0.5 },
    ])
  })
})

describe('summarizeNurse', () => {
  it('코드별 개수', () => {
    expect(summarizeNurse(row('a', '2026-10-01', 'D D E N O SO A L S'))).toEqual({
      D: 2,
      E: 1,
      N: 1,
      S: 1,
      OFF: 2,
      AL: 1,
      LEAVE: 1,
    })
  })
})

describe('종이 근무표 2026-10 정산', () => {
  it('10명 전원의 누적 OFF가 종이와 일치한다', () => {
    const { input, paperOffCarryAfter, rows } = loadPaper()
    for (const r of rows.filter((r) => r.rotation === 'rotating')) {
      const n = input.nurses.find((x) => x.id === r.employeeNo)!
      const cells = input.cells.filter((c) => c.userId === n.id)
      const s = settleMonth({ nurse: n, ...OCT, cells, holidays: input.holidays, sleepingOffPerN: 6 })
      expect([r.name, s.offCarryAfter]).toEqual([r.name, paperOffCarryAfter.get(n.id)])
    }
  })
})
