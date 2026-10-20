import { z } from 'zod'
import { DEFAULT_SEVERITY, RuleSeveritySchema } from './rule-severity'

// 금지 패턴 문법: 근무 코드 2개 이상을 '-'로 연결 (예: E-D, N-OFF-D)
export const PATTERN_REGEX = /^(D|E|N|S|OFF)(-(D|E|N|S|OFF))+$/

export function normalizePattern(pattern: string): string {
  return pattern
    .trim()
    .split('-')
    .map((part) => part.toUpperCase())
    .join('-')
}

const positiveInt = z.number().int().positive()

export const RuleParamsSchema = z.object({
  minRestHours: positiveInt,
  maxConsecutiveOff: positiveInt,
  // 최대 연속 근무(권고, 넘으면 경고·솔버 벌점). 예전 규칙 버전에는 없으므로 기본값으로 채운다(R-1, DECISIONS 2026-10-08)
  maxConsecutiveWork: positiveInt.max(14).default(5),
  maxNightPerMonth: positiveInt,
  // 3-5 추가: 월 나이트 하한(0 = 사용 안 함)
  minNightPerMonth: z.number().int().min(0).max(31).default(0),
  // 3-10 12: 월 나이트 목표(targetNightPerMonth)는 없앴다. 예전 버전 값은 z.object가 버린다
  maxConsecutiveNight: positiveInt,
  offAfterNight: z.number().int().nonnegative(),
  minStaffPerShift: positiveInt,
  // 3-9 10: 듀티당 최대 인원(넘는 사람은 OFF). 예전 버전은 기본값
  maxStaffPerShift: positiveInt.max(10).default(2),
  // 3-9 13: 월말 누적 OFF 범위(−면 덜 쉰 것, +면 더 쉰 것)
  offCarryMin: z.number().int().min(-31).max(0).default(-3),
  offCarryMax: z.number().int().min(0).max(31).default(3),
  minKTass: z.number().int().nonnegative(),
  newbieTripleWeeks: z.number().int().nonnegative(),
  // 2-2에서 추가. 예전 규칙 버전(jsonb)에는 없으므로 기본값으로 채운다
  experiencedTripleWeeks: z.number().int().nonnegative().default(2),
  tripleNightCount: z.number().int().nonnegative().default(3),
  // 한 사람의 D·E·N 개수 차이 허용치 (사용자 요청 2026-09-27)
  shiftBalanceTolerance: z.number().int().nonnegative().default(2),
  // 누적 D·E·N 분포를 보는 기간(이번 달 포함). 1이면 누적 검사 안 함
  shiftBalanceWindowMonths: positiveInt.default(3),
  eduContPerYear: z.number().int().nonnegative().default(1),
  eduUnionPerYear: z.number().int().nonnegative().default(2),
  trainingMonths: positiveInt,
  sleepingOffPerN: positiveInt,
  requestDeadlineDay: positiveInt.max(28),
  negotiationStartDay: positiveInt.max(31),
  negotiationEndDay: positiveInt.max(31),
  nightDedicatedMaxPerMonth: positiveInt,
  nightDedicatedMaxPerMonth31: positiveInt,
  nightDedicatedMinMonths: positiveInt,
  nightDedicatedMaxMonths: positiveInt,
})

export const RuleTogglesSchema = z.object({
  weekendPairOffMonthly: z.boolean(),
  avoidJuniorOnly: z.boolean(),
  minimizeRepeatPairs: z.boolean(),
  nightDedicated: z.boolean(),
  balanceShiftTypes: z.boolean().default(true),
  // 3-8
  avoidNightRestart: z.boolean().default(true),
  offEveNoNight: z.boolean().default(true),
})

export const RuleSetSchema = z.object({
  params: RuleParamsSchema,
  toggles: RuleTogglesSchema,
  forbiddenPatterns: z.array(z.string().regex(PATTERN_REGEX)),
  // 3-10 11: 금지 권고 패턴(늘 권고 — 지키지 못하면 벌점). 문법은 금지 패턴과 같고, 두 목록에 같은 패턴은 없다
  softPatterns: z.array(z.string().regex(PATTERN_REGEX)).default([]),
  // 3-5: 규칙별 필수/권고. 예전 버전은 기본값
  severity: RuleSeveritySchema,
})

export type RuleParams = z.infer<typeof RuleParamsSchema>
export type RuleToggles = z.infer<typeof RuleTogglesSchema>
export type RuleSet = z.infer<typeof RuleSetSchema>

// rule_versions v1. 핸드오프 S11 항목/기본값 + 요구사항 원문(야간 운영 지침 §1·§3, 응급실 지침 §6)의 수치.
// maxConsecutiveOff 15와 신규 3인 근무 수치는 사용자 답변(DECISIONS 2026-09-27 Q2·Q5).
export const DEFAULT_RULES: RuleSet = {
  params: {
    minRestHours: 16,
    maxConsecutiveOff: 15,
    maxConsecutiveWork: 5,
    maxNightPerMonth: 7,
    minNightPerMonth: 0,
    maxConsecutiveNight: 3,
    offAfterNight: 2,
    minStaffPerShift: 2,
    maxStaffPerShift: 2,
    offCarryMin: -3,
    offCarryMax: 3,
    minKTass: 1,
    newbieTripleWeeks: 3,
    experiencedTripleWeeks: 2,
    tripleNightCount: 3,
    shiftBalanceTolerance: 2,
    shiftBalanceWindowMonths: 3,
    eduContPerYear: 1,
    eduUnionPerYear: 2,
    trainingMonths: 3,
    sleepingOffPerN: 6,
    requestDeadlineDay: 15,
    negotiationStartDay: 16,
    negotiationEndDay: 20,
    nightDedicatedMaxPerMonth: 15,
    nightDedicatedMaxPerMonth31: 16,
    nightDedicatedMinMonths: 1,
    nightDedicatedMaxMonths: 6,
  },
  toggles: {
    weekendPairOffMonthly: true,
    avoidJuniorOnly: true,
    minimizeRepeatPairs: true,
    nightDedicated: false,
    balanceShiftTypes: true,
    avoidNightRestart: true,
    offEveNoNight: true,
  },
  forbiddenPatterns: ['E-D', 'N-E', 'N-off-D', 'E-S'].map(normalizePattern),
  softPatterns: [],
  severity: { ...DEFAULT_SEVERITY },
}
