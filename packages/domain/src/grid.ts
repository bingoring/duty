import { addDays, isIsoDate, monthDates, type IsoDate } from './dates'
import type { RuleSet } from './rules-defaults'
import { DomainInputError, isRestCode, type GridCell, type ScheduleInput } from './types'

// 전월 꼬리 길이 (R-SCOPE-4): 월 경계에 걸친 연속 구간·패턴을 잡는 데 필요한 일수
export function requiredTailDays(rules: RuleSet): number {
  const longestPattern = Math.max(0, ...rules.forbiddenPatterns.map((p) => p.split('-').length))
  const p = rules.params
  return Math.max(p.maxConsecutiveOff, p.maxConsecutiveNight, longestPattern - 1, p.offAfterNight + 1)
}

// 금지 패턴 토큰: 근무 칸은 코드, 쉬는 칸(OFF·AL·LEAVE)은 OFF, 칸 없음은 어떤 패턴과도 불일치 (Q3)
export type PatternToken = 'D' | 'E' | 'N' | 'S' | 'OFF' | '∅'

export function patternToken(cell: GridCell | undefined): PatternToken {
  if (!cell) return '∅'
  return isRestCode(cell.code) ? 'OFF' : (cell.code as PatternToken)
}

export type Grid = {
  tailStart: IsoDate
  monthStart: IsoDate
  monthEnd: IsoDate
  monthDates: IsoDate[]
  // 다음 달 앞쪽 끝(말일 + requiredTailDays)
  headEnd: IsoDate
  // 꼬리 시작일 ~ headEnd. 다음 달 칸은 nextHead가 있을 때만 채워진다
  timeline: IsoDate[]
  cellAt(userId: string, date: IsoDate): GridCell | undefined
  inMonth(date: IsoDate): boolean
}

function fail(msg: string): never {
  throw new DomainInputError(msg)
}

function checkCell(c: GridCell) {
  if (!isIsoDate(c.date)) fail(`잘못된 날짜: ${c.date}`)
  if ((c.code === 'OFF') !== (c.offKind !== undefined))
    fail(`${c.userId} ${c.date}: OFF 칸과 offKind가 맞지 않음`)
  if ((c.code === 'LEAVE') !== (c.leaveKind !== undefined))
    fail(`${c.userId} ${c.date}: LEAVE 칸과 leaveKind가 맞지 않음`)
}

// 입력을 검증하고 색인한다 (business-rules §2). 위반이 아니라 호출자 버그이므로 throw한다
export function buildGrid(input: ScheduleInput): Grid {
  const days = monthDates(input.year, input.month)
  const monthStart = days[0]!
  const monthEnd = days.at(-1)!
  const tailDays = requiredTailDays(input.rules)
  const tailStart = addDays(monthStart, -tailDays)
  const headEnd = addDays(monthEnd, tailDays)

  const ids = new Set<string>()
  for (const n of input.nurses) {
    if (ids.has(n.id)) fail(`간호사 id 중복: ${n.id}`)
    ids.add(n.id)
  }
  for (const t of input.trainings) {
    if (!ids.has(t.traineeId) || !ids.has(t.preceptorId)) fail(`트레이닝 대상이 명단에 없음: ${t.traineeId}`)
    if (!(t.startDate <= t.tripleStaffUntil && t.tripleStaffUntil <= t.endDate))
      fail(`트레이닝 기간이 맞지 않음: ${t.traineeId}`)
  }

  const byKey = new Map<string, GridCell>()
  const add = (c: GridCell, from: IsoDate, to: IsoDate) => {
    checkCell(c)
    if (!ids.has(c.userId)) fail(`명단에 없는 사람의 칸: ${c.userId}`)
    if (c.date < from || c.date > to) fail(`범위 밖 칸: ${c.userId} ${c.date}`)
    const key = `${c.userId}|${c.date}`
    if (byKey.has(key)) fail(`칸 중복: ${key}`)
    byKey.set(key, c)
  }
  for (const c of input.cells) add(c, monthStart, monthEnd)
  for (const c of input.prevTail) add(c, tailStart, addDays(monthStart, -1))
  for (const c of input.nextHead) add(c, addDays(monthEnd, 1), headEnd)

  const timeline: IsoDate[] = []
  for (let d = tailStart; d <= headEnd; d = addDays(d, 1)) timeline.push(d)

  return {
    tailStart,
    monthStart,
    monthEnd,
    monthDates: days,
    headEnd,
    timeline,
    cellAt: (userId, date) => byKey.get(`${userId}|${date}`),
    inMonth: (date) => date >= monthStart && date <= monthEnd,
  }
}
