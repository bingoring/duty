import {
  addDays,
  monthDates,
  requiredTailDays,
  type CellSource,
  type GridCell,
  type HolidayKind,
  type LeaveKind,
  type NurseProfile,
  type OffKind,
  type RequestOption,
  type RequestSpecial,
  type Rotation,
  type ScheduleInput,
  type SeniorityTier,
  type ShiftCode,
  type TraineeKind,
} from '@duty/domain'
import { and, asc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { holidays, monthPlans, scheduleCells, shiftRequests, trainings, users } from '../db/schema'
import { latestRuleSet } from '../rules/service'
import { shiftYm, todaySeoul } from './month'

// DB → 2-2 검사기 입력. 2-5 인원 영향·2-6 솔버 재검사·2-7 조정이 함께 쓴다.
// 잔여 관련 필드(누적 OFF·잔여 N·잔여치)는 아직 채우지 않는다(0·null) — 전후 비교(인원 영향)에는 영향이 없다. 2-6에서 채운다.
type PlanRow = typeof monthPlans.$inferSelect
export type CellWithSource = GridCell & { source: CellSource }

function toCell(r: typeof scheduleCells.$inferSelect): CellWithSource {
  const c: CellWithSource = {
    userId: r.userId,
    date: r.date,
    code: r.code as ShiftCode,
    checkupHalf: r.checkupHalf,
    source: r.source as CellSource,
  }
  if (r.offKind) c.offKind = r.offKind as OffKind
  if (r.leaveKind) c.leaveKind = r.leaveKind as LeaveKind
  return c
}

const strip = ({ source: _s, ...c }: CellWithSource): GridCell => (void _s, c)

async function neighborCells(db: Db, ym: { year: number; month: number }, from: string, to: string) {
  const [p] = await db
    .select()
    .from(monthPlans)
    .where(
      and(
        eq(monthPlans.year, ym.year),
        eq(monthPlans.month, ym.month),
        inArray(monthPlans.status, ['CONFIRMED', 'CLOSED']),
      ),
    )
  if (!p) return []
  const rows = await db
    .select()
    .from(scheduleCells)
    .where(
      and(eq(scheduleCells.monthPlanId, p.id), gte(scheduleCells.date, from), lte(scheduleCells.date, to)),
    )
    .orderBy(asc(scheduleCells.userId), asc(scheduleCells.date))
  return rows.map(toCell)
}

export async function buildScheduleInput(
  db: Db,
  plan: PlanRow,
): Promise<{ input: ScheduleInput; cells: CellWithSource[] }> {
  const rules = await latestRuleSet(db)
  const ym = { year: plan.year, month: plan.month }
  const days = monthDates(ym.year, ym.month)
  const tail = requiredTailDays(rules)
  const cells = (
    await db
      .select()
      .from(scheduleCells)
      .where(eq(scheduleCells.monthPlanId, plan.id))
      .orderBy(asc(scheduleCells.userId), asc(scheduleCells.date))
  ).map(toCell)
  const prevTail = await neighborCells(db, shiftYm(ym, -1), addDays(days[0]!, -tail), addDays(days[0]!, -1))
  const nextHead = await neighborCells(
    db,
    shiftYm(ym, 1),
    addDays(days.at(-1)!, 1),
    addDays(days.at(-1)!, tail),
  )
  const ids = new Set([...cells, ...prevTail, ...nextHead].map((c) => c.userId))
  // 행 순서는 입력 해시·솔버 결정성에 들어가므로 모든 조회에 정렬을 둔다 (2-7 CI에서 확정이 간헐적으로 막힘)
  const people = (await db.select().from(users).orderBy(asc(users.seniorityRank), asc(users.id))).filter(
    (u) => u.active || ids.has(u.id),
  )
  const nurses: NurseProfile[] = people.map((u) => ({
    id: u.id,
    rotation: u.rotation as Rotation,
    seniorityTier: u.seniorityTier as SeniorityTier,
    kTass: u.kTass,
    unionMember: u.unionMember,
    employedFrom: u.hireDate,
    employedUntil: u.deactivatedAt ? addDays(todaySeoul(u.deactivatedAt), -1) : null,
    nightDedicated:
      u.nightDedicatedFrom && u.nightDedicatedTo
        ? { from: u.nightDedicatedFrom, to: u.nightDedicatedTo }
        : null,
    offCarryBefore: 0,
    nightBankBefore: 0,
    weekendPairMissedStreak: 0,
    weekendPairCarryIn: false,
    shiftCountsBefore: { D: 0, E: 0, N: 0 },
    eduUsedThisYear: { cont: 0, union: 0 },
    balancesBefore: null,
  }))
  const personIds = new Set(nurses.map((n) => n.id))
  const tr = await db
    .select()
    .from(trainings)
    .where(and(lte(trainings.startDate, days.at(-1)!), gte(trainings.endDate, days[0]!)))
    .orderBy(asc(trainings.startDate), asc(trainings.id))
  const req = await db
    .select()
    .from(shiftRequests)
    .where(
      and(
        eq(shiftRequests.year, ym.year),
        eq(shiftRequests.month, ym.month),
        isNotNull(shiftRequests.submittedAt),
      ),
    )
    .orderBy(asc(shiftRequests.userId), asc(shiftRequests.date))
  const hol = await db
    .select({ date: holidays.date, kind: holidays.kind })
    .from(holidays)
    .orderBy(asc(holidays.date))
  const input: ScheduleInput = {
    ...ym,
    rules,
    nurses,
    trainings: tr
      .filter((t) => personIds.has(t.traineeId) && personIds.has(t.preceptorId))
      .map((t) => ({
        traineeId: t.traineeId,
        preceptorId: t.preceptorId,
        kind: t.kind as TraineeKind,
        startDate: t.startDate,
        endDate: t.endDate,
        tripleStaffUntil: t.tripleStaffUntil,
        tripleNightsBefore: 0,
      })),
    holidays: hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind })),
    cells: cells.map(strip),
    prevTail: prevTail.map(strip),
    nextHead: nextHead.map(strip),
    requests: req
      .filter((r) => personIds.has(r.userId))
      .map((r) =>
        r.special
          ? { userId: r.userId, date: r.date, options: [], special: r.special as RequestSpecial }
          : { userId: r.userId, date: r.date, options: r.options as RequestOption[] },
      ),
  }
  return { input, cells }
}
