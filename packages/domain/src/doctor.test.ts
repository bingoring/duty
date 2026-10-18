import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCTOR_RULES,
  checkDoctorMonth,
  dayState,
  defaultExtras,
  doctorPlanDates,
  expandFixedRules,
  extraNeeded,
  monthTargets,
  requestConflicts,
  swapChips,
  type DoctorCheckDoctor,
  type DoctorShiftRow,
} from './doctor'
import { monthDates } from './dates'

const fx = JSON.parse(readFileSync(new URL('../../../fixtures/doctor-2026-10.json', import.meta.url), 'utf8')) as {
  shifts: DoctorShiftRow[]
}
const ORDER = ['허재민', '고은서', '노준호', '백승우', '진하람']
const oct = fx.shifts

const doctors = (targets: Map<string, { D: number; N: number }>, extra: Partial<DoctorCheckDoctor> = {}) =>
  ORDER.map((id) => ({
    id,
    name: id,
    target: targets.get(id)!,
    allDayMin: null,
    allDayMax: null,
    fixed: [],
    ...extra,
  }))

describe('의사 개수 — 31일 달 ±1 대상', () => {
  it('30일 달은 대상이 없고 31일 달은 D·N 한 명씩', () => {
    expect(extraNeeded(2026, 11, 5, DEFAULT_DOCTOR_RULES)).toEqual({ D: 0, N: 0 })
    expect(extraNeeded(2026, 10, 5, DEFAULT_DOCTOR_RULES)).toEqual({ D: 1, N: 1 })
    expect(extraNeeded(2027, 2, 5, DEFAULT_DOCTOR_RULES)).toEqual({ D: -2, N: -2 })
  })

  it('기본 대상은 직전 대상 다음 사람부터 표 순서로 돈다 (10월 백승우·진하람 → 12월 허재민·고은서)', () => {
    expect(defaultExtras(ORDER, { D: 1, N: 1 }, ['백승우', '진하람'])).toEqual({ D: ['허재민'], N: ['고은서'] })
    expect(defaultExtras(ORDER, { D: 1, N: 1 }, [])).toEqual({ D: ['허재민'], N: ['고은서'] })
    expect(defaultExtras(ORDER, { D: 0, N: 0 }, ['진하람'])).toEqual({ D: [], N: [] })
  })

  it('목표 합은 날짜 수와 같다 (2월은 −1)', () => {
    const feb = monthTargets(ORDER, DEFAULT_DOCTOR_RULES, { D: -2, N: -2 }, { D: ['허재민', '고은서'], N: ['노준호', '백승우'] })
    expect([...feb.values()].reduce((s, t) => s + t.D, 0)).toBe(28)
    expect([...feb.values()].reduce((s, t) => s + t.N, 0)).toBe(28)
  })

  it('신청 마감·조정 마감은 전월 20·25일', () => {
    expect(doctorPlanDates(2026, 11, DEFAULT_DOCTOR_RULES)).toEqual({
      requestDeadline: '2026-10-20',
      negotiationEnd: '2026-10-25',
    })
    expect(doctorPlanDates(2027, 1, DEFAULT_DOCTOR_RULES).requestDeadline).toBe('2026-12-20')
  })
})

describe('checkDoctorMonth — 10월 확정본(가명)', () => {
  const targets = monthTargets(ORDER, DEFAULT_DOCTOR_RULES, { D: 1, N: 1 }, { D: ['백승우'], N: ['진하람'] })

  it('매일 D1·N1, 백승우 D 7 · 진하람 N 7로 하드 위반이 없다', () => {
    const r = checkDoctorMonth({ year: 2026, month: 10, doctors: doctors(targets), shifts: oct, mode: 'generate' })
    expect(r.hard).toEqual([])
  })

  it('빈 칸은 DAILY, 개수가 다르면 생성에서는 하드 · 조정에서는 권고', () => {
    const broken = oct.map((s) => (s.date === '2026-10-03' ? { ...s, night: null } : s))
    const g = checkDoctorMonth({ year: 2026, month: 10, doctors: doctors(targets), shifts: broken, mode: 'generate' })
    expect(g.hard.map((v) => v.rule)).toEqual(['DAILY', 'COUNT'])
    const a = checkDoctorMonth({ year: 2026, month: 10, doctors: doctors(targets), shifts: broken, mode: 'adjust' })
    expect(a.hard.map((v) => v.rule)).toEqual(['DAILY'])
    expect(a.soft.map((v) => v.rule)).toContain('COUNT')
  })

  it('고정 조건 위반은 하드 (일요일 근무 금지)', () => {
    const days = monthDates(2026, 10)
    const fixed = expandFixedRules([{ id: 'r', weekday: 0, shift: 'ANY', type: 'forbid', enabled: true }], days)
    const ds = doctors(targets).map((d) => (d.id === '노준호' ? { ...d, fixed } : d))
    const r = checkDoctorMonth({ year: 2026, month: 10, doctors: ds, shifts: oct, mode: 'generate' })
    // 10/4(일) 노준호 D·N, 10/25(일) 노준호 D·N
    expect(r.hard.map((v) => v.dates[0])).toEqual(['2026-10-04', '2026-10-25'])
  })

  it('꺼진 조건과 그 날만 예외는 펼치지 않는다', () => {
    const days = monthDates(2026, 10)
    const rule = { id: 'r', weekday: 6, shift: 'N' as const, type: 'require' as const, enabled: true }
    expect(expandFixedRules([rule], days).map((f) => f.date)).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
    ])
    expect(expandFixedRules([{ ...rule, enabled: false }], days)).toEqual([])
    expect(expandFixedRules([rule], days, new Set(['2026-10-10'])).length).toBe(4)
  })

  it('올데이 범위·신청 미반영은 권고', () => {
    const ds = doctors(targets).map((d) =>
      d.id === '백승우'
        ? { ...d, allDayMin: 0, allDayMax: 0, requests: [{ date: '2026-10-02', options: ['O' as const] }] }
        : d,
    )
    const r = checkDoctorMonth({ year: 2026, month: 10, doctors: ds, shifts: oct, mode: 'generate' })
    expect(r.hard).toEqual([])
    expect(r.soft.filter((v) => v.userId === '백승우').map((v) => v.rule)).toEqual(['ALLDAY_RANGE', 'REQUEST'])
  })
})

describe('하루 상태·충돌·맞바꾸기', () => {
  it('올데이 = 같은 날 D·N', () => {
    expect(dayState({ day: 'a', night: 'a' }, 'a')).toBe('ALLDAY')
    expect(dayState({ day: 'a', night: 'b' }, 'b')).toBe('N')
    expect(dayState(undefined, 'a')).toBe('O')
  })

  it('복수 신청은 하나라도 조건을 지키면 충돌이 아니다', () => {
    const f = [{ shift: 'ANY' as const, type: 'forbid' as const, label: '일요일 근무 금지' }]
    expect(requestConflicts(['D'], f)).toEqual(['일요일 근무 금지'])
    expect(requestConflicts(['D', 'O'], f)).toEqual([])
    const req = [{ shift: 'N' as const, type: 'require' as const, label: '토요일 Night 필수' }]
    expect(requestConflicts(['ALLDAY'], req)).toEqual([])
    expect(requestConflicts(['O'], req)).toEqual(['토요일 Night 필수'])
  })

  it('두 칩의 주인을 맞바꾼다 (같은 날 D↔N, 다른 날)', () => {
    const rows = [
      { date: '2026-11-01', day: 'a', night: 'b' },
      { date: '2026-11-02', day: 'c', night: 'a' },
    ]
    expect(swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-01', slot: 'N' })![0]).toEqual({
      date: '2026-11-01',
      day: 'b',
      night: 'a',
    })
    const cross = swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-02', slot: 'D' })!
    expect(cross.map((r) => r.day)).toEqual(['c', 'a'])
    // 같은 사람끼리는 맞바꿀 것이 없다
    expect(swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-02', slot: 'N' })).toBeNull()
  })
})
