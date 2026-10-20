import { leaveDates, monthDates } from '@duty/domain'
import { and, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveRequests, monthPlans, shiftRequests } from '../db/schema'
import { Rejected, type Tx, type lockPlansFor } from '../plans/lock'
import { invalidateProposalsOn } from '../requests/proposals'
import { applyApprovedLeaveToCells, checkLeaveInput } from '../requests/service'
import { beforeOf, type DraftLeave, type DraftLeaveInput } from './draft'

// 3-10 9: 근무 조정의 저장 전 휴가 — 리롤 때는 가정으로만 쓰고, 「저장 · 재배포」 때 승인 휴가로 넣는다
type PlanRow = typeof monthPlans.$inferSelect
type CellRow = {
  userId: string
  date: string
  code: string
  offKind: string | null
  leaveKind: string | null
}
type Fail = { ok: false; message: string }

const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate

// 휴가 입력 검사(사유·종료일·겹침·잔여) + 이 달 칸의 넣기 전 값. 저장 전 휴가끼리도 겹치면 안 된다
export async function resolveDraftLeaves(
  db: Db,
  plan: Pick<PlanRow, 'year' | 'month'>,
  inputs: readonly DraftLeaveInput[],
  cells: readonly CellRow[],
  today: string,
): Promise<{ ok: true; leaves: DraftLeave[] } | Fail> {
  const days = new Set(monthDates(plan.year, plan.month))
  const at = new Map(cells.map((c) => [`${c.userId}|${c.date}`, c]))
  const out: DraftLeave[] = []
  for (const input of inputs) {
    if (!days.has(input.startDate)) return { ok: false, message: '휴가 시작일이 이 달이 아닙니다.' }
    const checked = await checkLeaveInput(db, { ...input, replaceShift: true }, today)
    if (!checked.ok) return checked
    const range = { startDate: input.startDate, endDate: checked.endDate }
    if (out.some((l) => l.userId === input.userId && overlaps(l, range)))
      return { ok: false, message: '저장 전 휴가와 기간이 겹칩니다.' }
    out.push({
      userId: input.userId,
      type: input.type,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      ...range,
      cells: leaveDates(range.startDate, range.endDate).flatMap((date) => {
        const c = at.get(`${input.userId}|${date}`)
        return c && days.has(date) ? [{ date, before: beforeOf(c) }] : []
      }),
    })
  }
  return { ok: true, leaves: out }
}

// 저장: 승인된 관리자 휴가로 넣고(saveLeave의 관리자 경로와 같은 결과) 칸·이력·교환 무효를 쓴다.
// 실패하면 Rejected를 던져 저장 트랜잭션 전체를 되돌린다
export async function persistDraftLeave(
  tx: Tx,
  plans: Awaited<ReturnType<typeof lockPlansFor>>,
  actor: { id: string },
  leave: DraftLeave,
  today: string,
) {
  const db = tx as unknown as Db
  const checked = await checkLeaveInput(db, { ...leave, replaceShift: true }, today)
  if (!checked.ok) throw new Rejected(checked.message)
  if (checked.endDate !== leave.endDate) throw new Rejected('휴가 기간이 바뀌었습니다. 새로 불러와 주세요.')
  const dates = leaveDates(leave.startDate, leave.endDate)
  const planOf = (d: string) =>
    plans.find((p) => p.year === Number(d.slice(0, 4)) && p.month === Number(d.slice(5, 7)))
  if (dates.some((d) => planOf(d)?.status === 'CLOSED')) throw new Rejected('마감된 달이 포함된 휴가입니다.')

  // 3-9 2: 기간 안 근무 신청은 지우고 휴가로 바꾼다
  const inRange = and(
    eq(shiftRequests.userId, leave.userId),
    gte(shiftRequests.date, leave.startDate),
    lte(shiftRequests.date, leave.endDate),
  )
  const overlapShift = await db.select({ date: shiftRequests.date }).from(shiftRequests).where(inRange)
  if (overlapShift.length) {
    await db.delete(shiftRequests).where(inRange)
    for (const q of overlapShift) await invalidateProposalsOn(db, leave.userId, q.date)
  }
  const now = new Date()
  const byAdmin = actor.id !== leave.userId
  await db.insert(leaveRequests).values({
    userId: leave.userId,
    type: leave.type,
    reasonCode: leave.reasonCode ?? null,
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: String(checked.days),
    status: 'APPROVED',
    byAdmin,
    decidedBy: actor.id,
    decidedAt: now,
    comment: null,
  })
  await applyApprovedLeaveToCells(tx, plans, { ...leave, byAdmin }, actor.id, now)
}
