import { redDaySet } from '../dates'
import { buildGrid } from '../grid'
import { createStaffing } from '../staffing'
import type { ScheduleInput } from '../types'
import { checkDuties, checkRepeatPairs, checkTraining } from './duty'
import { checkPerson } from './person'
import type { CheckResult, Violation } from './rules'

export * from './rules'
export { hasWeekendPair, restHoursBetween } from './person'
export { REPEAT_PAIR_MIN } from './duty'

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// INV1: (ruleId, 첫 날짜, 첫 userId, shift) 순. 동률은 나머지 날짜·사람으로 끊는다
function compare(a: Violation, b: Violation): number {
  return (
    cmp(a.ruleId, b.ruleId) ||
    cmp(a.dates[0] ?? '', b.dates[0] ?? '') ||
    cmp(a.userIds[0] ?? '', b.userIds[0] ?? '') ||
    cmp(a.shift ?? '', b.shift ?? '') ||
    cmp(a.dates.join(), b.dates.join()) ||
    cmp(a.userIds.join(), b.userIds.join()) ||
    cmp(JSON.stringify(a.data), JSON.stringify(b.data))
  )
}

// 1-2 §9 검사기 계약. 순수·결정적 함수 (business-logic-model §2.4)
export function checkSchedule(input: ScheduleInput): CheckResult {
  const grid = buildGrid(input)
  const staffing = createStaffing(input, grid)
  const requests = new Map(input.requests.map((r) => [`${r.userId}|${r.date}`, r]))
  const ctx = { input, grid, redDays: redDaySet(input.holidays), requests }

  const out: Violation[] = []
  for (const n of input.nurses) if (n.rotation === 'rotating') out.push(...checkPerson(n, ctx))
  for (const t of input.trainings) out.push(...checkTraining(t, grid))
  out.push(...checkDuties(input, grid, staffing))
  if (input.rules.toggles.minimizeRepeatPairs) out.push(...checkRepeatPairs(input, grid, staffing))

  // H-TRAINING은 [신규, 프리셉터] 순서가 의미를 가진다
  for (const v of out) if (v.ruleId !== 'H-TRAINING') v.userIds.sort()
  out.sort(compare)
  return {
    hardViolations: out.filter((v) => v.severity === 'hard'),
    softWarnings: out.filter((v) => v.severity === 'soft'),
  }
}
