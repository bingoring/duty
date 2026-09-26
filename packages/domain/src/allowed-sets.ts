// 코드 측 allowed-set (FRAMEWORK allowed-set 방침). DB는 text 컬럼으로 두고 값은 여기서 검증한다. 확장 시 추가만.
export const ROLES = ['nurse', 'admin'] as const
export const ROTATIONS = ['rotating', 'fixed_weekday'] as const
export const SENIORITY_TIERS = ['senior', 'mid', 'junior'] as const
export const SHIFT_CODES = ['D', 'E', 'N', 'S', 'OFF', 'AL', 'LEAVE'] as const
export const OFF_KINDS = ['regular', 'sleeping', 'edu_cont', 'edu_union', 'special', 'founding'] as const
export const LEAVE_KINDS = ['family', 'sick', 'official'] as const
export const CELL_SOURCES = ['auto', 'requested', 'admin'] as const
export const REQUEST_OPTIONS = ['OFF', 'D', 'E', 'N'] as const
export const REQUEST_SPECIALS = ['AL', 'EDU_CONT', 'EDU_UNION'] as const
export const HOLIDAY_KINDS = [
  'public',
  'substitute',
  'election',
  'labor_day',
  'hospital',
  'union_agreed',
  'founding_day',
] as const
export const HOLIDAY_SOURCES = ['seed', 'admin'] as const
export const MONTH_PLAN_STATUSES = [
  'REQUESTING',
  'REQUEST_CLOSED',
  'DRAFTING',
  'CONFIRMED',
  'CLOSED',
] as const
export const LEAVE_TYPES = ['family', 'sick', 'official', 'special', 'checkup'] as const
export const LEAVE_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export const BALANCE_ACCOUNTS = [
  'off_carry',
  'night_bank',
  'annual_leave',
  'special_leave',
  'founding_off',
  'checkup',
  'sick_leave',
  'edu_cont',
  'edu_union',
] as const
export const BALANCE_REASONS = [
  'initial_input',
  'month_settlement',
  'admin_adjust',
  'year_grant',
  'year_reset',
  'leave_approved',
  'leave_cancelled',
] as const
export const EDIT_REASONS = ['manual', 'swap', 'leave_approved'] as const

export type Role = (typeof ROLES)[number]
export type Rotation = (typeof ROTATIONS)[number]
export type SeniorityTier = (typeof SENIORITY_TIERS)[number]
export type ShiftCode = (typeof SHIFT_CODES)[number]
export type OffKind = (typeof OFF_KINDS)[number]
export type LeaveKind = (typeof LEAVE_KINDS)[number]
export type CellSource = (typeof CELL_SOURCES)[number]
export type RequestOption = (typeof REQUEST_OPTIONS)[number]
export type RequestSpecial = (typeof REQUEST_SPECIALS)[number]
export type HolidayKind = (typeof HOLIDAY_KINDS)[number]
export type MonthPlanStatus = (typeof MONTH_PLAN_STATUSES)[number]
export type BalanceAccount = (typeof BALANCE_ACCOUNTS)[number]
export type BalanceReason = (typeof BALANCE_REASONS)[number]
