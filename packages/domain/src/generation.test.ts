import { describe, expect, it } from 'vitest'
import { violation } from './checker'
import { monthDates, redDaySet } from './dates'
import {
  fixedCells,
  generationChecks,
  headCells,
  leaveToCell,
  nightLimits,
  specialToCell,
  generatedCellSource,
} from './generation'
import { input, nurse, row, rules } from './test-utils'

const NOV = monthDates(2026, 11)
const RED = redDaySet([])

describe('leaveToCell · specialToCell (2-5 applyLeave와 같은 칸)', () => {
  it('휴가 종류별 칸', () => {
    expect(leaveToCell('annual')).toEqual({ code: 'AL' })
    expect(leaveToCell('special')).toEqual({ code: 'OFF', offKind: 'special' })
    expect(leaveToCell('sick')).toEqual({ code: 'LEAVE', leaveKind: 'sick' })
    expect(leaveToCell('family')).toEqual({ code: 'LEAVE', leaveKind: 'family' })
    expect(leaveToCell('official')).toEqual({ code: 'LEAVE', leaveKind: 'official' })
    // 검진 반차는 코드를 고정하지 않고 표시만 한다
    expect(leaveToCell('checkup')).toBeNull()
  })
  it('특수 신청 칸', () => {
    expect(specialToCell('AL')).toEqual({ code: 'AL' })
    expect(specialToCell('EDU_CONT')).toEqual({ code: 'OFF', offKind: 'edu_cont' })
    expect(specialToCell('EDU_UNION')).toEqual({ code: 'OFF', offKind: 'edu_union' })
  })
})

describe('headCells (수간호사 고정 칸)', () => {
  it('빨간 날 OFF, 그 외 D. 승인 휴가·본인 OFF 신청이 이긴다', () => {
    const h = nurse('h', { rotation: 'fixed_weekday' })
    const cells = headCells(h, NOV, RED, {
      fixed: new Map([['2026-11-03', { code: 'AL' as const }]]),
      offRequests: new Set(['2026-11-04']),
    })
    const at = (d: string) => cells.find((c) => c.date === d)
    expect(at('2026-11-01')).toMatchObject({ code: 'OFF', offKind: 'regular' }) // 일
    expect(at('2026-11-02')).toMatchObject({ code: 'D' })
    expect(at('2026-11-03')).toMatchObject({ code: 'AL' })
    expect(at('2026-11-04')).toMatchObject({ code: 'OFF', offKind: 'regular' })
    expect(cells).toHaveLength(30)
  })
  it('재직일이 아니면 칸 없음', () => {
    const h = nurse('h', { rotation: 'fixed_weekday', employedFrom: '2026-11-10' })
    expect(headCells(h, NOV, RED, { fixed: new Map(), offRequests: new Set() })).toHaveLength(21)
  })
})

describe('fixedCells (고정 칸 우선순위)', () => {
  it('승인 휴가 > 특수 신청, 월 밖·재직 밖 날짜는 버린다', () => {
    const a = nurse('a', { employedUntil: '2026-11-28' })
    const out = fixedCells({
      days: NOV,
      nurses: [a],
      leaves: [
        { userId: 'a', type: 'sick', startDate: '2026-10-30', endDate: '2026-11-02' },
        { userId: 'a', type: 'annual', startDate: '2026-11-29', endDate: '2026-11-30' },
        { userId: 'a', type: 'checkup', startDate: '2026-11-10', endDate: '2026-11-10' },
      ],
      specials: [
        { userId: 'a', date: '2026-11-02', special: 'EDU_CONT' },
        { userId: 'a', date: '2026-11-05', special: 'EDU_UNION' },
      ],
    })
    const m = out.fixed.get('a')!
    expect([...m.keys()].sort()).toEqual(['2026-11-01', '2026-11-02', '2026-11-05'])
    expect(m.get('2026-11-02')).toEqual({ code: 'LEAVE', leaveKind: 'sick' })
    expect(m.get('2026-11-05')).toEqual({ code: 'OFF', offKind: 'edu_union' })
    expect(out.checkupDates.get('a')).toEqual(new Set(['2026-11-10']))
  })
})

describe('nightLimits (검사기 H-NIGHT-MAX·S-NIGHT-TARGET과 같은 값)', () => {
  it('교대 근무자는 상한 7·목표 6, 전담은 15/16·목표 없음', () => {
    const r = rules({}, { nightDedicated: true })
    expect(nightLimits(nurse('a'), r, 2026, 11)).toEqual({ max: 7, target: 6, dedicated: false })
    const d = nurse('b', { nightDedicated: { from: '2026-11-01', to: '2027-01-31' } })
    expect(nightLimits(d, r, 2026, 11)).toEqual({ max: 15, target: null, dedicated: true })
    expect(nightLimits(d, r, 2026, 12)).toEqual({ max: 16, target: null, dedicated: true })
    // 토글이 꺼져 있으면 전담으로 보지 않는다
    expect(nightLimits(d, rules(), 2026, 11).dedicated).toBe(false)
  })
})

describe('generatedCellSource', () => {
  it('고정 칸(휴가·특수 신청)과 충족한 신청은 requested, 나머지 auto', () => {
    const c = (code: 'D' | 'OFF', offKind?: 'special') => ({
      userId: 'a',
      date: '2026-11-02',
      code,
      checkupHalf: false,
      ...(offKind ? { offKind } : {}),
    })
    expect(generatedCellSource(c('OFF', 'special'), undefined, true)).toBe('requested')
    expect(
      generatedCellSource(c('D'), { userId: 'a', date: '2026-11-02', options: ['D', 'OFF'] }, false),
    ).toBe('requested')
    expect(generatedCellSource(c('D'), { userId: 'a', date: '2026-11-02', options: ['OFF'] }, false)).toBe(
      'auto',
    )
    expect(generatedCellSource(c('D'), undefined, false)).toBe('auto')
  })
})

describe('generationChecks (1i 검사 결과 리스트)', () => {
  it('인원 통과 항목 + 신청 반영 + 권고 미충족 문구', () => {
    const inp = input({
      year: 2026,
      month: 11,
      rules: rules({ minStaffPerShift: 2, minKTass: 1 }),
      nurses: [nurse('a')],
      requests: [
        { userId: 'a', date: '2026-11-01', options: ['N'] },
        { userId: 'a', date: '2026-11-04', options: ['OFF'] },
        { userId: 'a', date: '2026-11-05', options: [], special: 'AL' },
      ],
    })
    const result = {
      hardViolations: [],
      softWarnings: [
        violation('S-REQUEST', ['a'], ['2026-11-04'], { options: 'OFF', code: 'D' }),
        violation('S-HEAD-FILL', [], ['2026-11-02'], { count: 1, kTass: 1 }, 'D'),
      ],
    }
    const items = generationChecks(result, inp, { nameOf: () => '가나', month: 11 })
    expect(items.slice(0, 2)).toEqual([
      {
        ok: true,
        title: '모든 듀티 인원 2명 이상 · K-tass 1명 포함',
        detail: '11/1~30 D·E·N 90개 듀티 전부 충족 · 수간호사 보충 1개',
      },
      { ok: false, title: '신청 3건 중 2건 반영', detail: '불충족 1건은 아래 목록' },
    ])
    expect(items.slice(2).map((i) => [i.ok, i.title])).toEqual([
      [false, '11/2 (월) D 수간호사로 인원 충족'],
      [false, '가나 · 신청 불충족'],
    ])
  })

  it('신청을 모두 반영하면 통과 항목', () => {
    const inp = input({
      year: 2026,
      month: 11,
      requests: [{ userId: 'a', date: '2026-11-01', options: ['OFF', 'D'] }],
    })
    const items = generationChecks({ hardViolations: [], softWarnings: [] }, inp, {
      nameOf: () => '',
      month: 11,
    })
    expect(items[1]).toEqual({ ok: true, title: '신청 1건 전부 반영', detail: '복수 옵션 1건 포함' })
  })
})
