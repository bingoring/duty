import {
  DEFAULT_RULES,
  RuleSetSchema,
  addDays,
  foundingOffEligible,
  isEmployed,
  monthDates,
  settleMonth,
  type BalanceAccount,
  type CellSource,
  type HolidayDay,
  type HolidayKind,
  type IsoDate,
  type LeaveKind,
  type MonthPlanStatus,
  type NurseProfile,
  type OffKind,
  type Role,
  type Rotation,
  type RuleSet,
  type SeniorityTier,
  type SettlementResult,
  type ShiftCode,
} from '@duty/domain'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { holidays, monthPlans, monthSettlements, ruleVersions, scheduleCells, users } from '../db/schema'
import { eduContInYear, grantedInYear, ledgerSums, round1, type Sums } from './balances'
import { shiftYm, todaySeoul, type YearMonth } from './month'
import type {
  LeaveBalanceSummary,
  MonthViewData,
  PlanInfo,
  RowBalance,
  ScheduleCellRow,
  ViewUser,
} from './types'

type PlanRow = typeof monthPlans.$inferSelect
const SHOWN: MonthPlanStatus[] = ['CONFIRMED', 'CLOSED']
const before = (a: YearMonth, b: YearMonth) => a.year * 12 + a.month < b.year * 12 + b.month

async function loadUsers(db: Db): Promise<(ViewUser & { active: boolean })[]> {
  const rows = await db.select().from(users).orderBy(asc(users.seniorityRank))
  return rows.map((u) => ({
    id: u.id,
    employeeNo: u.employeeNo,
    name: u.name,
    role: u.role as Role,
    rotation: u.rotation as Rotation,
    seniorityRank: u.seniorityRank,
    seniorityTier: u.seniorityTier as SeniorityTier,
    kTass: u.kTass,
    unionMember: u.unionMember,
    employedFrom: u.hireDate,
    // 마지막 재직일 = 비활성화한 날(서울)의 전날 (2-2 domain-entities NurseProfile)
    employedUntil: u.deactivatedAt ? addDays(todaySeoul(u.deactivatedAt), -1) : null,
    active: u.active,
  }))
}

async function loadRules(db: Db): Promise<Map<number, RuleSet>> {
  const rows = await db.select().from(ruleVersions)
  return new Map(
    rows.map((r) => [
      r.version,
      RuleSetSchema.parse({ params: r.params, toggles: r.toggles, forbiddenPatterns: r.forbiddenPatterns }),
    ]),
  )
}

function currentRules(all: Map<number, RuleSet>): RuleSet {
  const latest = Math.max(0, ...all.keys())
  return all.get(latest) ?? DEFAULT_RULES
}

async function loadCells(db: Db, planIds: string[]): Promise<Map<string, ScheduleCellRow[]>> {
  const out = new Map<string, ScheduleCellRow[]>(planIds.map((id) => [id, []]))
  if (planIds.length === 0) return out
  const rows = await db
    .select()
    .from(scheduleCells)
    .where(inArray(scheduleCells.monthPlanId, planIds))
    .orderBy(asc(scheduleCells.date))
  for (const r of rows) {
    const cell: ScheduleCellRow = {
      userId: r.userId,
      date: r.date,
      code: r.code as ShiftCode,
      checkupHalf: r.checkupHalf,
      source: r.source as CellSource,
    }
    if (r.offKind) cell.offKind = r.offKind as OffKind
    if (r.leaveKind) cell.leaveKind = r.leaveKind as LeaveKind
    out.get(r.monthPlanId)!.push(cell)
  }
  return out
}

function profile(u: ViewUser, s: Sums): NurseProfile {
  return {
    id: u.id,
    rotation: u.rotation,
    seniorityTier: u.seniorityTier,
    kTass: u.kTass,
    unionMember: u.unionMember,
    employedFrom: u.employedFrom,
    employedUntil: u.employedUntil,
    nightDedicated: null,
    offCarryBefore: s.off_carry,
    nightBankBefore: s.night_bank,
    weekendPairMissedStreak: 0,
    weekendPairCarryIn: false,
    shiftCountsBefore: { D: 0, E: 0, N: 0 },
    eduUsedThisYear: { cont: 0, union: 0 },
    balancesBefore: null,
  }
}

function apply(s: Sums, r: SettlementResult) {
  for (const e of r.entries) s[e.account as BalanceAccount] = round1(s[e.account as BalanceAccount] + e.delta)
}

type Ctx = {
  db: Db
  users: ViewUser[]
  plans: PlanRow[]
  rules: Map<number, RuleSet>
  holidays: HolidayDay[]
}

function settleAll(ctx: Ctx, plan: PlanRow, cells: ScheduleCellRow[], sums: Map<string, Sums>) {
  const rules = (plan.ruleVersion && ctx.rules.get(plan.ruleVersion)) || currentRules(ctx.rules)
  const out = new Map<string, SettlementResult>()
  for (const u of ctx.users) {
    out.set(
      u.id,
      settleMonth({
        nurse: profile(u, sums.get(u.id)!),
        year: plan.year,
        month: plan.month,
        cells: cells.filter((c) => c.userId === u.id),
        holidays: ctx.holidays,
        sleepingOffPerN: rules.params.sleepingOffPerN,
      }),
    )
  }
  return out
}

// R-VIEW-12: 원장 현재 합계 + 보는 달보다 앞선 확정·미마감 달을 차례로 정산한 증감 = 보는 달의 월초
async function monthStart(ctx: Ctx, ym: YearMonth) {
  const ids = ctx.users.map((u) => u.id)
  const sums = await ledgerSums(ctx.db, ids)
  const edu = await eduContInYear(ctx.db, ids, ym.year)
  const earlier = ctx.plans.filter((p) => p.status === 'CONFIRMED' && before(p, ym))
  const cells = await loadCells(
    ctx.db,
    earlier.map((p) => p.id),
  )
  for (const p of earlier) {
    for (const [id, r] of settleAll(ctx, p, cells.get(p.id)!, sums)) {
      apply(sums.get(id)!, r)
      if (p.year === ym.year) edu.set(id, edu.get(id)! + r.eduCont)
    }
  }
  return { sums, edu }
}

function rowBalance(
  u: ViewUser,
  start: Sums,
  end: Sums,
  r: Pick<SettlementResult, 'actualOff' | 'baselineOff' | 'sleepingOff' | 'nightCount'>,
  edu: number,
  year: number,
  hol: HolidayDay[],
  carry?: { offBefore: number; offAfter: number; nightBefore: number; nightAfter: number },
): RowBalance {
  return {
    offCarryBefore: carry?.offBefore ?? start.off_carry,
    offCarryAfter: carry?.offAfter ?? end.off_carry,
    nightBankBefore: carry?.nightBefore ?? start.night_bank,
    nightBankAfter: carry?.nightAfter ?? end.night_bank,
    actualOff: r.actualOff,
    baselineOff: r.baselineOff,
    sleepingOff: r.sleepingOff,
    nightCount: r.nightCount,
    annual: end.annual_leave,
    special: end.special_leave,
    founding: end.founding_off,
    checkup: end.checkup,
    sick: end.sick_leave,
    foundingEligible: foundingOffEligible(profile(u, end), year, hol),
    eduContThisYear: edu,
  }
}

async function monthBalances(ctx: Ctx, plan: PlanRow, cells: ScheduleCellRow[]) {
  const out = new Map<string, RowBalance>()
  const ids = ctx.users.map((u) => u.id)
  if (plan.status === 'CLOSED') {
    // R-VIEW-13: 월초·월말은 스냅샷, 잔여는 마감 시점까지의 원장
    const asOf = plan.closedAt ?? new Date()
    const sums = await ledgerSums(ctx.db, ids, asOf)
    const edu = await eduContInYear(ctx.db, ids, plan.year, asOf)
    const snaps = await ctx.db
      .select()
      .from(monthSettlements)
      .where(eq(monthSettlements.monthPlanId, plan.id))
    for (const u of ctx.users) {
      const s = snaps.find((x) => x.userId === u.id)
      const end = sums.get(u.id)!
      const r = s ?? { actualOff: 0, baselineOff: 0, sleepingOff: 0, nightCount: 0 }
      const carry = s && {
        offBefore: Number(s.offCarryBefore),
        offAfter: Number(s.offCarryAfter),
        nightBefore: s.nightBankBefore,
        nightAfter: s.nightBankAfter,
      }
      out.set(u.id, rowBalance(u, end, end, r, edu.get(u.id)!, plan.year, ctx.holidays, carry || undefined))
    }
    return out
  }
  const { sums, edu } = await monthStart(ctx, plan)
  const starts = new Map([...sums].map(([id, s]) => [id, { ...s }]))
  for (const [id, r] of settleAll(ctx, plan, cells, sums)) {
    apply(sums.get(id)!, r)
    const u = ctx.users.find((x) => x.id === id)!
    out.set(
      id,
      rowBalance(u, starts.get(id)!, sums.get(id)!, r, edu.get(id)! + r.eduCont, plan.year, ctx.holidays),
    )
  }
  return out
}

function planInfo(p: PlanRow | undefined, names: Map<string, string>): PlanInfo | null {
  if (!p) return null
  return {
    status: p.status as MonthPlanStatus,
    confirmedByName: p.confirmedBy ? (names.get(p.confirmedBy) ?? null) : null,
    closedByName: p.closedBy ? (names.get(p.closedBy) ?? null) : null,
    negotiationStart: p.negotiationStart,
    negotiationEnd: p.negotiationEnd,
  }
}

async function baseContext(db: Db) {
  const [allUsers, plans, rules, hol] = await Promise.all([
    loadUsers(db),
    db.select().from(monthPlans).orderBy(asc(monthPlans.year), asc(monthPlans.month)),
    loadRules(db),
    db.select({ date: holidays.date, kind: holidays.kind }).from(holidays),
  ])
  const holidayDays = hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind }))
  return { allUsers, plans, rules, holidays: holidayDays }
}

const stripActive = (u: ViewUser & { active: boolean }): ViewUser => {
  const { active, ...rest } = u
  void active
  return rest
}

const findPlan = (plans: PlanRow[], ym: YearMonth) =>
  plans.find((p) => p.year === ym.year && p.month === ym.month)

// Build Spec 2-3 business-logic-model §1 — `/` 요청의 원자료
export async function loadMonthView(
  db: Db,
  args: { year: number; month: number; viewerId: string; today: IsoDate },
): Promise<MonthViewData> {
  const { allUsers, plans, rules, holidays: hol } = await baseContext(db)
  const ym = { year: args.year, month: args.month }
  const plan = findPlan(plans, ym)
  const shown = plan && SHOWN.includes(plan.status as MonthPlanStatus) ? plan : undefined
  const todayYm = { year: Number(args.today.slice(0, 4)), month: Number(args.today.slice(5, 7)) }
  const todayPlan = findPlan(plans, todayYm)
  const cellMap = await loadCells(
    db,
    [
      shown?.id,
      todayPlan && SHOWN.includes(todayPlan.status as MonthPlanStatus) ? todayPlan.id : undefined,
    ].filter((x): x is string => !!x),
  )
  const cells = shown ? cellMap.get(shown.id)! : []
  const days = monthDates(args.year, args.month)
  const withCells = new Set(cells.map((c) => c.userId))
  // R-VIEW-3
  const rowUsers = allUsers.filter(
    (u) => withCells.has(u.id) || (u.active && days.some((d) => isEmployed(u, d))),
  )
  const names = new Map(allUsers.map((u) => [u.id, u.name]))
  const ctx: Ctx = { db, users: rowUsers, plans, rules, holidays: hol }
  const balances = shown ? await monthBalances(ctx, shown, cells) : new Map<string, RowBalance>()
  const todayCell =
    (todayPlan &&
      cellMap.get(todayPlan.id)?.find((c) => c.userId === args.viewerId && c.date === args.today)) ??
    null
  const viewer = allUsers.find((u) => u.id === args.viewerId)

  return {
    year: args.year,
    month: args.month,
    today: args.today,
    viewerId: args.viewerId,
    viewerRole: viewer?.role ?? 'nurse',
    plan: planInfo(plan, names),
    nextPlan: planInfo(findPlan(plans, shiftYm(ym, 1)), names),
    rules: currentRules(rules),
    users: rowUsers.map(stripActive),
    cells,
    holidays: hol.filter((h) => h.date.startsWith(`${args.year}-`)),
    balances,
    todayCell,
  }
}

// R-SHELL-2: 오늘이 속한 달의 월말 예정(확정 전이면 월초)
export async function loadLeaveBalance(
  db: Db,
  args: { viewerId: string; today: IsoDate },
): Promise<LeaveBalanceSummary> {
  const { allUsers, plans, rules, holidays: hol } = await baseContext(db)
  const me = allUsers.find((u) => u.id === args.viewerId)
  const ym = { year: Number(args.today.slice(0, 4)), month: Number(args.today.slice(5, 7)) }
  const granted = await grantedInYear(db, args.viewerId, ym.year)
  if (!me)
    return {
      annual: 0,
      annualGranted: 0,
      special: 0,
      specialGranted: 0,
      checkup: 0,
      sick: 0,
      offCarry: 0,
      nightBank: 0,
    }
  const ctx: Ctx = { db, users: [me], plans, rules, holidays: hol }
  const plan = findPlan(plans, ym)
  let offCarry: number, nightBank: number, end: Sums
  if (plan && SHOWN.includes(plan.status as MonthPlanStatus)) {
    const b = (await monthBalances(ctx, plan, (await loadCells(db, [plan.id])).get(plan.id)!)).get(me.id)!
    offCarry = b.offCarryAfter
    nightBank = b.nightBankAfter
    end = {
      ...(await ledgerSums(db, [me.id])).get(me.id)!,
      annual_leave: b.annual,
      special_leave: b.special,
      checkup: b.checkup,
      sick_leave: b.sick,
    }
  } else {
    const { sums } = await monthStart(ctx, ym)
    end = sums.get(me.id)!
    offCarry = end.off_carry
    nightBank = end.night_bank
  }
  return {
    annual: end.annual_leave,
    annualGranted: granted.annual,
    special: end.special_leave,
    specialGranted: granted.special,
    checkup: end.checkup,
    sick: end.sick_leave,
    offCarry,
    nightBank,
  }
}
