import { describe, expect, it } from 'vitest'
import { employedDaysInYear, foundingOffEligible, specialLeaveDays } from './leave'
import { nurse } from './test-utils'

describe('specialLeaveDays (R-SPECIAL-1, 원문 §6-7 구간표)', () => {
  it.each([
    [0, 0],
    [36, 0],
    [37, 1],
    [109, 1],
    [110, 2],
    [182, 2],
    [183, 3],
    [255, 3],
    [256, 4],
    [328, 4],
    [329, 5],
    [365, 5],
    [366, 5],
  ])('%i일 → %i일', (days, expected) => {
    expect(specialLeaveDays(days)).toBe(expected)
  })
})

describe('employedDaysInYear (R-SPECIAL-2)', () => {
  it('1년 내내 재직하면 365, 윤년은 366', () => {
    expect(employedDaysInYear(2026, null, null)).toBe(365)
    expect(employedDaysInYear(2028, '2020-03-01', null)).toBe(366)
  })

  it('연중 입사·퇴사는 재직 구간의 달력 일수', () => {
    expect(employedDaysInYear(2026, '2026-10-01', null)).toBe(92)
    expect(employedDaysInYear(2026, null, '2026-01-31')).toBe(31)
    expect(employedDaysInYear(2026, '2026-03-01', '2026-03-10')).toBe(10)
  })

  it('그해에 재직하지 않으면 0', () => {
    expect(employedDaysInYear(2026, '2027-01-01', null)).toBe(0)
    expect(employedDaysInYear(2026, null, '2025-12-31')).toBe(0)
  })
})

describe('foundingOffEligible (R-FOUNDING-1)', () => {
  const hol = [{ date: '2026-10-20', kind: 'founding_day' as const }]
  it('개원기념일에 재직 중이면 true, 아니면 false, 개원기념일이 없으면 null', () => {
    expect(foundingOffEligible(nurse('a'), 2026, hol)).toBe(true)
    expect(foundingOffEligible(nurse('a', { employedFrom: '2026-11-01' }), 2026, hol)).toBe(false)
    expect(foundingOffEligible(nurse('a'), 2027, hol)).toBeNull()
  })
})
