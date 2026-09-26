import { DEFAULT_RULES } from '@duty/domain'
import { describe, expect, it } from 'vitest'
import type { MonthViewData, RowBalance, ScheduleCellRow, ViewUser } from './types'
import { buildScheduleView } from './view'

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
  offCarryBefore: 4,
  offCarryAfter: 4,
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

const cell = (
  userId: string,
  date: string,
  code: ScheduleCellRow['code'],
  over: Partial<ScheduleCellRow> = {},
): ScheduleCellRow => ({
  userId,
  date,
  code,
  checkupHalf: false,
  source: 'auto',
  ...(code === 'OFF' ? { offKind: 'regular' as const } : {}),
  ...over,
})

function data(over: Partial<MonthViewData> = {}): MonthViewData {
  const users = [
    user('head', 1, { rotation: 'fixed_weekday', role: 'admin' }),
    user('b', 2),
    user('me', 3),
    user('c', 4),
  ]
  return {
    year: 2026,
    month: 10,
    today: '2026-10-01',
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
    users,
    cells: [cell('me', '2026-10-01', 'N')],
    holidays: [
      { date: '2026-10-03', kind: 'public' },
      { date: '2026-10-05', kind: 'substitute' },
      { date: '2026-10-09', kind: 'public' },
      { date: '2026-10-20', kind: 'founding_day' },
    ],
    balances: new Map(users.map((u) => [u.id, bal()])),
    todayCell: cell('me', '2026-10-01', 'N'),
    ...over,
  }
}

describe('행 (R-VIEW-2~4)', () => {
  it('수간호사 → 나 → 나머지 순위 순', () => {
    const v = buildScheduleView(data())
    expect(v.rows.map((r) => [r.userId, r.kind])).toEqual([
      ['head', 'head'],
      ['me', 'me'],
      ['b', 'other'],
      ['c', 'other'],
    ])
  })

  it('로그인 사용자가 수간호사면 맨 위 행을 나로 강조', () => {
    const v = buildScheduleView(data({ viewerId: 'head', viewerRole: 'admin' }))
    expect(v.rows.map((r) => r.kind)).toEqual(['me', 'other', 'other', 'other'])
  })
})

describe('칸 (R-VIEW-5~7)', () => {
  const cellsOf = (cells: ScheduleCellRow[]) =>
    buildScheduleView(data({ cells })).rows.find((r) => r.userId === 'me')!.cells

  it('코드별 표시·칩, 칸 없음은 빈 칸', () => {
    const c = cellsOf([
      cell('me', '2026-10-01', 'D'),
      cell('me', '2026-10-02', 'OFF', { offKind: 'sleeping' }),
      cell('me', '2026-10-06', 'AL'),
      cell('me', '2026-10-07', 'LEAVE', { leaveKind: 'sick' }),
      cell('me', '2026-10-08', 'S'),
    ])
    expect(c.slice(0, 8).map((x) => [x.label, x.chip])).toEqual([
      ['D', 'd'],
      ['off', 'off'],
      ['', null],
      ['', null],
      ['', null],
      ['휴', 'leave'],
      ['휴', 'leave'],
      ['S', 's'],
    ])
    expect(c).toHaveLength(31)
  })

  it('외곽선: 관리자 수정 > 신청 반영, 휴가 칸은 외곽선 없음', () => {
    const c = cellsOf([
      cell('me', '2026-10-01', 'D', { source: 'admin' }),
      cell('me', '2026-10-02', 'OFF', { source: 'requested' }),
      cell('me', '2026-10-06', 'AL', { source: 'requested' }),
      cell('me', '2026-10-07', 'N', { source: 'swap' as ScheduleCellRow['source'] }),
    ])
    expect([c[0]!.outline, c[1]!.outline, c[5]!.outline, c[6]!.outline]).toEqual([
      'admin',
      'requested',
      null,
      null,
    ])
  })

  it('툴팁: 날짜·표시·종류·검진 반차·출처', () => {
    const c = cellsOf([
      cell('me', '2026-10-13', 'OFF', { offKind: 'sleeping', source: 'requested' }),
      cell('me', '2026-10-14', 'LEAVE', { leaveKind: 'sick' }),
      cell('me', '2026-10-15', 'D', { checkupHalf: true, source: 'admin' }),
    ])
    expect(c[12]!.title).toBe('10/13 (화) · off · 슬리핑오프 · 신청 반영')
    expect(c[13]!.title).toBe('10/14 (수) · 휴 · 병가')
    expect(c[14]!.title).toBe('10/15 (목) · D · 검진 반차 · 관리자 수정')
    expect(c[14]!.checkupHalf).toBe(true)
  })

  it('빨간 날 열의 칸은 weekend 표시', () => {
    const c = cellsOf([])
    expect([c[2]!.weekend, c[4]!.weekend, c[5]!.weekend, c[19]!.weekend]).toEqual([true, true, false, false])
  })
})

describe('일자 헤더 (R-VIEW-8)', () => {
  it('빨간 날·요일 색, 개원기념일은 빨간 날 아님, 토요일 공휴일은 일요일 색', () => {
    const d = buildScheduleView(data()).days
    const at = (n: number) => d[n - 1]!
    expect([at(1).weekday, at(1).red, at(1).color]).toEqual(['목', false, 'plain'])
    expect([at(3).red, at(3).color]).toEqual([true, 'sun']) // 토 + 개천절
    expect([at(10).red, at(10).color]).toEqual([true, 'sat'])
    expect([at(11).red, at(11).color]).toEqual([true, 'sun'])
    expect([at(5).red, at(5).color]).toEqual([true, 'sun']) // 대체공휴일
    expect([at(20).red, at(20).color]).toEqual([false, 'plain']) // 개원기념일
  })

  it('열 수는 날짜 수와 같다', () => {
    expect(buildScheduleView(data()).gridTemplate).toBe(
      '68px 36px 36px repeat(31,24px) 34px 34px 34px 34px 34px',
    )
    expect(buildScheduleView(data({ month: 11, cells: [], todayCell: null })).days).toHaveLength(30)
    expect(buildScheduleView(data({ month: 2, cells: [], todayCell: null })).gridTemplate).toContain(
      'repeat(28,24px)',
    )
  })
})

describe('오늘 열 (핸드오프 v3)', () => {
  it('보는 달이 이번 달이면 오늘 날짜의 헤더와 모든 행의 칸에 today 표시(주말이어도)', () => {
    const v = buildScheduleView(data({ today: '2026-10-03' }))
    expect(v.days.filter((d) => d.today).map((d) => d.date)).toEqual(['2026-10-03'])
    for (const r of v.rows) {
      expect(r.cells.filter((c) => c.today).map((c) => c.date)).toEqual(['2026-10-03'])
      expect(r.cells[2]!.weekend).toBe(true)
    }
  })

  it('이번 달이 아니면 표시하지 않는다', () => {
    const v = buildScheduleView(data({ today: '2026-11-02' }))
    expect(v.days.some((d) => d.today)).toBe(false)
    expect(v.rows.some((r) => r.cells.some((c) => c.today))).toBe(false)
  })
})

describe('우측 컬럼 (R-VIEW-9·10)', () => {
  it('누적 off는 부호, 특휴/개원은 개원 대상이 아니면 "-"', () => {
    const balances = new Map([
      ['head', bal({ offCarryAfter: 0 })],
      ['b', bal({ offCarryAfter: -2, foundingEligible: true, founding: 1, special: 3 })],
      ['me', bal({ offCarryAfter: 4, eduContThisYear: 1 })],
      ['c', bal({ offCarryAfter: 0.5, checkup: 0 })],
    ])
    const rows = buildScheduleView(data({ balances })).rows
    // 행 순서: head → me → b → c
    expect(rows.map((r) => r.accOff)).toEqual(['0', '+4', '−2', '+0.5'])
    expect(rows.map((r) => r.special)).toEqual(['5/-', '5/-', '3/1', '5/-'])
    expect(rows.map((r) => r.checkup)).toEqual(['0.5', '0.5', '0.5', '0'])
    expect(rows.find((r) => r.userId === 'me')).toMatchObject({
      carryOff: '4',
      carryN: '3',
      nLeft: '3',
      bo: '1',
    })
  })
})

describe('요약 카드 (R-VIEW-10·11·14)', () => {
  it('오늘·이번달 OFF·누적 OFF·잔여 나이트·연차/특휴', () => {
    const balances = new Map(data().balances)
    balances.set(
      'me',
      bal({
        actualOff: 12,
        baselineOff: 11,
        offCarryAfter: 5,
        nightBankBefore: 3,
        nightCount: 8,
        sleepingOff: 1,
        annual: 9,
        special: 2,
      }),
    )
    expect(buildScheduleView(data({ balances })).cards).toEqual({
      todayLabel: '오늘 10/1 (목)',
      todayCode: 'N',
      todayTime: '22:30–07:30',
      offCount: 12,
      baseline: 11,
      accText: '+5',
      accNote: '다음 달 반납 5',
      bankBefore: 3,
      nights: 8,
      sleeping: 1,
      annual: 9,
      special: 2,
    })
  })

  it('누적 OFF 설명: 음수는 더 받음, 0은 기준과 같음', () => {
    const at = (n: number) => {
      const balances = new Map(data().balances)
      balances.set('me', bal({ offCarryAfter: n }))
      return buildScheduleView(data({ balances })).cards!
    }
    expect([at(-2).accText, at(-2).accNote]).toEqual(['−2', '다음 달 2일 더 받음'])
    expect([at(0).accText, at(0).accNote]).toEqual(['0', '기준과 같음'])
  })

  it('오늘 칸: off·휴가·없음', () => {
    const today = (c: ScheduleCellRow | null) => buildScheduleView(data({ todayCell: c })).cards!
    expect([
      today(cell('me', '2026-10-01', 'OFF')).todayCode,
      today(cell('me', '2026-10-01', 'OFF')).todayTime,
    ]).toEqual(['off', ''])
    expect(today(cell('me', '2026-10-01', 'AL')).todayCode).toBe('연차')
    expect(today(cell('me', '2026-10-01', 'LEAVE', { leaveKind: 'family' })).todayCode).toBe('휴가')
    expect(today(null).todayCode).toBe('—')
  })

  it('로그인 사용자 행이 없으면 카드 없음', () => {
    expect(buildScheduleView(data({ viewerId: 'nobody' })).cards).toBeNull()
  })
})

describe('상태·헤더·하단 (R-VIEW-1·16·17)', () => {
  it('확정·마감 배지', () => {
    expect(buildScheduleView(data()).badge).toEqual({ kind: 'confirmed', text: '확정 · 담당 한수정' })
    const closed = data({ plan: { ...data().plan!, status: 'CLOSED', closedByName: '한수정' } })
    expect(buildScheduleView(closed).badge).toEqual({ kind: 'closed', text: '마감 · 담당 한수정' })
  })

  it('확정·마감이 아니면 빈 상태, 관리자 + 생성 중이면 생성안 링크', () => {
    const none = buildScheduleView(data({ month: 9, plan: null, cells: [] }))
    expect([none.rows, none.cards, none.badge]).toEqual([[], null, null])
    expect(none.empty).toEqual({ text: '2026년 9월 근무표가 아직 확정되지 않았습니다.' })
    const drafting = { ...data().plan!, status: 'DRAFTING' as const }
    expect(buildScheduleView(data({ plan: drafting, viewerRole: 'admin' })).empty?.adminLink).toBe(
      '/admin/generate',
    )
    expect(buildScheduleView(data({ plan: drafting })).empty?.adminLink).toBeUndefined()
  })

  it('이번 달을 볼 때 다음 달이 확정되면 링크', () => {
    const next = { ...data().plan!, negotiationStart: '2026-10-16', negotiationEnd: '2026-10-20' }
    expect(buildScheduleView(data({ nextPlan: next })).nextMonthLink).toEqual({
      ym: '2026-11',
      text: '11월 근무표 확정됨',
    })
    expect(buildScheduleView(data({ nextPlan: next, today: '2026-09-27' })).nextMonthLink).toBeNull()
    expect(buildScheduleView(data({ nextPlan: { ...next, status: 'DRAFTING' } })).nextMonthLink).toBeNull()
  })

  it('제목·이동 링크·하단 문구(다음 달 협의 기간, 없으면 기본값)', () => {
    const v = buildScheduleView(data())
    expect([v.title, v.prev, v.next]).toEqual(['2026년 10월 · 응급실 근무표', '2026-09', '2026-11'])
    expect(v.footer).toBe(
      '근무 신청 마감 매월 15일 · 협의 수정 기간 10/16 – 10/20 (관리자 설정) · 누적 off·잔여 N은 연말 정산 없이 계속 이월',
    )
    const next = { ...data().plan!, negotiationStart: '2026-10-17', negotiationEnd: '2026-10-22' }
    expect(buildScheduleView(data({ nextPlan: next })).footer).toContain('10/17 – 10/22')
  })
})
