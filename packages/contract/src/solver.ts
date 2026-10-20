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
// 3-5: 규칙별 필수/권고 키 (@duty/domain SEVERITY_KEYS와 같아야 한다 — web 테스트가 확인)
export const SEVERITY_KEYS = [
  'REST',
  'PATTERN',
  'OFF_CONSEC',
  'WORK_CONSEC',
  'NIGHT_MAX',
  'NIGHT_MIN',
  'NIGHT_CONSEC',
  'SLEEPING',
  'OFF_AFTER_N',
  'STAFF',
  'KTAS',
  'TRAINING',
  'SHIFT_BALANCE',
  'WEEKEND_PAIR',
  'JUNIOR_ONLY',
  'REPEAT_PAIR',
  'EDU_LIMIT',
  'NIGHT_RESTART',
  'OFF_EVE',
  // 3-9
  'STAFF_MAX',
  // 3-10 7: 누적 OFF 최소·최대는 필수/권고를 따로 정한다
  'OFF_CARRY_MIN',
  'OFF_CARRY_MAX',
  'REQUEST',
] as const

export const SolverCell = z.object({
  userId: z.string(),
  date: IsoDate,
  code: Code,
  offKind: OffKind.optional(),
})

const FixedCell = z.object({ date: IsoDate, code: Code, offKind: OffKind.optional() })
// 2-11 R-HEAD-3: flex = 수간호사 기본 S 칸. 필수 인원을 달리 채울 수 없을 때만 솔버가 D로 바꾼다
const HeadCell = FixedCell.extend({ flex: z.boolean().optional() })

// 3-5: KTAS 자격 마지막 유효일. 이 날 뒤에는 KTAS 인원으로 세지 않는다(없으면 계속 유효)
const KtasUntil = IsoDate.nullable().optional()

export const SolverNurse = z.object({
  id: z.string(),
  kTass: z.boolean(),
  kTassUntil: KtasUntil,
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
  // 3-5 추가: 월 나이트 최소(근무 가능한 날만큼 비례, 0·전담·트레이닝 중 신규는 null). 예전 요청과 호환되도록 선택
  nightMin: z.number().int().nonnegative().nullable().optional(),
  weekendMissedStreak: z.number().int().nonnegative(),
  // 1일(일)이 전월 마지막 토요일과 이어지는 주말
  weekendCarryIn: z.boolean(),
  // 3-6: 본인이 주말 통 OFF를 원하지 않으면 false. 예전 요청과 호환되도록 선택(없으면 받음)
  weekendPair: z.boolean().optional(),
  // 3-8 H-OFF-EVE: N을 주지 않을 날(OFF만 신청한 날의 전날). 없으면 빈 목록
  noNightDates: z.array(IsoDate).optional(),
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
  // 다음 달이 이미 확정되었으면 그 달 초 칸(경계 규칙용 고정값). 없으면 생략
  nextHead: z.array(SolverCell).optional(),
  nurses: z.array(SolverNurse),
  // 수간호사 칸 (인원 계산용). flex 칸만 솔버가 S/D를 정한다
  heads: z.array(
    z.object({
      id: z.string(),
      kTass: z.boolean(),
      kTassUntil: KtasUntil,
      junior: z.boolean(),
      cells: z.array(HeadCell),
    }),
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
    // 최대 연속 근무. 예전 요청과 호환되도록 선택(R-1)
    maxConsecutiveWork: z.number().int().positive().optional(),
    offAfterNight: z.number().int().nonnegative(),
    sleepingOffPerN: z.number().int().positive(),
    forbiddenPatterns: z.array(z.string()),
    // 3-10 11: 금지 권고 패턴(항상 권고 — 나올 때마다 벌점). 예전 요청과 호환되도록 선택
    softPatterns: z.array(z.string()).optional(),
    shiftBalanceTolerance: z.number().int().nonnegative(),
    shiftBalanceWindowMonths: z.number().int().positive(),
    // 3-5: 필수(하드 제약)로 둘 규칙. 나머지는 벌점(권고)
    hard: z.array(z.enum(SEVERITY_KEYS)),
    // 3-8 S-NIGHT-RESTART: N 연속 뒤 1~3일 쉬고 다시 N 피하기(토글). 없으면 끔
    avoidNightRestart: z.boolean().optional(),
    // 3-9 10: 듀티당 최대 인원(최소 인원과 같은 셈법). 없으면 제한 없음
    maxStaff: z.number().int().positive().optional(),
    // 3-9 13: 월말 누적 OFF 범위. 월말 누적 = 월초 + 실제 OFF − 기준 OFF = 실제 OFF − offTarget. 없으면 제한 없음
    offCarryMin: z.number().int().optional(),
    offCarryMax: z.number().int().optional(),
  }),
  // 앞 근무 종료 ~ 다음 날 근무 시작 시간 (TS SHIFT_TIMES에서 계산해 넘긴다)
  restHours: z.record(WorkCode, z.record(WorkCode, z.number())),
  // Q4: 생성마다 켜고 끄는 권고 항. 3-5: 필수로 둔 규칙은 켜진 채로 온다
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
  'workConsec',
  'offAfterNight',
  'sleepingShort',
  'shiftBalance',
  'reverseRotation',
  'juniorOnly',
  'repeatPair',
  'tieBreak',
  // 3-5: 권고로 낮춘 필수 규칙의 벌점
  'staffShort',
  'ktasShort',
  'training',
  'rest',
  'pattern',
  'nightMax',
  'nightConsec',
  'offConsec',
  'sleepingOver',
  // 3-5 추가: 월 나이트 최소에 모자란 수
  'nightMin',
  // 3-8
  'nightRestart',
  'offEve',
  // 3-9: 필수를 권고로 낮췄을 때
  'staffOver',
  'offCarry',
  // 3-10 11: 금지 권고 패턴
  'softPattern',
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
  // 3-5: 필수로 올린 권고 규칙과 예전에 이름 없던 하드 제약
  'REST',
  'PATTERN',
  'WORK_CONSEC',
  'OFF_AFTER_N',
  'SHIFT_BALANCE',
  'WEEKEND_PAIR',
  'JUNIOR_ONLY',
  'REPEAT_PAIR',
  'NIGHT_MIN',
  'NIGHT_RESTART',
  'OFF_EVE',
  // 3-9
  'STAFF_MAX',
  'OFF_CARRY_MIN',
  'OFF_CARRY_MAX',
  'REQUEST',
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
    // 2-11 R-HEAD-5: 솔버가 D로 바꾼 수간호사 flex 칸 (없으면 생략)
    headFill: z.array(z.object({ userId: z.string(), date: IsoDate })).optional(),
    objective: z.object({ total: z.number().int(), terms: z.record(z.enum(TERM_KEYS), z.number().int()) }),
    wallTimeSec: z.number(),
    seed: z.number().int(),
    solverVersion: z.string(),
  }),
  z.object({
    status: z.literal('INFEASIBLE'),
    causes: z.array(SolverCause),
    // 3-10 13: 원인 증명이 시간 안에 안 끝났을 때, 하나만 권고로 풀면 해가 나오는 필수 규칙
    relaxable: z.array(z.enum(SEVERITY_KEYS)).optional(),
    wallTimeSec: z.number(),
  }),
  z.object({ status: z.literal('UNKNOWN'), wallTimeSec: z.number() }),
])

export type SolverCell = z.infer<typeof SolverCell>
export type SolverNurse = z.infer<typeof SolverNurse>
export type SolverRequest = z.infer<typeof SolverRequest>
export type SolverResponse = z.infer<typeof SolverResponse>
export type SolverCause = z.infer<typeof SolverCause>
export type TermKey = (typeof TERM_KEYS)[number]
export type CauseGroup = (typeof CAUSE_GROUPS)[number]
