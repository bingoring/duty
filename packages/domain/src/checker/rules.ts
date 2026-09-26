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
] as const

export const SOFT_RULE_IDS = [
  'S-NIGHT-TARGET',
  'S-OFF-AFTER-N',
  'S-WEEKEND-PAIR',
  'S-WEEKEND-CARRY',
  'S-SHIFT-BALANCE',
  'S-HEAD-FILL',
  'S-JUNIOR-ONLY',
  'S-REPEAT-PAIR',
  'S-REQUEST',
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
