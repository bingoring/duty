// 코드 측 allowed-set (FRAMEWORK allowed-set 방침). DB는 text 컬럼으로 두고 값은 여기서 검증한다. 확장 시 추가만.
export const ROLES = ['nurse', 'admin'] as const
// 3-7a: 직군. role은 직군 안에서 일반('nurse')·관리자('admin')를 뜻한다(의사 일반도 'nurse')
export const ROLE_GROUPS = ['nurse', 'doctor'] as const
export const LOGIN_ID_KINDS = ['employee_no', 'birthdate'] as const
export const DOCTOR_SHIFT_SOURCES = ['generated', 'imported', 'admin', 'swap'] as const
export const ROTATIONS = ['rotating', 'fixed_weekday'] as const
export const SENIORITY_TIERS = ['senior', 'mid', 'junior'] as const
export const SHIFT_CODES = ['D', 'E', 'N', 'S', 'OFF', 'AL', 'LEAVE'] as const
export const OFF_KINDS = ['regular', 'sleeping', 'edu_cont', 'edu_union', 'special', 'founding'] as const
export const LEAVE_KINDS = ['family', 'sick', 'official'] as const
export const CELL_SOURCES = ['auto', 'requested', 'admin', 'swap'] as const
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
export const HOLIDAY_SOURCES = ['seed', 'admin', 'api'] as const
export const MONTH_PLAN_STATUSES = [
  'REQUESTING',
  'REQUEST_CLOSED',
  'DRAFTING',
  'CONFIRMED',
  'CLOSED',
] as const
// founding: 개원기념 OFF(하루, 개원오프 잔여) — R-1, DECISIONS 2026-10-08
export const LEAVE_TYPES = ['annual', 'family', 'sick', 'official', 'special', 'checkup', 'founding'] as const
export const LEAVE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
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
  'settlement_reversed',
  // 2-11 R-ONB-6: 최초 로그인 초기 설정에서 본인이 고친 잔여치
  'self_input',
] as const
// 2-11 최초 로그인 초기 설정 제출
// self_edit: 3-4 내 설정에서 언제든 고치는 연차(입사 1년 미만은 달마다 늘 수 있다)
// ktas_edit: 3-6 내 설정의 KTAS 취득일·갱신일
export const ONBOARDING_KINDS = ['initial', 'annual', 'self_edit', 'ktas_edit'] as const
export const ONBOARDING_REVIEWS = ['confirmed', 'reverted'] as const
// 2-8 교환 요청
export const SWAP_STATUSES = ['PENDING', 'APPLIED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'INVALID'] as const
export const SWAP_RESPONSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const
// 3-5 관리자가 간호사의 OFF를 휴가로 바꾸자는 요청 — 간호사가 수락해야 휴가(승인됨)가 된다
export const LEAVE_PROPOSAL_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'INVALID'] as const
export const TRAINEE_KINDS = ['new_grad', 'experienced'] as const
export const EDIT_REASONS = ['manual', 'swap', 'leave_approved', 'leave_cancelled'] as const

export type Role = (typeof ROLES)[number]
export type RoleGroup = (typeof ROLE_GROUPS)[number]
export type DoctorShiftSource = (typeof DOCTOR_SHIFT_SOURCES)[number]
export type LeaveProposalStatus = (typeof LEAVE_PROPOSAL_STATUSES)[number]
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
export type TraineeKind = (typeof TRAINEE_KINDS)[number]
export type LeaveType = (typeof LEAVE_TYPES)[number]
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]
export type SwapStatus = (typeof SWAP_STATUSES)[number]
export type SwapResponse = (typeof SWAP_RESPONSES)[number]
export type BalanceReason = (typeof BALANCE_REASONS)[number]
