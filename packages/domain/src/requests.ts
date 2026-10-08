import type { BalanceAccount, LeaveType, RequestOption, RequestSpecial } from './allowed-sets'
import { addDays, diffDays, type IsoDate } from './dates'
import { FAMILY_LEAVE_DAYS, leaveEndDate, type FamilyLeaveReason } from './leave'

// Build Spec 2-5 domain-entities §2·§3 — 근무 신청·휴가

// 원문 §9 공가 사유
export const OFFICIAL_LEAVE_REASONS = {
  reserve: '예비군·민방위 훈련',
  court: '법원 등 공공기관 출두',
  vote: '투표',
  disaster: '천재지변',
} as const
export type OfficialLeaveReason = keyof typeof OFFICIAL_LEAVE_REASONS

const OPTION_ORDER: RequestOption[] = ['OFF', 'D', 'E', 'N']
const SHORT: Record<RequestOption, string> = { OFF: 'O', D: 'D', E: 'E', N: 'N' }

// R-REQ-VIEW-2: 단일은 코드, 복수는 슬래시(OFF·D·E·N 순), 교육은 '교'
export function requestLabel(options: readonly RequestOption[], special?: RequestSpecial): string {
  if (special === 'EDU_CONT' || special === 'EDU_UNION') return '교'
  if (special === 'AL') return '연'
  return OPTION_ORDER.filter((o) => options.includes(o))
    .map((o) => SHORT[o])
    .join('/')
}

const MAX_LEAVE_DAYS = 31

// R-LEAVE-2: 경조사는 사유 일수, 검진·개원기념 OFF는 시작일, 그 외는 입력(없으면 시작일). 잘못되면 null
export function leaveEnd(
  type: LeaveType,
  start: IsoDate,
  reasonCode?: string,
  end?: IsoDate,
): IsoDate | null {
  if (type === 'family') {
    const days = FAMILY_LEAVE_DAYS[reasonCode as FamilyLeaveReason]
    return days ? leaveEndDate(start, days) : null
  }
  if (type === 'checkup' || type === 'founding') return start
  const e = end ?? start
  const span = diffDays(start, e) + 1
  return span < 1 || span > MAX_LEAVE_DAYS ? null : e
}

// R-LEAVE-3
export function leaveDays(type: LeaveType, start: IsoDate, end: IsoDate, reasonCode?: string): number {
  if (type === 'family') return FAMILY_LEAVE_DAYS[reasonCode as FamilyLeaveReason] ?? diffDays(start, end) + 1
  if (type === 'checkup') return 0.5
  return diffDays(start, end) + 1
}

export function leaveDates(start: IsoDate, end: IsoDate): IsoDate[] {
  return Array.from({ length: diffDays(start, end) + 1 }, (_, i) => addDays(start, i))
}

// 한도가 있는 종류만 원장 계정이 있다
export function leaveAccount(type: LeaveType): BalanceAccount | null {
  switch (type) {
    case 'annual':
      return 'annual_leave'
    case 'special':
      return 'special_leave'
    case 'checkup':
      return 'checkup'
    case 'sick':
      return 'sick_leave'
    case 'founding':
      return 'founding_off'
    default:
      return null
  }
}

// Q3: 이번 달 OFF 목표 = 기준 OFF − 누적 OFF + 월초 잔여 N으로 확정 가능한 슬리핑오프
export function offTarget(a: {
  baseline: number
  offCarry: number
  nightBank: number
  sleepingOffPerN: number
}): number {
  return Math.round((a.baseline - a.offCarry + Math.floor(a.nightBank / a.sleepingOffPerN)) * 10) / 10
}
