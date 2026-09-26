import { diffDays, isEmployed, type IsoDate } from './dates'
import type { HolidayDay, NurseProfile } from './types'

// R-SPECIAL-2: 그해 재직 달력 일수
export function employedDaysInYear(year: number, from: IsoDate | null, until: IsoDate | null): number {
  const start = from && from > `${year}-01-01` ? from : `${year}-01-01`
  const end = until && until < `${year}-12-31` ? until : `${year}-12-31`
  return Math.max(0, diffDays(start, end) + 1)
}

// R-SPECIAL-1: min(5, round_half_up(5d/365))를 정수 연산으로
export function specialLeaveDays(days: number): number {
  return Math.min(5, Math.floor((10 * days + 365) / 730))
}

// R-FOUNDING-1: 개원기념일에 재직 중이면 1일 대상. 그해 개원기념일이 없으면 null
export function foundingOffEligible(nurse: NurseProfile, year: number, holidays: readonly HolidayDay[]) {
  const day = holidays.find((h) => h.kind === 'founding_day' && h.date.startsWith(`${year}-`))
  return day ? isEmployed(nurse, day.date) : null
}
