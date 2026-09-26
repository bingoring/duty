import type {
  CellSource,
  GridCell,
  HolidayDay,
  IsoDate,
  MonthPlanStatus,
  Role,
  Rotation,
  RuleSet,
  SeniorityTier,
} from '@duty/domain'

// Build Spec 2-3 domain-entities §1. load.ts → view.ts (순수 함수 입력)

export type ViewUser = {
  id: string
  employeeNo: string
  name: string
  role: Role
  rotation: Rotation
  seniorityRank: number
  seniorityTier: SeniorityTier
  kTass: boolean
  unionMember: boolean
  employedFrom: IsoDate | null
  employedUntil: IsoDate | null
}

export type ScheduleCellRow = GridCell & { source: CellSource }

export type RowBalance = {
  offCarryBefore: number
  offCarryAfter: number
  nightBankBefore: number
  nightBankAfter: number
  actualOff: number
  baselineOff: number
  sleepingOff: number
  nightCount: number
  annual: number
  special: number
  founding: number
  checkup: number
  sick: number
  foundingEligible: boolean | null
  eduContThisYear: number
}

export type PlanInfo = {
  status: MonthPlanStatus
  confirmedByName: string | null
  closedByName: string | null
  negotiationStart: IsoDate
  negotiationEnd: IsoDate
}

export type MonthViewData = {
  year: number
  month: number
  today: IsoDate
  viewerId: string
  viewerRole: Role
  plan: PlanInfo | null
  nextPlan: PlanInfo | null
  rules: RuleSet
  users: ViewUser[]
  cells: ScheduleCellRow[]
  holidays: HolidayDay[]
  balances: Map<string, RowBalance>
  todayCell: ScheduleCellRow | null
}

export type LeaveBalanceSummary = {
  annual: number
  annualGranted: number
  special: number
  specialGranted: number
  checkup: number
  sick: number
  offCarry: number
  nightBank: number
}
