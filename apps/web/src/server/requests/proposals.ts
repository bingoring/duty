import { formatMD, leaveDates, type LeaveType } from '@duty/domain'
import { and, desc, eq, gte, inArray, isNotNull, lte, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { leaveProposals, leaveRequests, scheduleCells, shiftRequests, users } from '../db/schema'
import { lockPlansFor, Rejected, rejectable } from '../plans/lock'
import { leaveKindLabel } from './dto'
import type { PlanRow } from './plan'
import {
  applyApprovedLeaveToCells,
  checkLeaveInput,
  type Actor,
  type LeaveInput,
  type Result,
} from './service'

// 3-5 (DECISIONS 2026-10-17): 관리자가 간호사의 OFF를 휴가로 바꾸려면 간호사가 수락해야 한다.
// 대상 = 다음 달의 제출된 OFF 신청, 확정된 근무표의 OFF 칸. 휴가 종류는 근무 신청에서 고를 수 있는 모든 종류.
// 수락 → 승인된 휴가(확정된 달은 칸 대체), 거절 → 그대로. 답하기 전 생성은 OFF 신청으로 본다

const deny = (message: string) => ({ ok: false as const, message })

// 그 날이 간호사의 OFF인가: 확정된 달은 근무표 칸, 아니면 제출된 OFF 신청
export async function isOffTarget(
  db: Db,
  plan: PlanRow,
  input: { userId: string; startDate: string },
): Promise<boolean> {
  if (plan.status === 'CONFIRMED') {
    const [c] = await db
      .select({ code: scheduleCells.code })
      .from(scheduleCells)
      .where(
        and(
          eq(scheduleCells.monthPlanId, plan.id),
          eq(scheduleCells.userId, input.userId),
          eq(scheduleCells.date, input.startDate),
        ),
      )
    return c?.code === 'OFF'
  }
  const [r] = await db
    .select({ options: shiftRequests.options, special: shiftRequests.special })
    .from(shiftRequests)
    .where(
      and(
        eq(shiftRequests.userId, input.userId),
        eq(shiftRequests.date, input.startDate),
        isNotNull(shiftRequests.submittedAt),
      ),
    )
  return !!r && !r.special && r.options.includes('OFF')
}

// saveLeave 트랜잭션 안에서 부른다(그 달 계획 행이 잠겨 있다)
export async function createLeaveProposal(
  db: Db,
  actor: Actor,
  input: LeaveInput,
  leave: { endDate: string; days: number },
): Promise<{ ok: true; id: string; proposed: true } | { ok: false; message: string }> {
  const dup = await db.$count(
    leaveProposals,
    and(
      eq(leaveProposals.userId, input.userId),
      eq(leaveProposals.status, 'PENDING'),
      lte(leaveProposals.startDate, leave.endDate),
      gte(leaveProposals.endDate, input.startDate),
    ),
  )
  if (dup > 0) return deny('이미 보낸 휴가 변경 요청이 있습니다. 간호사의 답을 기다리거나 취소해 주세요.')
  const [row] = await db
    .insert(leaveProposals)
    .values({
      userId: input.userId,
      proposedBy: actor.id,
      type: input.type,
      reasonCode: input.reasonCode ?? null,
      startDate: input.startDate,
      endDate: leave.endDate,
      days: String(leave.days),
      comment: input.comment?.trim() || null,
      status: 'PENDING',
    })
    .returning({ id: leaveProposals.id })
  return { ok: true, id: row!.id, proposed: true }
}

const ymOf = (d: string) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) })

export async function respondLeaveProposal(
  outer: Db,
  actor: Actor,
  id: string,
  decision: 'accept' | 'reject',
  today: string,
): Promise<Result> {
  if (decision === 'reject') {
    const [done] = await outer
      .update(leaveProposals)
      .set({ status: 'REJECTED', closedAt: new Date() })
      .where(
        and(
          eq(leaveProposals.id, id),
          eq(leaveProposals.userId, actor.id),
          eq(leaveProposals.status, 'PENDING'),
        ),
      )
      .returning({ id: leaveProposals.id })
    return done ? { ok: true } : deny('그사이 처리된 요청입니다. 새로 불러와 주세요.')
  }
  return rejectable(() =>
    outer.transaction(async (tx) => {
      const db = tx as unknown as Db
      const [head] = await db.select().from(leaveProposals).where(eq(leaveProposals.id, id))
      if (!head || head.userId !== actor.id) throw new Rejected('요청을 찾을 수 없습니다.')
      // R-1: 걸친 달의 계획 행을 잠근 뒤 요청 행을 잠그고 다시 본다(확정·마감·다른 수락과 직렬화)
      const plans = await lockPlansFor(tx, leaveDates(head.startDate, head.endDate))
      const [p] = await tx.select().from(leaveProposals).where(eq(leaveProposals.id, id)).for('update')
      if (!p || p.status !== 'PENDING') throw new Rejected('그사이 처리된 요청입니다. 새로 불러와 주세요.')

      const invalid = async (reason: string) => {
        await tx
          .update(leaveProposals)
          .set({ status: 'INVALID', closedReason: reason, closedAt: new Date() })
          .where(eq(leaveProposals.id, id))
        return deny(`요청이 무효가 되었습니다: ${reason}`)
      }
      const planOf = (d: string) => plans.find((x) => x.year === ymOf(d).year && x.month === ymOf(d).month)
      const dates = leaveDates(p.startDate, p.endDate)
      if (dates.some((d) => planOf(d)?.status === 'CLOSED')) return invalid('마감된 달이 들어 있습니다.')
      const startPlan = planOf(p.startDate)
      if (!startPlan || !(await isOffTarget(db, startPlan, p)))
        return invalid(
          startPlan?.status === 'CONFIRMED'
            ? '근무표의 그 날이 더 이상 OFF가 아닙니다.'
            : '그 날의 OFF 신청이 바뀌었습니다.',
        )
      const input: LeaveInput = {
        userId: p.userId,
        type: p.type as LeaveType,
        startDate: p.startDate,
        endDate: p.endDate,
        ...(p.reasonCode ? { reasonCode: p.reasonCode } : {}),
        ...(p.comment ? { comment: p.comment } : {}),
      }
      const checked = await checkLeaveInput(db, input, today)
      if (!checked.ok) return invalid(checked.message)

      const now = new Date()
      // 휴가 기간의 근무 신청(OFF 신청 포함)은 휴가로 바뀌므로 지운다
      await tx
        .delete(shiftRequests)
        .where(
          and(
            eq(shiftRequests.userId, p.userId),
            gte(shiftRequests.date, p.startDate),
            lte(shiftRequests.date, p.endDate),
          ),
        )
      const [leave] = await tx
        .insert(leaveRequests)
        .values({
          userId: p.userId,
          type: p.type,
          reasonCode: p.reasonCode,
          startDate: p.startDate,
          endDate: p.endDate,
          days: p.days,
          status: 'APPROVED',
          decidedBy: p.proposedBy,
          decidedAt: now,
          comment: p.comment,
        })
        .returning({ id: leaveRequests.id })
      // 본인이 수락해 바뀐 칸이므로 편집자는 본인(본인에게 "바뀐 근무" 안내를 띄우지 않는다)
      await applyApprovedLeaveToCells(tx, plans, p, actor.id, now)
      await tx
        .update(leaveProposals)
        .set({ status: 'ACCEPTED', leaveRequestId: leave!.id, closedAt: now })
        .where(eq(leaveProposals.id, id))
      return { ok: true as const }
    }),
  )
}

export async function cancelLeaveProposal(db: Db, actor: Actor, id: string): Promise<Result> {
  if (actor.role !== 'admin') return deny('권한이 없습니다.')
  const [done] = await db
    .update(leaveProposals)
    .set({ status: 'CANCELLED', closedAt: new Date() })
    .where(and(eq(leaveProposals.id, id), eq(leaveProposals.status, 'PENDING')))
    .returning({ id: leaveProposals.id })
  return done ? { ok: true } : deny('그사이 처리된 요청입니다. 새로 불러와 주세요.')
}

// 간호사가 그 날 신청을 바꾸거나 지우면 그 날로 시작하는 대기 요청은 무효(saveShiftRequest·deleteShiftRequest 안에서)
export async function invalidateProposalsOn(db: Db, userId: string, date: string) {
  await db
    .update(leaveProposals)
    .set({ status: 'INVALID', closedReason: '그 날의 근무 신청이 바뀌었습니다.', closedAt: new Date() })
    .where(
      and(
        eq(leaveProposals.userId, userId),
        eq(leaveProposals.startDate, date),
        eq(leaveProposals.status, 'PENDING'),
      ),
    )
}

export type ProposalDTO = {
  id: string
  name: string
  by: string
  kindLabel: string
  range: string
  days: number
  comment: string | null
  status: string
  statusLabel: string
  closedReason: string | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '답 대기',
  ACCEPTED: '수락 · 휴가로 바뀜',
  REJECTED: '거절',
  CANCELLED: '보낸 쪽 취소',
  INVALID: '무효',
}

// 간호사: 받은 요청(대기 + 최근 처리 5건), 관리자: 모든 대기 요청 + 최근 처리 10건
export async function listLeaveProposals(
  db: Db,
  viewer: Actor,
): Promise<{ pending: ProposalDTO[]; recent: ProposalDTO[] }> {
  const mine = viewer.role === 'admin' ? undefined : eq(leaveProposals.userId, viewer.id)
  const pending = await db
    .select()
    .from(leaveProposals)
    .where(and(eq(leaveProposals.status, 'PENDING'), mine))
    .orderBy(leaveProposals.startDate)
  const recent = await db
    .select()
    .from(leaveProposals)
    .where(and(ne(leaveProposals.status, 'PENDING'), mine))
    .orderBy(desc(leaveProposals.closedAt))
    .limit(viewer.role === 'admin' ? 10 : 5)
  const ids = [...new Set([...pending, ...recent].flatMap((p) => [p.userId, p.proposedBy]))]
  const names = new Map(
    ids.length
      ? (await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))).map(
          (u) => [u.id, u.name],
        )
      : [],
  )
  const dto = (p: typeof leaveProposals.$inferSelect): ProposalDTO => ({
    id: p.id,
    name: names.get(p.userId) ?? '',
    by: names.get(p.proposedBy) ?? '',
    kindLabel: leaveKindLabel(p.type as LeaveType, p.reasonCode),
    range: `${formatMD(p.startDate)}${p.endDate !== p.startDate ? `–${formatMD(p.endDate)}` : ''}`,
    days: Number(p.days),
    comment: p.comment,
    status: p.status,
    statusLabel: STATUS_LABEL[p.status] ?? p.status,
    closedReason: p.closedReason,
  })
  return { pending: pending.map(dto), recent: recent.map(dto) }
}

// 메뉴 배지·근무표 띠: 내가 답할 휴가 변경 요청 수
export async function pendingProposalCount(db: Db, userId: string): Promise<number> {
  return db.$count(
    leaveProposals,
    and(eq(leaveProposals.userId, userId), eq(leaveProposals.status, 'PENDING')),
  )
}
