import { asc, desc, eq, or, sql } from 'drizzle-orm'
import { formatMD, weekdayKo, type LeaveType } from '@duty/domain'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans, users } from '../db/schema'
import { todaySeoul } from '../schedule/month'
import { leaveKindLabel, type RequestsRaw } from './dto'
import { leaveImpact } from './service'

// 관리자 휴가 승인: 승인 대기(모든 달)·최근 처리 이력. 데스크톱 근무 신청 화면과 3-12 모바일 관리 탭이 같이 쓴다
export async function loadLeaveApprovals(
  db: Db,
): Promise<{ pending: RequestsRaw['pending']; history: RequestsRaw['history'] }> {
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  )
  const plans = await db.select().from(monthPlans)
  const statusOf = (d: string) =>
    plans.find((p) => p.year === Number(d.slice(0, 4)) && p.month === Number(d.slice(5, 7)))?.status
  const queue = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.status, 'SUBMITTED'))
    .orderBy(asc(leaveRequests.startDate))
  const pending: RequestsRaw['pending'] = await Promise.all(
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
        focus: impact?.focus ? { ym: impact.focus.date.slice(0, 7), ...impact.focus } : null,
      }
    }),
  )
  const done = await db
    .select()
    .from(leaveRequests)
    .where(or(eq(leaveRequests.status, 'APPROVED'), eq(leaveRequests.status, 'REJECTED')))
    .orderBy(desc(leaveRequests.decidedAt))
    .limit(10)
  const history: RequestsRaw['history'] = done.map((l) => ({
    id: l.id,
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
  return { pending, history }
}

// 3-12 모바일 「관리」 탭 배지: 승인 대기 휴가 수만(달력은 읽지 않는다)
export async function pendingLeaveCount(db: Db): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .where(eq(leaveRequests.status, 'SUBMITTED'))
  return r?.n ?? 0
}
