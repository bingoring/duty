import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCTOR_PATTERNS,
  DEFAULT_DOCTOR_RULES,
  DoctorFixedRuleSchema,
  DoctorRuleParamsSchema,
  baseTarget,
  readDoctorRuleParams,
  weekOfMonth,
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
  type DoctorPattern,
  type DoctorShiftRow,
} from './doctor'
import { monthDates } from './dates'

const fx = JSON.parse(
  readFileSync(new URL('../../../fixtures/doctor-2026-10.json', import.meta.url), 'utf8'),
) as {
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
    expect(defaultExtras(ORDER, { D: 1, N: 1 }, ['백승우', '진하람'])).toEqual({
      D: ['허재민'],
      N: ['고은서'],
    })
    expect(defaultExtras(ORDER, { D: 1, N: 1 }, [])).toEqual({ D: ['허재민'], N: ['고은서'] })
    expect(defaultExtras(ORDER, { D: 0, N: 0 }, ['진하람'])).toEqual({ D: [], N: [] })
  })

  it('목표 합은 날짜 수와 같다 (2월은 −1)', () => {
    const feb = monthTargets(
      ORDER,
      DEFAULT_DOCTOR_RULES,
      { D: -2, N: -2 },
      { D: ['허재민', '고은서'], N: ['노준호', '백승우'] },
    )
    expect([...feb.values()].reduce((s, t) => s + t.D, 0)).toBe(28)
    expect([...feb.values()].reduce((s, t) => s + t.N, 0)).toBe(28)
  })

  it('기본 규칙은 테스트 기간(간호사에게 공개 전)', () => {
    expect(DEFAULT_DOCTOR_RULES.published).toBe(false)
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
  // 3-11 이전 규칙(금지 패턴은 N-D 권고만)으로 본 10월 확정본
  const OLD = { patterns: [{ pattern: ['N', 'D'], severity: 'soft' }] as DoctorPattern[] }

  it('3-11 기본 금지 패턴(N-N 필수)으로는 10/20~21 고은서 N-N이 걸린다', () => {
    const r = checkDoctorMonth({
      year: 2026,
      month: 10,
      doctors: doctors(targets),
      shifts: oct,
      mode: 'generate',
    })
    expect(r.hard.map((v) => [v.rule, v.userId, v.dates])).toEqual([
      ['PATTERN', '고은서', ['2026-10-20', '2026-10-21']],
    ])
  })

  it('매일 D1·N1, 백승우 D 7 · 진하람 N 7로 하드 위반이 없다', () => {
    const r = checkDoctorMonth({
      ...OLD,
      year: 2026,
      month: 10,
      doctors: doctors(targets),
      shifts: oct,
      mode: 'generate',
    })
    expect(r.hard).toEqual([])
  })

  it('빈 칸은 DAILY, 개수가 다르면 생성에서는 하드 · 조정에서는 권고', () => {
    const broken = oct.map((s) => (s.date === '2026-10-03' ? { ...s, night: null } : s))
    const g = checkDoctorMonth({
      ...OLD,
      year: 2026,
      month: 10,
      doctors: doctors(targets),
      shifts: broken,
      mode: 'generate',
    })
    expect(g.hard.map((v) => v.rule)).toEqual(['DAILY', 'COUNT'])
    const a = checkDoctorMonth({
      ...OLD,
      year: 2026,
      month: 10,
      doctors: doctors(targets),
      shifts: broken,
      mode: 'adjust',
    })
    expect(a.hard.map((v) => v.rule)).toEqual(['DAILY'])
    expect(a.soft.map((v) => v.rule)).toContain('COUNT')
  })

  it('고정 조건 위반은 하드 (일요일 근무 금지)', () => {
    const days = monthDates(2026, 10)
    const fixed = expandFixedRules(
      [{ id: 'r', weekday: 0, shift: 'ANY', type: 'forbid', enabled: true }],
      days,
    )
    const ds = doctors(targets).map((d) => (d.id === '노준호' ? { ...d, fixed } : d))
    const r = checkDoctorMonth({
      ...OLD,
      year: 2026,
      month: 10,
      doctors: ds,
      shifts: oct,
      mode: 'generate',
    })
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
    const r = checkDoctorMonth({
      ...OLD,
      year: 2026,
      month: 10,
      doctors: ds,
      shifts: oct,
      mode: 'generate',
    })
    expect(r.hard).toEqual([])
    expect(r.soft.filter((v) => v.userId === '백승우').map((v) => v.rule)).toEqual([
      'ALLDAY_RANGE',
      'REQUEST',
    ])
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
    expect(swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-01', slot: 'N' })![0]).toEqual(
      {
        date: '2026-11-01',
        day: 'b',
        night: 'a',
      },
    )
    const cross = swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-02', slot: 'D' })!
    expect(cross.map((r) => r.day)).toEqual(['c', 'a'])
    // 같은 사람끼리는 맞바꿀 것이 없다
    expect(swapChips(rows, { date: '2026-11-01', slot: 'D' }, { date: '2026-11-02', slot: 'N' })).toBeNull()
  })
})

// 3-11: 필수/권고 · 금지 패턴 · 격주 고정 조건 · 재직 기간 비례 개수
describe('3-11 의사 규칙', () => {
  const NOV = monthDates(2026, 11)
  const two = (rows: Record<string, [string | null, string | null]>): DoctorShiftRow[] =>
    NOV.map((d) => ({ date: d, day: rows[d]?.[0] ?? 'x', night: rows[d]?.[1] ?? 'y' }))
  const doc = (id: string, extra: Partial<DoctorCheckDoctor> = {}): DoctorCheckDoctor => ({
    id,
    name: id,
    target: { D: 0, N: 0 },
    allDayMin: null,
    allDayMax: null,
    fixed: [],
    ...extra,
  })
  // x·y는 명단 밖 사람 — DAILY는 빼고 의사 a의 위반만 본다
  const run = (shifts: DoctorShiftRow[], ds: DoctorCheckDoctor[], extra = {}) => {
    const r = checkDoctorMonth({ year: 2026, month: 11, doctors: ds, shifts, mode: 'adjust', ...extra })
    const mine = (vs: typeof r.hard) => vs.filter((v) => v.userId === 'a')
    return { hard: mine(r.hard), soft: mine(r.soft) }
  }

  it('예전 규칙 버전(필수/권고·패턴 없음)은 기본값으로 읽는다', () => {
    const old = { dPerMonth: 6, nPerMonth: 6, requestDeadlineDay: 20, negotiationEndDay: 25, published: true }
    expect(readDoctorRuleParams(old)).toEqual({ ...DEFAULT_DOCTOR_RULES, published: true })
    expect(readDoctorRuleParams({ ...old, severity: { REQUEST: 'hard' } }).severity).toEqual({
      COUNT: 'hard',
      FIXED: 'hard',
      ALLDAY_RANGE: 'soft',
      REQUEST: 'hard',
    })
    const parsed = DoctorRuleParamsSchema.parse(old)
    expect(parsed.patterns).toEqual(DEFAULT_DOCTOR_PATTERNS)
    expect(parsed.severity.COUNT).toBe('hard')
  })

  it('금지 패턴 검증: 2~4일, O만은 안 되고, 같은 패턴 두 번도 안 된다', () => {
    const base = { ...DEFAULT_DOCTOR_RULES }
    expect(
      DoctorRuleParamsSchema.safeParse({ ...base, patterns: [{ pattern: ['N'], severity: 'hard' }] }).success,
    ).toBe(false)
    expect(
      DoctorRuleParamsSchema.safeParse({ ...base, patterns: [{ pattern: ['O', 'O'], severity: 'hard' }] })
        .success,
    ).toBe(false)
    const dup = [
      { pattern: ['N', 'D'], severity: 'hard' },
      { pattern: ['N', 'D'], severity: 'soft' },
    ]
    expect(DoctorRuleParamsSchema.safeParse({ ...base, patterns: dup }).success).toBe(false)
    expect(
      DoctorRuleParamsSchema.safeParse({
        ...base,
        patterns: [{ pattern: ['N', 'O', 'D'], severity: 'soft' }],
      }).success,
    ).toBe(true)
  })

  it('칸 기준: 올데이 다음 날 D는 올데이-D(필수)와 N-D(권고)에 함께 걸린다', () => {
    const r = run(two({ '2026-11-03': ['a', 'a'], '2026-11-04': ['a', 'y'] }), [doc('a')])
    expect(r.hard.map((v) => v.message)).toEqual(['a · 11/3(화)부터 금지 패턴 「올데이-D」'])
    expect(r.soft.filter((v) => v.rule === 'PATTERN').map((v) => v.message)).toEqual([
      'a · 11/3(화)부터 금지 패턴 「N-D」',
    ])
  })

  it('N-N은 올데이 날도 포함, 필수를 권고로 바꾸면 권고로 나온다', () => {
    const shifts = two({ '2026-11-10': ['x', 'a'], '2026-11-11': ['a', 'a'] })
    expect(run(shifts, [doc('a')]).hard.map((v) => v.message)).toEqual([
      'a · 11/10(화)부터 금지 패턴 「N-N」',
    ])
    const soft = DEFAULT_DOCTOR_PATTERNS.map((p) => ({ ...p, severity: 'soft' as const }))
    const r = run(shifts, [doc('a')], { patterns: soft })
    expect(r.hard).toEqual([])
    expect(r.soft.map((v) => v.message)).toContain('a · 11/10(화)부터 금지 패턴 「N-N」')
  })

  it('O 토큰과 3일 패턴(N-O-D)', () => {
    const shifts = two({ '2026-11-05': ['x', 'a'], '2026-11-07': ['a', 'y'] })
    const pats = [{ pattern: ['N', 'O', 'D'], severity: 'hard' }] as DoctorPattern[]
    expect(run(shifts, [doc('a')], { patterns: pats }).hard.map((v) => v.dates)).toEqual([
      ['2026-11-05', '2026-11-06', '2026-11-07'],
    ])
  })

  it('전월 마지막 날과 이어서 본다 (전월 말 N → 1일 N)', () => {
    const shifts = two({ '2026-11-01': ['x', 'a'] })
    const prev = [{ date: '2026-10-31', day: 'z', night: 'a' }]
    expect(run(shifts, [doc('a')], { prevShifts: prev }).hard.map((v) => v.dates)).toEqual([['2026-11-01']])
    // 전월 기록이 없으면 보지 않는다
    expect(run(shifts, [doc('a')]).hard).toEqual([])
    // 예전 호출(prevLastNight)도 N-N을 잡는다
    expect(run(shifts, [doc('a')], { prevLastNight: 'a' }).hard.length).toBe(1)
  })

  it('필수/권고 맵: 신청을 필수로, 고정 조건을 권고로', () => {
    const shifts = two({})
    const d = doc('a', {
      requests: [{ date: '2026-11-02', options: ['D'] }],
      fixed: [{ date: '2026-11-03', shift: 'N', type: 'require', label: '화요일 Night 필수' }],
    })
    const r = run(shifts, [d], {
      severity: { ...DEFAULT_DOCTOR_RULES.severity, REQUEST: 'hard', FIXED: 'soft' },
    })
    expect(r.hard.map((v) => v.rule)).toEqual(['REQUEST'])
    expect(r.soft.map((v) => v.rule)).toEqual(['FIXED'])
  })

  it('개수 권고면 생성에서도 권고', () => {
    const r = checkDoctorMonth({
      year: 2026,
      month: 11,
      doctors: [doc('a', { target: { D: 3, N: 0 } })],
      shifts: two({}),
      mode: 'generate',
      severity: { ...DEFAULT_DOCTOR_RULES.severity, COUNT: 'soft' },
    })
    expect(r.hard.filter((v) => v.rule !== 'DAILY')).toEqual([])
    expect(r.soft.map((v) => v.rule)).toContain('COUNT')
  })

  it('격주: 몇째 주는 일요일 시작, 1일이 든 주가 1주', () => {
    // 2026-11-01은 일요일
    expect(weekOfMonth('2026-11-01')).toBe(1)
    expect(weekOfMonth('2026-11-07')).toBe(1)
    expect(weekOfMonth('2026-11-08')).toBe(2)
    // 2026-10-01은 목요일 → 10/3(토) 1주, 10/4(일) 2주
    expect(weekOfMonth('2026-10-03')).toBe(1)
    expect(weekOfMonth('2026-10-04')).toBe(2)
    const days = monthDates(2026, 10)
    const sat = { id: 'r', weekday: 6, shift: 'N' as const, type: 'require' as const, enabled: true }
    expect(expandFixedRules([{ ...sat, cycle: 'odd' }], days).map((f) => f.date)).toEqual([
      '2026-10-03',
      '2026-10-17',
      '2026-10-31',
    ])
    expect(expandFixedRules([{ ...sat, cycle: 'even' }], days).map((f) => f.label)).toEqual([
      '짝수 주 토요일 Night 필수',
      '짝수 주 토요일 Night 필수',
    ])
    // 예전 조건(cycle 없음)은 매주
    expect(DoctorFixedRuleSchema.parse(sat).cycle).toBe('weekly')
  })

  it('재직 기간: 비례 개수와 기간 밖 근무(필수)', () => {
    // 11월(30일) 16일 입사 → 15일 재직 → 6 × 15/30 = 3
    const e = { employedFrom: '2026-11-16', employedUntil: null }
    expect(baseTarget(2026, 11, DEFAULT_DOCTOR_RULES, e)).toEqual({ D: 3, N: 3 })
    expect(
      baseTarget(2026, 11, DEFAULT_DOCTOR_RULES, { employedFrom: null, employedUntil: '2026-11-10' }),
    ).toEqual({
      D: 2,
      N: 2,
    })
    expect(baseTarget(2026, 11, DEFAULT_DOCTOR_RULES)).toEqual({ D: 6, N: 6 })
    // 5명 중 한 명 반달 → 30 − (24 + 3) = 3명이 +1
    const bases = [...Array(4).fill({ D: 6, N: 6 }), { D: 3, N: 3 }]
    expect(extraNeeded(2026, 11, bases, DEFAULT_DOCTOR_RULES)).toEqual({ D: 3, N: 3 })
    const t = monthTargets(
      ORDER,
      DEFAULT_DOCTOR_RULES,
      { D: 3, N: 3 },
      { D: ['허재민', '고은서', '노준호'], N: ['고은서', '노준호', '백승우'] },
      new Map([['진하람', { D: 3, N: 3 }]]),
    )
    expect([...t.values()].reduce((s, x) => s + x.D, 0)).toBe(30)
    expect([...t.values()].reduce((s, x) => s + x.N, 0)).toBe(30)
    const r = run(two({ '2026-11-02': ['a', 'y'] }), [doc('a', { employment: e })])
    expect(r.hard.map((v) => [v.rule, v.dates])).toEqual([['EMPLOYMENT', ['2026-11-02']]])
  })
})
