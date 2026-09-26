import { z } from 'zod'

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
  workDaysPerWeek: positiveInt.max(7),
  maxNightPerMonth: positiveInt,
  targetNightPerMonth: positiveInt,
  maxConsecutiveNight: positiveInt,
  offAfterNight: z.number().int().nonnegative(),
  minStaffPerShift: positiveInt,
  minKTass: z.number().int().nonnegative(),
  newbieTripleWeeks: z.number().int().nonnegative(),
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
})

export const RuleSetSchema = z.object({
  params: RuleParamsSchema,
  toggles: RuleTogglesSchema,
  forbiddenPatterns: z.array(z.string().regex(PATTERN_REGEX)),
})

export type RuleParams = z.infer<typeof RuleParamsSchema>
export type RuleToggles = z.infer<typeof RuleTogglesSchema>
export type RuleSet = z.infer<typeof RuleSetSchema>

// rule_versions v1. 핸드오프 S11 항목/기본값 + 요구사항 원문(야간 운영 지침 §1·§3, 응급실 지침 §6)의 수치.
export const DEFAULT_RULES: RuleSet = {
  params: {
    minRestHours: 16,
    maxConsecutiveOff: 10,
    workDaysPerWeek: 5,
    maxNightPerMonth: 7,
    targetNightPerMonth: 6,
    maxConsecutiveNight: 3,
    offAfterNight: 2,
    minStaffPerShift: 2,
    minKTass: 1,
    newbieTripleWeeks: 3,
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
  },
  forbiddenPatterns: ['E-D', 'N-E', 'N-off-D', 'E-S'].map(normalizePattern),
}
