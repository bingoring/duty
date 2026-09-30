import type { LeaveKind, OffKind, ShiftCode } from './allowed-sets'
import { checkSchedule, type CheckResult, type Violation } from './checker'
import { isEmployed, type IsoDate } from './dates'
import type { DutyCode, GridCell, ScheduleInput } from './types'

// Build Spec 2-7 domain-entities §1 — 관리자 칸 편집안
export type CellEdit = {
  userId: string
  date: IsoDate
  // 편집을 시작할 때 본 값 (저장 시 동시 수정 검사, R-ADJ-7)
  before: { code: ShiftCode; offKind?: OffKind; leaveKind?: LeaveKind }
  after: { code: 'D' | 'E' | 'N' | 'S' | 'OFF'; offKind?: 'regular' | 'sleeping' }
  // Q2: 필수 위반을 알고도 적용하는 사유
  override?: { reason: string }
  kind: 'manual' | 'swap' | 'replacement'
}

const cellKey = (userId: string, date: IsoDate) => `${userId}|${date}`

export function applyEdits(cells: readonly GridCell[], edits: readonly CellEdit[]): GridCell[] {
  const by = new Map(edits.map((e) => [cellKey(e.userId, e.date), e]))
  return cells.map((c) => {
    const e = by.get(cellKey(c.userId, c.date))
    if (!e) return c
    const out: GridCell = { userId: c.userId, date: c.date, code: e.after.code, checkupHalf: c.checkupHalf }
    if (e.after.code === 'OFF') out.offKind = e.after.offKind ?? 'regular'
    return out
  })
}

// 날짜·듀티 단위 규칙은 명단·인원 수가 바뀌어도 같은 위반이다 (그 듀티가 계속 모자란 상태)
const DUTY_RULES = new Set(['H-STAFF', 'H-KTASS', 'S-HEAD-FILL', 'S-JUNIOR-ONLY'])

// 편집 전후 위반을 맞대는 키
export function violationKey(v: Violation): string {
  if (DUTY_RULES.has(v.ruleId)) return [v.ruleId, v.dates.join(), v.shift ?? ''].join('|')
  const pattern = v.ruleId === 'H-PATTERN' ? String(v.data.pattern) : ''
  return [v.ruleId, v.dates.join(), v.shift ?? '', v.userIds.join(), pattern].join('|')
}

// R-ADJ-4: 적용 전에 없던 위반만
export function newViolations(before: CheckResult, after: CheckResult): CheckResult {
  const seen = new Set([...before.hardViolations, ...before.softWarnings].map(violationKey))
  return {
    hardViolations: after.hardViolations.filter((v) => !seen.has(violationKey(v))),
    softWarnings: after.softWarnings.filter((v) => !seen.has(violationKey(v))),
  }
}

// R-ADJ-6: 예외 사유가 있는 편집이 가려 주지 않는 필수 위반
export function uncoveredViolations(hard: readonly Violation[], edits: readonly CellEdit[]): Violation[] {
  const overrides = edits.filter((e) => e.override?.reason.trim())
  return hard.filter(
    (v) =>
      !overrides.some(
        (e) =>
          v.dates.includes(e.date) &&
          (v.ruleId === 'H-STAFF' || v.ruleId === 'H-KTASS' || v.userIds.includes(e.userId)),
      ),
  )
}

const asAfter = (c: GridCell): CellEdit['after'] => {
  if (c.code === 'OFF') return { code: 'OFF', offKind: c.offKind === 'sleeping' ? 'sleeping' : 'regular' }
  return { code: c.code as 'D' | 'E' | 'N' | 'S' }
}
const asBefore = (c: GridCell): CellEdit['before'] => {
  const b: CellEdit['before'] = { code: c.code }
  if (c.offKind) b.offKind = c.offKind
  if (c.leaveKind) b.leaveKind = c.leaveKind
  return b
}
const isLeave = (c: GridCell) =>
  c.code === 'AL' || c.code === 'LEAVE' || c.offKind === 'special' || c.offKind === 'founding'

// R-ADJ-9: 같은 날 두 사람의 칸 교환. 휴가 칸이면 null
export function swapEdits(
  cells: readonly GridCell[],
  date: IsoDate,
  a: string,
  b: string,
): CellEdit[] | null {
  const ca = cells.find((c) => c.userId === a && c.date === date)
  const cb = cells.find((c) => c.userId === b && c.date === date)
  if (!ca || !cb || isLeave(ca) || isLeave(cb)) return null
  return [
    { userId: a, date, before: asBefore(ca), after: asAfter(cb), kind: 'swap' },
    { userId: b, date, before: asBefore(cb), after: asAfter(ca), kind: 'swap' },
  ]
}

export type ReplacementCandidate = { userId: string; kTass: boolean; edit: CellEdit; newHard: Violation[] }

// R-ADJ-10: 그날 쉬는 교대 근무자. K-tass가 모자라면 K-tass 먼저, 그다음 표 순서(input.nurses 순)
export function replacementCandidates(
  input: ScheduleInput,
  date: IsoDate,
  shift: DutyCode,
): ReplacementCandidate[] {
  const at = new Map(input.cells.map((c) => [cellKey(c.userId, c.date), c]))
  const base = checkSchedule(input)
  const kTassShort = base.hardViolations.some(
    (v) => v.ruleId === 'H-KTASS' && v.shift === shift && v.dates[0] === date,
  )
  const out: ReplacementCandidate[] = []
  for (const n of input.nurses) {
    if (n.rotation !== 'rotating' || !isEmployed(n, date)) continue
    const c = at.get(cellKey(n.id, date))
    if (!c || c.code !== 'OFF' || (c.offKind && c.offKind !== 'regular')) continue
    const edit: CellEdit = {
      userId: n.id,
      date,
      before: asBefore(c),
      after: { code: shift },
      kind: 'replacement',
    }
    const trial = checkSchedule({ ...input, cells: applyEdits(input.cells, [edit]) })
    out.push({ userId: n.id, kTass: n.kTass, edit, newHard: newViolations(base, trial).hardViolations })
  }
  return kTassShort ? [...out.filter((c) => c.kTass), ...out.filter((c) => !c.kTass)] : out
}
