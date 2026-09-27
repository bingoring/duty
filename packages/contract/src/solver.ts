import { z } from 'zod'

// Build Spec 2-6 domain-entities §1. 솔버 입출력 계약의 SoT.
// 바꾸면 `pnpm --filter @duty/contract gen`으로 solver.schema.json과 Python 모델을 다시 만든다.
export const SOLVER_CONTRACT_VERSION = 1

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Duty = z.enum(['D', 'E', 'N'])
const WorkCode = z.enum(['D', 'E', 'N', 'S'])
const Code = z.enum(['D', 'E', 'N', 'S', 'OFF', 'AL', 'LEAVE'])
const OffKind = z.enum(['regular', 'sleeping', 'edu_cont', 'edu_union', 'special', 'founding'])
const RequestOption = z.enum(['OFF', 'D', 'E', 'N'])

export const SolverCell = z.object({
  userId: z.string(),
  date: IsoDate,
  code: Code,
  offKind: OffKind.optional(),
})

const FixedCell = z.object({ date: IsoDate, code: Code, offKind: OffKind.optional() })

export const SolverNurse = z.object({
  id: z.string(),
  kTass: z.boolean(),
  junior: z.boolean(),
  // 대상 월 중 재직일 (칸을 만들 날)
  workDays: z.array(IsoDate),
  // 승인 휴가·특수 신청 (Build Spec 2-6 domain-entities §3)
  fixed: z.array(FixedCell),
  // 복수 옵션 신청 (고정 칸 날짜 제외)
  requests: z.array(z.object({ date: IsoDate, options: z.array(RequestOption).min(1) })),
  // 기준 OFF − 누적 OFF (0.5 단위 가능)
  offTarget: z.number(),
  nightBankBefore: z.number().int(),
  nightMax: z.number().int().nonnegative(),
  // 권고 N 수. 전담이면 null
  nightTarget: z.number().int().nonnegative().nullable(),
  weekendMissedStreak: z.number().int().nonnegative(),
  // 1일(일)이 전월 마지막 토요일과 이어지는 주말
  weekendCarryIn: z.boolean(),
  shiftCountsBefore: z.object({ D: z.number().int(), E: z.number().int(), N: z.number().int() }),
  // D·E·N 분포 검사 대상 (전담·트레이닝 중 신규 제외)
  balanceShiftTypes: z.boolean(),
  // 최근 3개월 신청 불충족 수 (Q3 가산)
  requestMissBefore: z.number().int().nonnegative(),
})

export const SolverRequest = z.object({
  contractVersion: z.literal(SOLVER_CONTRACT_VERSION),
  seed: z.number().int().nonnegative(),
  timeLimitSec: z.number().positive().max(60),
  days: z.array(IsoDate).min(28).max(31),
  // 대상 월과 전월 꼬리의 빨간 날
  redDays: z.array(IsoDate),
  prevTail: z.array(SolverCell),
  nurses: z.array(SolverNurse),
  // 수간호사 고정 칸 (인원 보충 계산용)
  heads: z.array(
    z.object({ id: z.string(), kTass: z.boolean(), junior: z.boolean(), cells: z.array(FixedCell) }),
  ),
  trainings: z.array(
    z.object({
      traineeId: z.string(),
      preceptorId: z.string(),
      startDate: IsoDate,
      endDate: IsoDate,
      tripleUntil: IsoDate,
      // 3인 배정 기간 뒤 인원에 세지 않을 N 남은 수 (R-STAFF-5)
      tripleNightsLeft: z.number().int().nonnegative(),
    }),
  ),
  rules: z.object({
    minStaff: z.number().int().positive(),
    minKTass: z.number().int().nonnegative(),
    minRestHours: z.number().int().positive(),
    maxConsecutiveNight: z.number().int().positive(),
    maxConsecutiveOff: z.number().int().positive(),
    offAfterNight: z.number().int().nonnegative(),
    sleepingOffPerN: z.number().int().positive(),
    forbiddenPatterns: z.array(z.string()),
    shiftBalanceTolerance: z.number().int().nonnegative(),
    shiftBalanceWindowMonths: z.number().int().positive(),
  }),
  // 앞 근무 종료 ~ 다음 날 근무 시작 시간 (TS SHIFT_TIMES에서 계산해 넘긴다)
  restHours: z.record(WorkCode, z.record(WorkCode, z.number())),
  // Q4: 생성마다 켜고 끄는 권고 항
  priorities: z.object({
    requests: z.boolean(),
    offAfterNight: z.boolean(),
    weekendPair: z.boolean(),
    avoidJuniorOnly: z.boolean(),
    minimizeRepeatPairs: z.boolean(),
  }),
})

export const TERM_KEYS = [
  'offShortMax',
  'offShort',
  'offOver',
  'requestMissMax',
  'requestMiss',
  'headFill',
  'weekendPair',
  'weekendCarry',
  'nightTarget',
  'offAfterNight',
  'sleepingShort',
  'shiftBalance',
  'juniorOnly',
  'repeatPair',
  'tieBreak',
] as const

export const CAUSE_GROUPS = [
  'STAFF',
  'KTASS',
  'NIGHT_MAX',
  'NIGHT_CONSEC',
  'OFF_CONSEC',
  'TRAINING',
  'FIXED',
  'SLEEPING',
] as const

export const SolverCause = z.object({
  group: z.enum(CAUSE_GROUPS),
  userId: z.string().optional(),
  date: IsoDate.optional(),
  shift: Duty.optional(),
})

export const SolverResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['OPTIMAL', 'FEASIBLE']),
    cells: z.array(SolverCell),
    objective: z.object({ total: z.number().int(), terms: z.record(z.enum(TERM_KEYS), z.number().int()) }),
    wallTimeSec: z.number(),
    seed: z.number().int(),
    solverVersion: z.string(),
  }),
  z.object({ status: z.literal('INFEASIBLE'), causes: z.array(SolverCause), wallTimeSec: z.number() }),
  z.object({ status: z.literal('UNKNOWN'), wallTimeSec: z.number() }),
])

export type SolverCell = z.infer<typeof SolverCell>
export type SolverNurse = z.infer<typeof SolverNurse>
export type SolverRequest = z.infer<typeof SolverRequest>
export type SolverResponse = z.infer<typeof SolverResponse>
export type SolverCause = z.infer<typeof SolverCause>
export type TermKey = (typeof TERM_KEYS)[number]
export type CauseGroup = (typeof CAUSE_GROUPS)[number]
