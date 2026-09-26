import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatMD,
  isEmployed,
  isIsoDate,
  isRedDay,
  monthDates,
  prevMonth,
  redDaySet,
  weekdayKo,
} from './dates'

describe('isIsoDate', () => {
  it('실제 달력 날짜만 허용한다', () => {
    expect(isIsoDate('2026-10-01')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-1-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })
})

describe('날짜 산술', () => {
  it('월·연 경계를 넘어 더하고 뺀다', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-01', -15)).toBe('2026-09-16')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('두 날짜 사이 일수는 b − a다', () => {
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364)
    expect(diffDays('2026-10-05', '2026-10-01')).toBe(-4)
  })

  it('요일은 0=일 … 6=토, 2026-10-01은 목요일이다', () => {
    expect(dayOfWeek('2026-10-01')).toBe(4)
    expect(dayOfWeek('2026-10-03')).toBe(6)
    expect(dayOfWeek('2026-10-04')).toBe(0)
    expect(weekdayKo('2026-10-02')).toBe('금')
  })

  it('월 일수와 날짜 목록', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 10)).toBe(31)
    const oct = monthDates(2026, 10)
    expect([oct.length, oct[0], oct[30]]).toEqual([31, '2026-10-01', '2026-10-31'])
  })

  it('전월은 1월이면 전년 12월이다', () => {
    expect(prevMonth(2027, 1)).toEqual({ year: 2026, month: 12 })
    expect(prevMonth(2026, 11)).toEqual({ year: 2026, month: 10 })
  })

  it('M/D 표기', () => {
    expect(formatMD('2026-10-02')).toBe('10/2')
  })
})

describe('빨간 날', () => {
  const set = redDaySet([
    { date: '2026-10-05', kind: 'substitute' },
    { date: '2026-10-09', kind: 'public' },
    { date: '2026-10-20', kind: 'founding_day' },
  ])

  it('토·일과 개원기념일이 아닌 공휴일이다', () => {
    expect(isRedDay('2026-10-03', set)).toBe(true)
    expect(isRedDay('2026-10-04', set)).toBe(true)
    expect(isRedDay('2026-10-05', set)).toBe(true)
    expect(isRedDay('2026-10-09', set)).toBe(true)
    expect(isRedDay('2026-10-06', set)).toBe(false)
  })

  it('개원기념일은 빨간 날이 아니다 (R-BASE-1)', () => {
    expect(isRedDay('2026-10-20', set)).toBe(false)
  })
})

describe('isEmployed', () => {
  it('양끝을 포함하고 null은 무제한이다', () => {
    const n = { employedFrom: '2026-10-10', employedUntil: '2026-10-20' }
    expect(isEmployed(n, '2026-10-09')).toBe(false)
    expect(isEmployed(n, '2026-10-10')).toBe(true)
    expect(isEmployed(n, '2026-10-20')).toBe(true)
    expect(isEmployed(n, '2026-10-21')).toBe(false)
    expect(isEmployed({ employedFrom: null, employedUntil: null }, '1999-01-01')).toBe(true)
  })
})
