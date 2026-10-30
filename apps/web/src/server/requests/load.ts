import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  holidays,
  leaveRequests,
  monthPlans,
  monthSettlements,
  scheduleCells,
  shiftRequests,
  users,
} from '../db/schema'
import { latestRuleSet } from '../rules/service'
import { monthStartBalances } from '../schedule/load'
import { shiftYm, todaySeoul, type YearMonth } from '../schedule/month'
import {
  addDays,
  baselineOff,
  monthDates,
  type HolidayKind,
  type LeaveType,
  type MonthPlanStatus,
  leaveCellLabel,
} from '@duty/domain'
import type { RequestsRaw } from './dto'
import { ensureRequestPlan } from './plan'
import type { Actor } from './service'
import { NURSES } from '../role-group'
import { loadLeaveApprovals } from './approvals'

// 3-6: 휴가 칸은 종류 이름
const cellLabel = (c: { code: string; offKind: string | null; leaveKind: string | null }) =>
  leaveCellLabel(c) ?? (c.code === 'OFF' ? 'off' : c.code)

// Build Spec 2-5 business-logic-model §1 — 신청 화면 원자료(역할 필터 전)
export async function loadRequestsRaw(
  db: Db,
  a: { ym: YearMonth; viewer: Actor; today: string },
): Promise<RequestsRaw> {
  const { ym, viewer, today } = a
  const rules = await latestRuleSet(db)
  const plan = await ensureRequestPlan(db, ym, today, rules)
  const days = monthDates(ym.year, ym.month)
  const [first, last] = [days[0]!, days.at(-1)!]

  const requests = await db
    .select()
    .from(shiftRequests)
    .where(and(eq(shiftRequests.year, ym.year), eq(shiftRequests.month, ym.month)))
  const leaves = await db
    .select()
    .from(leaveRequests)
    .where(and(lte(leaveRequests.startDate, last), gte(leaveRequests.endDate, first)))
  const involved = new Set([...requests.map((r) => r.userId), ...leaves.map((l) => l.userId)])
  const people = (await db.select().from(users).where(NURSES).orderBy(asc(users.seniorityRank))).filter(
    // 2-11 R-HEAD-2: 수간호사도 행이 있다(OFF·D만 신청)
    (u) => u.active || involved.has(u.id),
  )

  const scheduled =
    plan && (plan.status === 'CONFIRMED' || plan.status === 'CLOSED')
      ? (await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))).map((c) => ({
          userId: c.userId,
          date: c.date,
          label: cellLabel(c),
        }))
      : []

  const hol = await db.select({ date: holidays.date, kind: holidays.kind }).from(holidays)
  // 내 카드: 기준 OFF·월초 누적 OFF·잔여 N, 지난달 주말 통 OFF
  const me = people.find((u) => u.id === viewer.id)
  let viewerCard: RequestsRaw['viewerCard'] = null
  if (me) {
    const employment = {
      employedFrom: me.hireDate,
      employedUntil: me.deactivatedAt ? addDays(todaySeoul(me.deactivatedAt), -1) : null,
    }
    const start = (await monthStartBalances(db, ym, [me.id])).get(me.id)!
    const prev = shiftYm(ym, -1)
    const [prevPlan] = await db
      .select()
      .from(monthPlans)
      .where(and(eq(monthPlans.year, prev.year), eq(monthPlans.month, prev.month)))
    const [snap] = prevPlan
      ? await db
          .select()
          .from(monthSettlements)
          .where(and(eq(monthSettlements.monthPlanId, prevPlan.id), eq(monthSettlements.userId, me.id)))
      : []
    viewerCard = {
      baseline: baselineOff(
        { id: me.id, ...employment } as Parameters<typeof baselineOff>[0],
        ym.year,
        ym.month,
        hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind })),
      ),
      offCarry: start.off_carry,
      nightBank: start.night_bank,
      weekendMissedLastMonth: snap ? !snap.weekendPairAchieved : null,
    }
  }

  // 관리자: 승인 대기(모든 달) · 처리 이력 (3-12: 모바일 관리 탭도 쓰도록 approvals.ts로)
  const { pending, history } =
    viewer.role === 'admin' ? await loadLeaveApprovals(db) : { pending: [], history: [] }

  return {
    ...ym,
    today,
    plan: plan
      ? {
          status: plan.status as MonthPlanStatus,
          requestDeadline: plan.requestDeadline,
          negotiationStart: plan.negotiationStart,
          negotiationEnd: plan.negotiationEnd,
        }
      : null,
    users: people.map((u) => ({
      id: u.id,
      name: u.name,
      seniorityRank: u.seniorityRank,
      head: u.rotation === 'fixed_weekday',
    })),
    requests: requests.map((q) => ({
      userId: q.userId,
      date: q.date,
      options: q.options,
      special: q.special,
      comment: q.comment,
      submittedAt: q.submittedAt,
      // 3-10 2: 빠져 있어 관리자 입력이 파란 표시·삭제 버튼 없이 보였다
      byAdmin: q.byAdmin,
    })),
    leaves: leaves.map((l) => ({
      id: l.id,
      userId: l.userId,
      type: l.type as LeaveType,
      reasonCode: l.reasonCode,
      startDate: l.startDate,
      endDate: l.endDate,
      days: Number(l.days),
      status: l.status,
      comment: l.comment,
      rejectReason: l.rejectReason,
      decidedAt: l.decidedAt,
      byAdmin: l.byAdmin,
    })),
    scheduled,
    rules,
    viewerCard,
    pending,
    history,
    holidays: hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind })),
  }
}
