import type {
  HolidayKind,
  LeaveKind,
  OffKind,
  RequestOption,
  RequestSpecial,
  Rotation,
  SeniorityTier,
  ShiftCode,
  TraineeKind,
} from './allowed-sets'
import type { Employment, IsoDate } from './dates'
import type { RuleSet } from './rules-defaults'

// Build Spec 2-2 domain-entities §2. DB 행이 아니라 순수 함수 입력이다(조립은 web 서버 계층).

export type NurseProfile = Employment & {
  id: string
  rotation: Rotation
  seniorityTier: SeniorityTier
  kTass: boolean
  unionMember: boolean
  nightDedicated: { from: IsoDate; to: IsoDate } | null
  offCarryBefore: number
  nightBankBefore: number
  weekendPairMissedLastMonth: boolean
  // 전달이 마지막 토요일 OFF에 기대 주말 통 OFF를 달성 예정으로 둠 → 이번 달 1일(일)도 OFF여야 한다
  weekendPairCarryIn: boolean
}

export type TrainingSpan = {
  traineeId: string
  preceptorId: string
  kind: TraineeKind
  startDate: IsoDate
  endDate: IsoDate
  tripleStaffUntil: IsoDate
  // 3인 배정 기간 뒤 대상 월 이전까지 신규가 선 N 수 (R-STAFF-5)
  tripleNightsBefore: number
}

export type HolidayDay = { date: IsoDate; kind: HolidayKind }

export type GridCell = {
  userId: string
  date: IsoDate
  code: ShiftCode
  offKind?: OffKind
  leaveKind?: LeaveKind
  checkupHalf: boolean
}

export type RequestEntry = {
  userId: string
  date: IsoDate
  options: RequestOption[]
  special?: RequestSpecial
}

export type ScheduleInput = {
  year: number
  month: number
  rules: RuleSet
  nurses: NurseProfile[]
  trainings: TrainingSpan[]
  holidays: HolidayDay[]
  cells: GridCell[]
  prevTail: GridCell[]
  // 다음 달 1일 칸(다음 달 근무표가 있을 때만). 월을 걸친 주말 판정용
  nextHead: GridCell[]
  requests: RequestEntry[]
}

// 서버가 조립한 입력이 계약을 어긴 경우(사용자 데이터 위반이 아니라 호출자 버그)
export class DomainInputError extends Error {
  override name = 'DomainInputError'
}

export const WORK_CODES = ['D', 'E', 'N', 'S'] as const
export const REST_CODES = ['OFF', 'AL', 'LEAVE'] as const
export type WorkCode = (typeof WORK_CODES)[number]
export type DutyCode = 'D' | 'E' | 'N'
export const DUTY_CODES: readonly DutyCode[] = ['D', 'E', 'N']

export function isWorkCode(code: ShiftCode): code is WorkCode {
  return code === 'D' || code === 'E' || code === 'N' || code === 'S'
}

export function isRestCode(code: ShiftCode): boolean {
  return !isWorkCode(code)
}
