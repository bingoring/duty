// 요구사항 원문(inputs/requirements_v3.md) 절 번호별 추적 테스트.
// 다른 파일에서 이미 검증한 항목은 주석으로 위치만 남기고, 원문 문구·예시를 그대로 옮긴 경우만 여기에 둔다.
import { describe, expect, it } from 'vitest'
import { checkSchedule, restHoursBetween, type RuleId } from './checker/index'
import { FAMILY_LEAVE_DAYS, leaveEndDate } from './leave'
import { DEFAULT_RULES } from './rules-defaults'
import { baselineOff, settleMonth } from './settlement'
import { defaultTrainingEnd } from './staffing'
import { input, nurse, row, rules } from './test-utils'
import type { ScheduleInput } from './types'

const only = (inp: ScheduleInput, id: RuleId) => {
  const r = checkSchedule(inp)
  return [...r.hardViolations, ...r.softWarnings].filter((v) => v.ruleId === id)
}
const solo = (spec: string, over: Partial<ScheduleInput> = {}) =>
  input({ nurses: [nurse('a')], cells: row('a', '2026-10-01', spec), ...over })

describe('간호부 지침 §1 근무 형태 · 응급실 지침 §7 S 근무', () => {
  // D 07:00–15:30, E 14:30–23:00, N 22:30–익일 07:30, S 09:00–18:00 → 다음 날 근무까지 휴식(시간)
  it.each([
    ['D', 'E', 23],
    ['D', 'N', 31],
    ['D', 'S', 17.5],
    ['E', 'D', 8],
    ['E', 'N', 23.5],
    ['E', 'S', 10],
    ['N', 'D', -0.5],
    ['N', 'E', 7],
    ['N', 'S', 1.5],
    ['S', 'D', 13],
    ['S', 'E', 20.5],
    ['S', 'N', 28.5],
  ] as const)('%s → 다음 날 %s: %s시간', (a, b, h) => {
    expect(restHoursBetween(a, b)).toBe(h)
  })
})

describe('간호부 지침 §5 금지 패턴 E-D, N-E, N-off-D, E-S', () => {
  it.each([
    ['E D', 'E-D'],
    ['N E', 'N-E'],
    ['N O D', 'N-OFF-D'],
    ['E S', 'E-S'],
  ])('%s → %s', (spec, pattern) => {
    expect(only(solo(spec), 'H-PATTERN').map((v) => v.data.pattern)).toEqual([pattern])
  })
  // 간호부 지침 §4 16시간 휴식: checker.test.ts H-REST
})

describe('간호부 지침 §6 유급휴일 → 기준 OFF', () => {
  it('주휴일·공휴일·선거일·노동절·병원 지정일·노사 협의일은 기준 OFF, 개원기념일은 개인별 개원오프', () => {
    // 2026-10 평일 6일에 종류별로 하나씩
    const hol = [
      { date: '2026-10-05', kind: 'substitute' as const },
      { date: '2026-10-06', kind: 'public' as const },
      { date: '2026-10-07', kind: 'election' as const },
      { date: '2026-10-08', kind: 'labor_day' as const },
      { date: '2026-10-12', kind: 'hospital' as const },
      { date: '2026-10-13', kind: 'union_agreed' as const },
      { date: '2026-10-14', kind: 'founding_day' as const },
    ]
    expect(baselineOff(nurse('a'), 2026, 10, hol)).toBe(9 + 6)
  })
  // §6-7 특별휴가 구간표: leave.test.ts specialLeaveDays / §6-8 검진 반차 0.5: settlement.test.ts R-SETTLE-5
})

describe('간호부 지침 §7 경조휴가 일수', () => {
  it('11종 일수가 원문과 같다', () => {
    expect(FAMILY_LEAVE_DAYS).toEqual({
      self_marriage: 6,
      child_marriage: 2,
      ancestor_birthday: 2,
      spouse_childbirth: 10,
      parent_death: 7,
      grandparent_death: 3,
      child_death: 7,
      sibling_death: 3,
      uncle_aunt_death: 2,
      spouse_mourning_end: 2,
      ancestor_mourning_end: 1,
    })
  })

  it('종료일은 시작일부터 달력 일수로 계산한다 (핸드오프 S5: 10/19 시작 7일 → 10/25)', () => {
    expect(leaveEndDate('2026-10-19', FAMILY_LEAVE_DAYS.parent_death)).toBe('2026-10-25')
    expect(leaveEndDate('2026-12-30', 3)).toBe('2027-01-01')
  })
})

describe('간호부 지침 §14·§15, 응급실 지침 §11·§12 이월', () => {
  const HOL = [
    { date: '2026-10-05', kind: 'substitute' as const },
    { date: '2026-10-09', kind: 'public' as const },
  ]

  it('"9월 잔여 나이트 5, 10월 나이트 8 → 슬리핑오프 2, 잔여 1"', () => {
    const spec = 'N N O O N N O O N N O O N N SO SO'
    const s = settleMonth({
      nurse: nurse('a', { nightBankBefore: 5 }),
      year: 2026,
      month: 10,
      cells: row('a', '2026-10-01', spec),
      holidays: HOL,
      sleepingOffPerN: 6,
    })
    expect([s.nightCount, s.sleepingOff, s.nightBankAfter]).toEqual([8, 2, 1])
    expect(only(solo(spec, { nurses: [nurse('a', { nightBankBefore: 5 })] }), 'H-SLEEPING')).toEqual([])
    expect(
      only(solo(spec + ' SO', { nurses: [nurse('a', { nightBankBefore: 5 })] }), 'H-SLEEPING'),
    ).toHaveLength(1)
  })

  it('"전월 5개 + 이번 달 5개면 오프가 안 생기고, 다음 달에 이어진다"', () => {
    const s = settleMonth({
      nurse: nurse('a', { nightBankBefore: 0 }),
      year: 2026,
      month: 10,
      cells: row('a', '2026-10-01', 'N N O O N N O O N'),
      holidays: HOL,
      sleepingOffPerN: 6,
    })
    expect([s.sleepingOff, s.nightBankAfter]).toEqual([0, 5])
  })

  it('누적 OFF·잔여 N은 연말에 정산되지 않는다: 12월 결과가 그대로 1월 이월값', () => {
    const dec = settleMonth({
      nurse: nurse('a', { offCarryBefore: 3, nightBankBefore: 4 }),
      year: 2026,
      month: 12,
      cells: row('a', '2026-12-01', 'N N O'),
      holidays: [{ date: '2026-12-25', kind: 'public' }],
      sleepingOffPerN: 6,
    })
    expect(dec.entries.map((e) => e.account)).toEqual(['off_carry', 'night_bank'])
    expect(dec.nightBankAfter).toBe(6)
    // 1월 검사는 12월 결과를 이월값으로 받아 슬리핑오프 1개를 줄 수 있다
    const jan = input({
      year: 2027,
      month: 1,
      nurses: [nurse('a', { offCarryBefore: dec.offCarryAfter, nightBankBefore: dec.nightBankAfter })],
      cells: row('a', '2027-01-01', 'SO'),
    })
    expect(only(jan, 'H-SLEEPING')).toEqual([])
  })
})

describe('응급실 야간근무 운영지침 §1 전담 상한', () => {
  it('야간 전담은 월 15일, 31일 달은 16일', () => {
    const nights = (n: number) => Array(n).fill('N').join(' ')
    const ded = [nurse('a', { nightDedicated: { from: '2026-09-01', to: '2026-12-31' } })]
    const on = rules({ maxConsecutiveNight: 31 }, { nightDedicated: true })
    const nov = (n: number) =>
      input({ year: 2026, month: 11, nurses: ded, rules: on, cells: row('a', '2026-11-01', nights(n)) })
    expect(only(nov(15), 'H-NIGHT-MAX')).toEqual([])
    expect(only(nov(16), 'H-NIGHT-MAX')).toMatchObject([{ data: { max: 15 } }])
    expect(only(solo(nights(17), { nurses: ded, rules: on }), 'H-NIGHT-MAX')).toMatchObject([
      { data: { max: 16 } },
    ])
  })
  // §1 월 7개·목표 6, §2 연속 3일: checker.test.ts 나이트 개수·연속 / 간호부 §16 야간 전담 없음: DEFAULT_RULES 토글 꺼짐
})

describe('응급실 지침 §6 신규 트레이닝 3개월', () => {
  it('트레이닝 기본 종료일은 시작일 + 3개월 − 1일(말일 보정)', () => {
    expect(defaultTrainingEnd('2026-10-01', DEFAULT_RULES.params)).toBe('2026-12-31')
    expect(defaultTrainingEnd('2026-11-30', DEFAULT_RULES.params)).toBe('2027-02-27')
    expect(defaultTrainingEnd('2026-11-15', DEFAULT_RULES.params)).toBe('2027-02-14')
  })
  // 프리셉터 동일 근무: checker.test.ts H-TRAINING / 3인 배정 3주(경력 2주)·기간 뒤 N 3개: staffing.test.ts
})

describe('응급실 지침 §14 N 후 OFF 2개, 불가피하면 N-OFF-E', () => {
  it('N-OFF-E는 권고 미충족(소프트)이고 N-OFF-D는 금지(하드)', () => {
    const ne = checkSchedule(solo('N O E'))
    expect(ne.softWarnings.map((v) => v.ruleId)).toContain('S-OFF-AFTER-N')
    expect(ne.hardViolations.filter((v) => v.userIds.includes('a') && v.ruleId === 'H-PATTERN')).toEqual([])
    expect(only(solo('N O D'), 'H-PATTERN')).toHaveLength(1)
  })
})
