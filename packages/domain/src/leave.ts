import { addDays, diffDays, isEmployed, type IsoDate } from './dates'
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

// 간호부 지침 §7 경조휴가(유급) 일수. 휴가 신청(S5)의 reasonCode
export const FAMILY_LEAVE_DAYS = {
  self_marriage: 6, // 본인 결혼
  child_marriage: 2, // 자녀 결혼
  ancestor_birthday: 2, // 본인·배우자 직계존속 회갑·칠순·팔순 중 택 1
  spouse_childbirth: 10, // 배우자 출산
  parent_death: 7, // 본인·배우자 부모 사망
  grandparent_death: 3, // 부모 외 직계존속 사망
  child_death: 7, // 자녀와 그 배우자 사망
  sibling_death: 3, // 본인·배우자 형제자매 사망
  uncle_aunt_death: 2, // 본인·배우자 백숙부모 사망
  spouse_mourning_end: 2, // 배우자 탈상
  ancestor_mourning_end: 1, // 본인·배우자 직계존속 탈상
} as const

export type FamilyLeaveReason = keyof typeof FAMILY_LEAVE_DAYS

// 종료일 = 시작일부터 달력 일수 (핸드오프 S5, 1-2 §6-6 서버 계산)
export function leaveEndDate(start: IsoDate, days: number): IsoDate {
  return addDays(start, days - 1)
}
