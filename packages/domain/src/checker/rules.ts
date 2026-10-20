import type { IsoDate } from '../dates'
import type { DutyCode } from '../types'

// Build Spec 2-2 domain-entities §4. 확장 시 추가만.
export const HARD_RULE_IDS = [
  'H-CELL',
  'H-PATTERN',
  'H-REST',
  'H-NIGHT-MAX',
  'H-NIGHT-CONSEC',
  'H-OFF-CONSEC',
  'H-STAFF',
  'H-KTASS',
  'H-TRAINING',
  'H-SPECIAL-REQ',
  'H-SLEEPING',
  'H-EDU-UNION',
  'H-EDU-LIMIT',
  'H-BALANCE',
  // 3-8: 신청한 OFF 전날 N 금지(전날 N을 포함해 신청했으면 예외)
  'H-OFF-EVE',
  // 3-9: 듀티당 최대 인원 초과, 월말 누적 OFF 범위 밖
  'H-STAFF-MAX',
  'H-OFF-CARRY',
] as const

export const SOFT_RULE_IDS = [
  'S-NIGHT-MIN',
  'S-WORK-CONSEC',
  'S-OFF-AFTER-N',
  'S-WEEKEND-PAIR',
  'S-WEEKEND-CARRY',
  'S-SHIFT-BALANCE',
  'S-HEAD-FILL',
  'S-JUNIOR-ONLY',
  'S-REPEAT-PAIR',
  'S-REQUEST',
  // 3-8: N 연속 뒤 1~3일 쉬고 다시 N으로 시작
  'S-NIGHT-RESTART',
  // 3-10 11: 금지 권고 패턴(늘 권고). 3-10 12에서 S-NIGHT-TARGET(월 나이트 목표)은 없앴다
  'S-SOFT-PATTERN',
] as const

export type HardRuleId = (typeof HARD_RULE_IDS)[number]
export type SoftRuleId = (typeof SOFT_RULE_IDS)[number]
export type RuleId = HardRuleId | SoftRuleId

export type Violation = {
  ruleId: RuleId
  severity: 'hard' | 'soft'
  userIds: string[]
  dates: IsoDate[]
  shift?: DutyCode
  data: Record<string, string | number | boolean>
}

export type CheckResult = { hardViolations: Violation[]; softWarnings: Violation[] }

const HARD = new Set<string>(HARD_RULE_IDS)

export function violation(
  ruleId: RuleId,
  userIds: string[],
  dates: IsoDate[],
  data: Violation['data'] = {},
  shift?: DutyCode,
): Violation {
  const v: Violation = { ruleId, severity: HARD.has(ruleId) ? 'hard' : 'soft', userIds, dates, data }
  if (shift) v.shift = shift
  return v
}
