import { optionsSatisfied, specialSatisfied } from '../cell-source'
import { addDays, dayOfWeek, isEmployed, isRedDay, type IsoDate } from '../dates'
import { patternToken, type Grid } from '../grid'
import { SHIFT_TIMES } from '../shift-times'
import {
  isRestCode,
  isWorkCode,
  type GridCell,
  type NurseProfile,
  type RequestEntry,
  type ScheduleInput,
} from '../types'
import { violation, type Violation } from './rules'

// D·E·N이 이보다 적은 달(휴가가 긴 달 등)은 분포를 따지지 않는다
export const SHIFT_BALANCE_MIN_WORK = 9

// 한 사람에 대한 규칙 (business-rules §1.2·§1.3 사람 단위)
export type PersonCtx = {
  input: ScheduleInput
  grid: Grid
  redDays: ReadonlySet<IsoDate>
  requests: ReadonlyMap<string, RequestEntry>
  // 대상 월에 트레이닝 중인 신규 (프리셉터를 따라가므로 D·E·N 분포 검사 제외)
  trainees: ReadonlySet<string>
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}

// 앞 근무 종료 ~ 다음 날 근무 시작 (시간)
export function restHoursBetween(a: keyof typeof SHIFT_TIMES, b: keyof typeof SHIFT_TIMES): number {
  const end = minutes(SHIFT_TIMES[a].end) + (SHIFT_TIMES[a].endsNextDay ? 1440 : 0)
  return (1440 + minutes(SHIFT_TIMES[b].start) - end) / 60
}

// 토요일이 속한 달로 센다. 일요일이 다음 달 1일이고 칸을 모르면(undefined) 달성 예정으로 본다
export function hasWeekendPair(
  restAt: (d: IsoDate) => boolean | undefined,
  monthDates: readonly IsoDate[],
): boolean {
  return monthDates.some((d) => {
    if (dayOfWeek(d) !== 6 || restAt(d) !== true) return false
    return restAt(addDays(d, 1)) !== false
  })
}

export function checkPerson(n: NurseProfile, ctx: PersonCtx): Violation[] {
  const { input, grid } = ctx
  const p = input.rules.params
  const out: Violation[] = []
  const at = (d: IsoDate) => grid.cellAt(n.id, d)
  const code = (d: IsoDate) => at(d)?.code
  const touchesMonth = (dates: IsoDate[]) => dates.some(grid.inMonth)
  const month = grid.monthDates

  // H-CELL
  const missing = month.filter((d) => isEmployed(n, d) && !at(d))
  if (missing.length) out.push(violation('H-CELL', [n.id], missing, { kind: 'missing' }))
  const outside = month.filter((d) => !isEmployed(n, d) && at(d))
  if (outside.length) out.push(violation('H-CELL', [n.id], outside, { kind: 'outside' }))

  // H-PATTERN: 타임라인 위 창 이동, 대상 월 날짜를 포함하는 창만
  const tokens = grid.timeline.map((d) => patternToken(at(d)))
  for (const pattern of input.rules.forbiddenPatterns) {
    const parts = pattern.split('-')
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      if (!parts.every((t, k) => tokens[i + k] === t)) continue
      const dates = grid.timeline.slice(i, i + parts.length)
      if (touchesMonth(dates)) out.push(violation('H-PATTERN', [n.id], dates, { pattern }))
    }
  }

  // H-REST: 서로 다른 근무 코드가 이어질 때만
  for (let i = 0; i + 1 < grid.timeline.length; i++) {
    const [d1, d2] = [grid.timeline[i]!, grid.timeline[i + 1]!]
    const [a, b] = [code(d1), code(d2)]
    if (!a || !b || !isWorkCode(a) || !isWorkCode(b) || a === b || !touchesMonth([d1, d2])) continue
    const restHours = restHoursBetween(a, b)
    if (restHours < p.minRestHours)
      out.push(violation('H-REST', [n.id], [d1, d2], { from: a, to: b, restHours, min: p.minRestHours }))
  }

  // H-NIGHT-CONSEC · H-OFF-CONSEC: 타임라인 전체의 연속 구간, 대상 월을 포함하는 구간만
  const runs = (member: (c: GridCell) => boolean, weight: (c: GridCell) => number) => {
    const found: { dates: IsoDate[]; count: number }[] = []
    let cur: { dates: IsoDate[]; count: number } | null = null
    for (const d of grid.timeline) {
      const c = at(d)
      if (c && member(c)) {
        cur ??= { dates: [], count: 0 }
        cur.dates.push(d)
        cur.count += weight(c)
      } else if (cur) {
        found.push(cur)
        cur = null
      }
    }
    if (cur) found.push(cur)
    return found.filter((r) => touchesMonth(r.dates))
  }
  for (const r of runs(
    (c) => c.code === 'N',
    () => 1,
  ))
    if (r.count > p.maxConsecutiveNight)
      out.push(violation('H-NIGHT-CONSEC', [n.id], r.dates, { count: r.count, max: p.maxConsecutiveNight }))
  // 휴가(LEAVE)는 세지 않되 연속을 끊지 않는다 (Q2)
  for (const r of runs(
    (c) => isRestCode(c.code),
    (c) => (c.code === 'LEAVE' ? 0 : 1),
  ))
    if (r.count > p.maxConsecutiveOff)
      out.push(violation('H-OFF-CONSEC', [n.id], r.dates, { count: r.count, max: p.maxConsecutiveOff }))

  // H-NIGHT-MAX · S-NIGHT-TARGET · H-SLEEPING
  const monthCells = month.map(at).filter((c): c is GridCell => c !== undefined)
  const nightDates = monthCells.filter((c) => c.code === 'N').map((c) => c.date)
  const nights = nightDates.length
  const dedicated =
    input.rules.toggles.nightDedicated &&
    n.nightDedicated !== null &&
    n.nightDedicated.from <= grid.monthEnd &&
    n.nightDedicated.to >= grid.monthStart
  const nightMax = dedicated
    ? month.length === 31
      ? p.nightDedicatedMaxPerMonth31
      : p.nightDedicatedMaxPerMonth
    : p.maxNightPerMonth
  if (nights > nightMax)
    out.push(violation('H-NIGHT-MAX', [n.id], nightDates, { count: nights, max: nightMax }))
  else if (!dedicated && nights > p.targetNightPerMonth)
    out.push(
      violation('S-NIGHT-TARGET', [n.id], nightDates, { count: nights, target: p.targetNightPerMonth }),
    )

  const sleepingDates = monthCells.filter((c) => c.offKind === 'sleeping').map((c) => c.date)
  const allowed = Math.floor((n.nightBankBefore + nights) / p.sleepingOffPerN)
  if (sleepingDates.length > allowed)
    out.push(
      violation('H-SLEEPING', [n.id], sleepingDates, {
        count: sleepingDates.length,
        allowed,
        bank: n.nightBankBefore,
        nights,
      }),
    )

  // S-OFF-AFTER-N: 전월 꼬리에서 끝난 N 구간도 본다(10/31 N → 11/1 OFF → 11/2 E). 다음 근무가 말일 뒤면 판단하지 않는다
  for (const d of grid.timeline) {
    if (code(d) !== 'N' || code(addDays(d, 1)) === 'N') continue
    const dates = [d]
    let next = addDays(d, 1)
    while (next <= grid.monthEnd && at(next) && isRestCode(at(next)!.code)) {
      dates.push(next)
      next = addDays(next, 1)
    }
    const nextCell = next <= grid.monthEnd ? at(next) : undefined
    const rest = dates.length - 1
    if (!nextCell || rest === 0 || rest >= p.offAfterNight || !touchesMonth([...dates, next])) continue
    out.push(violation('S-OFF-AFTER-N', [n.id], [...dates, next], { rest, next: nextCell.code }))
  }

  // H-SPECIAL-REQ · S-REQUEST
  for (const d of month) {
    const r = ctx.requests.get(`${n.id}|${d}`)
    const c = at(d)
    if (!r || !c) continue
    if (r.special) {
      if (!specialSatisfied(c, r.special))
        out.push(violation('H-SPECIAL-REQ', [n.id], [d], { special: r.special, code: c.code }))
    } else if (c.code !== 'AL' && c.code !== 'LEAVE' && !optionsSatisfied(c, r.options)) {
      out.push(violation('S-REQUEST', [n.id], [d], { options: r.options.join('/'), code: c.code }))
    }
  }

  // H-EDU-UNION
  for (const c of monthCells) {
    if (c.offKind !== 'edu_union') continue
    if (!n.unionMember) out.push(violation('H-EDU-UNION', [n.id], [c.date], { reason: 'not_member' }))
    else if (isRedDay(c.date, ctx.redDays))
      out.push(violation('H-EDU-UNION', [n.id], [c.date], { reason: 'red_day' }))
  }

  // S-WEEKEND-PAIR · S-WEEKEND-CARRY
  if (input.rules.toggles.weekendPairOffMonthly) {
    const restAt = (d: IsoDate): boolean | undefined => {
      const c = at(d)
      if (!c) return d > grid.monthEnd ? undefined : false
      return isRestCode(c.code)
    }
    if (month.some((d) => isEmployed(n, d)) && !hasWeekendPair(restAt, month))
      out.push(violation('S-WEEKEND-PAIR', [n.id], [], { consecutive: n.weekendPairMissedLastMonth }))
    const first = grid.monthStart
    const firstCell = at(first)
    if (n.weekendPairCarryIn && dayOfWeek(first) === 0 && firstCell && !isRestCode(firstCell.code))
      out.push(violation('S-WEEKEND-CARRY', [n.id], [addDays(first, -1), first], { code: firstCell.code }))
  }

  // S-SHIFT-BALANCE: 한 사람의 D·E·N 개수 차이
  if (input.rules.toggles.balanceShiftTypes && !dedicated && !ctx.trainees.has(n.id)) {
    const c = { D: 0, E: 0, N: 0 }
    for (const x of monthCells) if (x.code === 'D' || x.code === 'E' || x.code === 'N') c[x.code]++
    const spread = Math.max(c.D, c.E, c.N) - Math.min(c.D, c.E, c.N)
    const tolerance = p.shiftBalanceTolerance
    if (c.D + c.E + c.N >= SHIFT_BALANCE_MIN_WORK && spread > tolerance)
      out.push(violation('S-SHIFT-BALANCE', [n.id], [], { ...c, spread, tolerance }))
  }

  return out
}
