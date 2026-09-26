import { isEmployed, type IsoDate } from '../dates'
import type { Grid } from '../grid'
import type { Staffing } from '../staffing'
import { DUTY_CODES, isRestCode, isWorkCode, type ScheduleInput, type TrainingSpan } from '../types'
import { violation, type Violation } from './rules'

// 날짜·듀티 단위 규칙: H-STAFF, H-KTASS, S-HEAD-FILL, S-JUNIOR-ONLY (R-STAFF-1~4)
export function checkDuties(input: ScheduleInput, grid: Grid, staffing: Staffing): Violation[] {
  const { minStaffPerShift, minKTass } = input.rules.params
  const out: Violation[] = []
  for (const d of grid.monthDates) {
    for (const s of DUTY_CODES) {
      const c = staffing.count(d, s)
      const staffShort = c.count + c.fallback < minStaffPerShift
      const kTassShort = c.kTass + c.fallbackKTass < minKTass
      if (staffShort)
        out.push(
          violation('H-STAFF', c.members, [d], { count: c.count + c.fallback, min: minStaffPerShift }, s),
        )
      if (kTassShort)
        out.push(violation('H-KTASS', c.members, [d], { count: c.kTass + c.fallbackKTass, min: minKTass }, s))
      if (!staffShort && !kTassShort && (c.count < minStaffPerShift || c.kTass < minKTass))
        out.push(violation('S-HEAD-FILL', c.members, [d], { count: c.count, kTass: c.kTass }, s))
      if (input.rules.toggles.avoidJuniorOnly && c.allJunior)
        out.push(violation('S-JUNIOR-ONLY', c.members, [d], {}, s))
    }
  }
  return out
}

// H-TRAINING: 둘 다 쉬거나 같은 근무. 한 명이라도 연차·휴가면 예외 (Q4)
export function checkTraining(t: TrainingSpan, grid: Grid): Violation[] {
  const out: Violation[] = []
  for (const d of grid.monthDates) {
    if (d < t.startDate || d > t.endDate) continue
    const a = grid.cellAt(t.traineeId, d)
    const b = grid.cellAt(t.preceptorId, d)
    if (!a || !b) continue
    if ([a.code, b.code].some((c) => c === 'AL' || c === 'LEAVE')) continue
    const same = (isRestCode(a.code) && isRestCode(b.code)) || a.code === b.code
    if (!same)
      out.push(
        violation('H-TRAINING', [t.traineeId, t.preceptorId], [d], {
          traineeCode: a.code,
          preceptorCode: b.code,
        }),
      )
  }
  return out
}

// S-REPEAT-PAIR: 같은 날 같은 듀티 횟수 ≥ max(4, ceil(2 × 쌍 평균)). 트레이닝 중 신규–프리셉터 쌍 제외
export const REPEAT_PAIR_MIN = 4

export function checkRepeatPairs(input: ScheduleInput, grid: Grid, staffing: Staffing): Violation[] {
  const people = input.nurses
    .filter((n) => n.rotation === 'rotating' && grid.monthDates.some((d) => isEmployed(n, d)))
    .map((n) => n.id)
    .sort()
  if (people.length < 2) return []
  const count = new Map<string, number>()
  const byId = new Map(input.nurses.map((n) => [n.id, n]))
  const isPrecepting = (a: string, b: string, d: IsoDate) => {
    const t = staffing.inTraining(a, d) ?? staffing.inTraining(b, d)
    return t !== undefined && [t.traineeId, t.preceptorId].sort().join('|') === [a, b].sort().join('|')
  }
  for (const d of grid.monthDates) {
    const working = people.filter((id) => {
      const c = grid.cellAt(id, d)
      return c && isWorkCode(c.code) && c.code !== 'S' && isEmployed(byId.get(id)!, d)
    })
    for (let i = 0; i < working.length; i++)
      for (let j = i + 1; j < working.length; j++) {
        const [a, b] = [working[i]!, working[j]!]
        if (grid.cellAt(a, d)!.code !== grid.cellAt(b, d)!.code || isPrecepting(a, b, d)) continue
        const key = `${a}|${b}`
        count.set(key, (count.get(key) ?? 0) + 1)
      }
  }
  const pairs = (people.length * (people.length - 1)) / 2
  const total = [...count.values()].reduce((s, v) => s + v, 0)
  const threshold = Math.max(REPEAT_PAIR_MIN, Math.ceil((2 * total) / pairs))
  const out: Violation[] = []
  for (const [key, c] of count)
    if (c >= threshold) out.push(violation('S-REPEAT-PAIR', key.split('|'), [], { count: c, threshold }))
  return out
}
