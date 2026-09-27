import { and, asc, desc, eq, gte, lte, or } from 'drizzle-orm'
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
  formatMD,
  weekdayKo,
  monthDates,
  type HolidayKind,
  type LeaveType,
  type MonthPlanStatus,
} from '@duty/domain'
import { leaveKindLabel, type RequestsRaw } from './dto'
import { ensureRequestPlan } from './plan'
import { leaveImpact, type Actor } from './service'

const cellLabel = (code: string) => (code === 'OFF' ? 'off' : code === 'AL' || code === 'LEAVE' ? '휴' : code)

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
  const people = (await db.select().from(users).orderBy(asc(users.seniorityRank))).filter(
    (u) => u.rotation === 'rotating' && (u.active || involved.has(u.id)),
  )
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )

  const scheduled =
    plan && (plan.status === 'CONFIRMED' || plan.status === 'CLOSED')
      ? (await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))).map((c) => ({
          userId: c.userId,
          date: c.date,
          label: cellLabel(c.code),
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

  // 관리자: 승인 대기(모든 달) · 처리 이력
  let pending: RequestsRaw['pending'] = []
  let history: RequestsRaw['history'] = []
  if (viewer.role === 'admin') {
    const plans = await db.select().from(monthPlans)
    const statusOf = (d: string) =>
      plans.find((p) => p.year === Number(d.slice(0, 4)) && p.month === Number(d.slice(5, 7)))?.status
    const queue = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.status, 'SUBMITTED'))
      .orderBy(asc(leaveRequests.startDate))
    pending = await Promise.all(
      queue.map(async (l) => {
        const confirmed = statusOf(l.startDate) === 'CONFIRMED'
        const m = Number(l.startDate.slice(5, 7))
        const impact = confirmed ? await leaveImpact(db, l.id) : null
        const day = (d: string) => `${formatMD(d)} (${weekdayKo(d)})`
        return {
          id: l.id,
          name: names.get(l.userId) ?? '',
          monthLabel: `${m}월 · ${confirmed ? '확정된 달' : '신청 중'}`,
          confirmedMonth: confirmed,
          kindLabel: leaveKindLabel(l.type as LeaveType, l.reasonCode),
          range: l.startDate === l.endDate ? day(l.startDate) : `${day(l.startDate)} – ${day(l.endDate)}`,
          days: Number(l.days),
          comment: l.comment,
          impact: impact?.lines ?? null,
          candidates: impact?.candidates ?? [],
        }
      }),
    )
    const done = await db
      .select()
      .from(leaveRequests)
      .where(or(eq(leaveRequests.status, 'APPROVED'), eq(leaveRequests.status, 'REJECTED')))
      .orderBy(desc(leaveRequests.decidedAt))
      .limit(10)
    history = done.map((l) => ({
      name: names.get(l.userId) ?? '',
      // 핸드오프 4a: '연차 · 11/6–7', 처리일 '09/24'
      kindLabel: `${leaveKindLabel(l.type as LeaveType, l.reasonCode).split(' · ')[0]} · ${
        l.startDate === l.endDate
          ? formatMD(l.startDate)
          : l.startDate.slice(0, 7) === l.endDate.slice(0, 7)
            ? `${formatMD(l.startDate)}–${Number(l.endDate.slice(8))}`
            : `${formatMD(l.startDate)}–${formatMD(l.endDate)}`
      }`,
      status: l.status as 'APPROVED' | 'REJECTED',
      reason: l.rejectReason,
      when: l.decidedAt ? todaySeoul(l.decidedAt).slice(5).replace('-', '/') : '',
    }))
  }

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
    users: people.map((u) => ({ id: u.id, name: u.name, seniorityRank: u.seniorityRank })),
    requests: requests.map((q) => ({
      userId: q.userId,
      date: q.date,
      options: q.options,
      special: q.special,
      comment: q.comment,
      submittedAt: q.submittedAt,
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
    })),
    scheduled,
    rules,
    viewerCard,
    pending,
    history,
    holidays: hol.map((h) => ({ date: h.date, kind: h.kind as HolidayKind })),
  }
}
