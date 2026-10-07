import { createHash } from 'node:crypto'
import { SOLVER_CONTRACT_VERSION, type SolverRequest } from '@duty/contract'
import {
  WORK_CODES,
  baselineOff,
  checkSchedule,
  fixedCells,
  headCells,
  hasWeekendPair,
  isEmployed,
  isRedDay,
  isRestCode,
  monthDates,
  nightLimits,
  optionsSatisfied,
  redDaySet,
  restHoursBetween,
  weekendPairCarryOut,
  type FixedCell,
  type GridCell,
  type IsoDate,
  type LeaveType,
  type NurseProfile,
  type ScheduleInput,
  type Violation,
} from '@duty/domain'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans, shiftRequests } from '../db/schema'
import { buildScheduleInput } from '../schedule/input'
import { loadCells, monthStartBalances } from '../schedule/load'
import { shiftYm, type YearMonth } from '../schedule/month'

// Build Spec 2-6 business-logic-model §1·§2 — DB → ScheduleInput(월초 잔여 채움) → SolverRequest
type PlanRow = typeof monthPlans.$inferSelect
const SHOWN = ['CONFIRMED', 'CLOSED']
// Q3: 신청 불충족 가산을 보는 기간
const REQUEST_MISS_MONTHS = 3
// 고정 칸만으로 생기는 하드 위반 (R-GEN-11)
const FIXED_RULES = new Set(['H-BALANCE', 'H-EDU-LIMIT', 'H-EDU-UNION'])

export type Priorities = SolverRequest['priorities']

export type GenerationInput = {
  input: ScheduleInput
  // 솔버 요청에서 seed·timeLimitSec·priorities를 뺀 부분
  base: Omit<SolverRequest, 'seed' | 'timeLimitSec' | 'priorities'>
  headCells: GridCell[]
  fixed: Map<string, Map<IsoDate, FixedCell>>
  checkupDates: Map<string, Set<IsoDate>>
  prevMonthConfirmed: boolean
  inputHash: string
  fixedViolations: Violation[]
}

const key = (ym: YearMonth) => ym.year * 12 + ym.month

async function shownPlans(db: Db, target: YearMonth, months: number): Promise<PlanRow[]> {
  const all = await db.select().from(monthPlans)
  return all
    .filter((p) => SHOWN.includes(p.status) && key(p) < key(target) && key(p) >= key(target) - months)
    .sort((a, b) => key(b) - key(a))
}

// 월초 잔여를 채운다 (2-5까지는 0·null). 확정·마감된 앞 달의 칸에서 센다
export async function fillProfiles(db: Db, input: ScheduleInput, rules: ScheduleInput['rules']) {
  const ym = { year: input.year, month: input.month }
  const ids = input.nurses.map((n) => n.id)
  const sums = await monthStartBalances(db, ym, ids)
  const window = rules.params.shiftBalanceWindowMonths - 1
  const recent = await shownPlans(db, ym, Math.max(12, window, REQUEST_MISS_MONTHS))
  const cellsBy = await loadCells(
    db,
    recent.map((p) => p.id),
  )
  const cellsOf = (p: PlanRow, id: string) => cellsBy.get(p.id)!.filter((c) => c.userId === id)

  for (const n of input.nurses) {
    const s = sums.get(n.id)
    if (s) {
      n.offCarryBefore = s.off_carry
      n.nightBankBefore = s.night_bank
      n.balancesBefore = {
        annualLeave: s.annual_leave,
        specialLeave: s.special_leave,
        foundingOff: s.founding_off,
        checkup: s.checkup,
        sickLeave: s.sick_leave,
      }
    }
    // 주말 통 OFF 미배정 연속: 직전 달부터 거슬러, 확정본이 없는 달에서 멈춘다
    let streak = 0
    for (let i = 1; i <= 12; i++) {
      const pym = shiftYm(ym, -i)
      const p = recent.find((x) => x.year === pym.year && x.month === pym.month)
      if (!p) break
      const days = monthDates(p.year, p.month)
      const mine = cellsOf(p, n.id)
      if (!days.some((d) => isEmployed(n, d))) break
      const at = new Map(mine.map((c) => [c.date, c]))
      const achieved = hasWeekendPair((d) => {
        const c = at.get(d)
        if (!c) return d > days.at(-1)! ? undefined : false
        return isRestCode(c.code)
      }, days)
      if (achieved) break
      streak++
    }
    n.weekendPairMissedStreak = streak
    const prev = shiftYm(ym, -1)
    const pp = recent.find((x) => x.year === prev.year && x.month === prev.month)
    n.weekendPairCarryIn = pp ? weekendPairCarryOut(cellsOf(pp, n.id), pp.year, pp.month) : false

    // D·E·N 누적(이번 달 제외 window개월), 올해 교육 횟수
    const counts = { D: 0, E: 0, N: 0 }
    const edu = { cont: 0, union: 0 }
    for (const p of recent) {
      const mine = cellsOf(p, n.id)
      if (key(p) >= key(ym) - window)
        for (const c of mine) if (c.code === 'D' || c.code === 'E' || c.code === 'N') counts[c.code]++
      if (p.year === ym.year)
        for (const c of mine) {
          if (c.offKind === 'edu_cont') edu.cont++
          if (c.offKind === 'edu_union') edu.union++
        }
    }
    n.shiftCountsBefore = counts
    n.eduUsedThisYear = edu
  }

  // R-STAFF-5: 3인 기간 뒤 대상 월 이전에 신규가 선 N
  for (const t of input.trainings) {
    let before = 0
    for (const p of recent)
      for (const c of cellsOf(p, t.traineeId))
        if (c.code === 'N' && c.date > t.tripleStaffUntil && c.date <= t.endDate) before++
    t.tripleNightsBefore = before
  }
  return { recent, cellsOf }
}

// Q3: 최근 3개월 확정본에서 제출된 복수 옵션 신청 중 불충족 수
async function requestMisses(
  db: Db,
  ym: YearMonth,
  recent: PlanRow[],
  cellsOf: (p: PlanRow, id: string) => GridCell[],
) {
  const out = new Map<string, number>()
  const plans = recent.filter((p) => key(p) >= key(ym) - REQUEST_MISS_MONTHS)
  for (const p of plans) {
    const reqs = await db
      .select()
      .from(shiftRequests)
      .where(and(eq(shiftRequests.year, p.year), eq(shiftRequests.month, p.month)))
    for (const r of reqs) {
      if (r.special || !r.submittedAt) continue
      const c = cellsOf(p, r.userId).find((x) => x.date === r.date)
      if (!c || c.code === 'AL' || c.code === 'LEAVE') continue
      if (!optionsSatisfied(c, r.options as ('OFF' | 'D' | 'E' | 'N')[]))
        out.set(r.userId, (out.get(r.userId) ?? 0) + 1)
    }
  }
  return out
}

// 키를 정렬한 JSON (입력 해시용)
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

export async function buildGenerationInput(db: Db, plan: PlanRow): Promise<GenerationInput> {
  const { input } = await buildScheduleInput(db, plan)
  const ym = { year: plan.year, month: plan.month }
  const rules = input.rules
  const days = monthDates(ym.year, ym.month)
  const red = redDaySet(input.holidays)
  const { recent, cellsOf } = await fillProfiles(db, input, rules)
  const misses = await requestMisses(db, ym, recent, cellsOf)

  const leaves = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'APPROVED'),
        lte(leaveRequests.startDate, days.at(-1)!),
        gte(leaveRequests.endDate, days[0]!),
      ),
    )
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.id))
  const specials = input.requests.flatMap((r) =>
    r.special ? [{ userId: r.userId, date: r.date, special: r.special }] : [],
  )
  const { fixed, checkupDates } = fixedCells({
    days,
    nurses: input.nurses,
    leaves: leaves.map((l) => ({
      userId: l.userId,
      type: l.type as LeaveType,
      startDate: l.startDate,
      endDate: l.endDate,
    })),
    specials,
  })

  const rotating = input.nurses.filter((n) => n.rotation === 'rotating' && days.some((d) => isEmployed(n, d)))
  const heads = input.nurses.filter((n) => n.rotation === 'fixed_weekday')
  const head = heads.flatMap((h) =>
    headCells(h, days, red, {
      fixed: fixed.get(h.id) ?? new Map(),
      offRequests: new Set(
        input.requests
          .filter((r) => r.userId === h.id && r.options.includes('OFF') && !r.options.includes('D'))
          .map((r) => r.date),
      ),
    }),
  )
  const trainees = new Set(
    input.trainings
      .filter((t) => t.startDate <= days.at(-1)! && t.endDate >= days[0]!)
      .map((t) => t.traineeId),
  )

  const nurse = (n: NurseProfile): SolverRequest['nurses'][number] => {
    const nl = nightLimits(n, rules, ym.year, ym.month)
    const f = fixed.get(n.id) ?? new Map()
    return {
      id: n.id,
      kTass: n.kTass,
      junior: n.seniorityTier === 'junior',
      workDays: days.filter((d) => isEmployed(n, d)),
      fixed: [...f.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, c]) => ({ date, code: c.code, ...(c.offKind ? { offKind: c.offKind } : {}) })),
      requests: input.requests
        .filter((r) => r.userId === n.id && !r.special && r.options.length > 0 && !f.has(r.date))
        .map((r) => ({ date: r.date, options: r.options })),
      offTarget: Math.round((baselineOff(n, ym.year, ym.month, input.holidays) - n.offCarryBefore) * 10) / 10,
      nightBankBefore: n.nightBankBefore,
      nightMax: nl.max,
      nightTarget: nl.target,
      weekendMissedStreak: n.weekendPairMissedStreak,
      weekendCarryIn: n.weekendPairCarryIn,
      shiftCountsBefore: n.shiftCountsBefore,
      balanceShiftTypes: rules.toggles.balanceShiftTypes && !nl.dedicated && !trainees.has(n.id),
      requestMissBefore: misses.get(n.id) ?? 0,
    }
  }

  const tailDates = [...new Set(input.prevTail.map((c) => c.date))]
  const rotIds = new Set(rotating.map((n) => n.id))
  const outside = (cells: GridCell[]) =>
    cells
      .filter((c) => rotIds.has(c.userId))
      .map((c) => ({
        userId: c.userId,
        date: c.date,
        code: c.code,
        ...(c.offKind ? { offKind: c.offKind } : {}),
      }))
  const nextHead = outside(input.nextHead)
  const restHours = Object.fromEntries(
    WORK_CODES.map((a) => [a, Object.fromEntries(WORK_CODES.map((b) => [b, restHoursBetween(a, b)]))]),
  ) as SolverRequest['restHours']
  const base: GenerationInput['base'] = {
    contractVersion: SOLVER_CONTRACT_VERSION,
    days,
    redDays: [...tailDates, ...days].filter((d) => isRedDay(d, red)),
    prevTail: outside(input.prevTail),
    // 다음 달이 이미 확정된 경우에만(없으면 키를 빼 입력 해시를 그대로 둔다). 2-9에서 발견: 솔버가 경계를 몰라 재검사에서 늘 탈락
    ...(nextHead.length ? { nextHead } : {}),
    nurses: rotating.map(nurse),
    heads: heads.map((h) => ({
      id: h.id,
      kTass: h.kTass,
      junior: h.seniorityTier === 'junior',
      cells: head
        .filter((c) => c.userId === h.id)
        .map((c) => ({ date: c.date, code: c.code, ...(c.offKind ? { offKind: c.offKind } : {}) })),
    })),
    trainings: input.trainings
      .filter((t) => rotIds.has(t.traineeId) && rotIds.has(t.preceptorId))
      .map((t) => ({
        traineeId: t.traineeId,
        preceptorId: t.preceptorId,
        startDate: t.startDate,
        endDate: t.endDate,
        tripleUntil: t.tripleStaffUntil,
        tripleNightsLeft: Math.max(0, rules.params.tripleNightCount - t.tripleNightsBefore),
      })),
    rules: {
      minStaff: rules.params.minStaffPerShift,
      minKTass: rules.params.minKTass,
      minRestHours: rules.params.minRestHours,
      maxConsecutiveNight: rules.params.maxConsecutiveNight,
      maxConsecutiveOff: rules.params.maxConsecutiveOff,
      offAfterNight: rules.params.offAfterNight,
      sleepingOffPerN: rules.params.sleepingOffPerN,
      forbiddenPatterns: rules.forbiddenPatterns,
      shiftBalanceTolerance: rules.params.shiftBalanceTolerance,
      shiftBalanceWindowMonths: rules.params.shiftBalanceWindowMonths,
    },
    restHours,
  }

  // R-GEN-11: 고정 칸만 채운 입력으로 잔여·교육 한도 위반을 먼저 본다
  const fixedOnly: GridCell[] = [
    ...head,
    ...[...fixed.entries()].flatMap(([userId, m]) =>
      rotIds.has(userId)
        ? [...m.entries()].map(([date, c]) => ({ userId, date, checkupHalf: false, ...c }))
        : [],
    ),
  ]
  const fixedViolations = checkSchedule({ ...input, cells: fixedOnly }).hardViolations.filter((v) =>
    FIXED_RULES.has(v.ruleId),
  )

  const prevYm = shiftYm(ym, -1)
  const prevMonthConfirmed = recent.some((p) => p.year === prevYm.year && p.month === prevYm.month)
  return {
    input,
    base,
    headCells: head,
    fixed,
    checkupDates,
    prevMonthConfirmed,
    inputHash: createHash('sha256').update(canonical(base)).digest('hex'),
    fixedViolations,
  }
}

export function toSolverRequest(
  g: GenerationInput,
  opts: { seed: number; timeLimitSec: number; priorities: Priorities },
): SolverRequest {
  return { ...g.base, seed: opts.seed, timeLimitSec: opts.timeLimitSec, priorities: opts.priorities }
}

// 솔버 결과 칸 + 수간호사 칸 + 검진 반차 표시 → 검사기·저장용 칸
export function assembleCells(g: GenerationInput, solved: SolverRequest['prevTail']): GridCell[] {
  const out: GridCell[] = [...g.headCells]
  for (const c of solved) {
    const cell: GridCell = {
      userId: c.userId,
      date: c.date,
      code: c.code,
      checkupHalf: g.checkupDates.get(c.userId)?.has(c.date) ?? false,
    }
    if (c.offKind) cell.offKind = c.offKind
    const f = g.fixed.get(c.userId)?.get(c.date)
    if (f?.leaveKind) cell.leaveKind = f.leaveKind
    out.push(cell)
  }
  return out
}
