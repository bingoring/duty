import { z } from 'zod'

// 3-7d 의사 솔버(`POST /solve/doctor`) 입출력 계약의 SoT. 간호사 모델과 따로 둔 작은 CP-SAT 모델이다.
// Python 쪽(services/solver/solver/doctor.py)은 손으로 맞춘다 — 통합 테스트가 실제 호출로 확인한다.
export const DOCTOR_CONTRACT_VERSION = 1

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const DOCTOR_SHIFTS = ['D', 'N'] as const
// 고정 조건의 근무 종류: D · N · 근무(ANY = D나 N 중 하나라도)
export const DOCTOR_RULE_SHIFTS = ['D', 'N', 'ANY'] as const
// 신청 옵션: O(휴무) · D만 · N만 · 올데이(같은 날 D+N)
export const DOCTOR_REQUEST_OPTIONS = ['D', 'N', 'O', 'ALLDAY'] as const

const RuleShift = z.enum(DOCTOR_RULE_SHIFTS)
const RequestOption = z.enum(DOCTOR_REQUEST_OPTIONS)

export const DoctorSolverDoctor = z.object({
  id: z.string(),
  // 이 달 D·N 개수(하드). 31일 달 +1 대상이면 7
  dCount: z.number().int().nonnegative(),
  nCount: z.number().int().nonnegative(),
  // 한 달 올데이 개수 범위(권고). null이면 제한 없음
  allDayMin: z.number().int().nonnegative().nullable(),
  allDayMax: z.number().int().nonnegative().nullable(),
  // 고정 조건을 날짜로 펼친 것(하드). 그 날만 예외로 한 날은 빠져 있다
  fixed: z.array(z.object({ date: IsoDate, shift: RuleShift, type: z.enum(['require', 'forbid']) })),
  // 신청(권고). options 중 하나면 지킨 것
  requests: z.array(z.object({ date: IsoDate, options: z.array(RequestOption).min(1) })),
})

export const DoctorSolverRequest = z.object({
  contractVersion: z.literal(DOCTOR_CONTRACT_VERSION),
  seed: z.number().int().nonnegative(),
  timeLimitSec: z.number().positive().max(60),
  days: z.array(IsoDate).min(28).max(31),
  doctors: z.array(DoctorSolverDoctor).min(1),
  // 전월 마지막 날 Night 의사(월초 N → 다음 날 D 피하기용). 없으면 null
  prevLastNight: z.string().nullable(),
})

export const DOCTOR_TERM_KEYS = [
  'requestMiss',
  'requestMissMax',
  'allDayOut',
  'nightToDay',
  'tieBreak',
] as const

export const DoctorSolverShift = z.object({ date: IsoDate, day: z.string(), night: z.string() })

export const DoctorSolverResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.enum(['OPTIMAL', 'FEASIBLE']),
    shifts: z.array(DoctorSolverShift),
    objective: z.object({
      total: z.number().int(),
      terms: z.record(z.enum(DOCTOR_TERM_KEYS), z.number().int()),
    }),
    wallTimeSec: z.number(),
    seed: z.number().int(),
    solverVersion: z.string(),
  }),
  z.object({
    status: z.literal('INFEASIBLE'),
    // COUNT = 개수 합이 날짜와 안 맞거나 개수 자체가 불가능, FIXED = 고정 조건끼리·개수와 충돌
    causes: z.array(
      z.object({
        kind: z.enum(['COUNT', 'FIXED']),
        userId: z.string().optional(),
        date: IsoDate.optional(),
      }),
    ),
    wallTimeSec: z.number(),
  }),
  z.object({ status: z.literal('UNKNOWN'), wallTimeSec: z.number() }),
])

export type DoctorRuleShift = (typeof DOCTOR_RULE_SHIFTS)[number]
export type DoctorRequestOption = (typeof DOCTOR_REQUEST_OPTIONS)[number]
export type DoctorSolverDoctor = z.infer<typeof DoctorSolverDoctor>
export type DoctorSolverRequest = z.infer<typeof DoctorSolverRequest>
export type DoctorSolverResponse = z.infer<typeof DoctorSolverResponse>
export type DoctorSolverShift = z.infer<typeof DoctorSolverShift>
