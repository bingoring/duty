import { nextPlanStatus } from '@duty/domain'
import { and, eq, inArray, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import { cellEditLogs, monthPlans, scheduleCells, swapRequests } from '../db/schema'
import { lockPlan, Rejected, rejectable } from '../plans/lock'
import { findPlan } from '../requests/plan'
import { shiftYm, type YearMonth } from '../schedule/month'

// 3-8 확정 철회: 확정된 달을 생성안 검토(DRAFTING)로 돌려 다시 생성·확정한다.
// 근무표 칸·편집 이력을 지우고(확정 뒤 교환·관리자 수정은 사라짐) 대기 중 교환 요청은 무효. 승인된 휴가는 그대로(다시 생성할 때 고정 칸).
// 마감한 달, 다음 달이 이미 확정·마감된 달(월 경계가 그 달에 묶임)은 철회할 수 없다

export type RevokePreview =
  { ok: true; swaps: number; adminEdits: number; leaveEdits: number } | { ok: false; message: string }

async function blockReason(db: Db, ym: YearMonth): Promise<string | null> {
  const plan = await findPlan(db, ym)
  if (!plan || plan.status !== 'CONFIRMED')
    return plan?.status === 'CLOSED'
      ? '마감한 달은 철회할 수 없습니다. 먼저 마감을 취소하세요.'
      : '확정된 달이 아닙니다.'
  const next = await findPlan(db, shiftYm(ym, 1))
  if (next && (next.status === 'CONFIRMED' || next.status === 'CLOSED'))
    return '다음 달 근무표가 이미 확정되어 철회할 수 없습니다(월 경계 규칙이 이 달에 묶여 있음).'
  return null
}

export async function revokePreview(db: Db, ym: YearMonth): Promise<RevokePreview> {
  const reason = await blockReason(db, ym)
  if (reason) return { ok: false, message: reason }
  const plan = (await findPlan(db, ym))!
  const logs = await db
    .select({ userId: cellEditLogs.userId, date: cellEditLogs.date, reason: cellEditLogs.reason })
    .from(cellEditLogs)
    .where(eq(cellEditLogs.monthPlanId, plan.id))
  const cells = (r: string[]) =>
    new Set(logs.filter((l) => r.includes(l.reason)).map((l) => `${l.userId}|${l.date}`)).size
  const swaps = await db.$count(
    swapRequests,
    and(eq(swapRequests.monthPlanId, plan.id), eq(swapRequests.status, 'APPLIED')),
  )
  return {
    ok: true,
    swaps,
    adminEdits: cells(['manual']),
    leaveEdits: cells(['leave_approved', 'leave_cancelled']),
  }
}

export async function revokeConfirmation(
  outer: Db,
  actor: { id: string; role: 'nurse' | 'admin' },
  ym: YearMonth,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.role !== 'admin') return { ok: false, message: '권한이 없습니다.' }
  const found = await findPlan(outer, ym)
  if (!found) return { ok: false, message: '확정된 달이 아닙니다.' }
  return rejectable(() =>
    outer.transaction(async (tx) => {
      const db = tx as unknown as Db
      const plan = await lockPlan(tx, found.id)
      const reason = await blockReason(db, ym)
      if (!plan || reason) throw new Rejected(reason ?? '확정된 달이 아닙니다.')
      await tx
        .update(swapRequests)
        .set({ status: 'INVALID', closedReason: '근무표 확정이 철회되었습니다.', closedAt: new Date() })
        .where(and(eq(swapRequests.monthPlanId, plan.id), inArray(swapRequests.status, ['PENDING'])))
      await tx.delete(cellEditLogs).where(eq(cellEditLogs.monthPlanId, plan.id))
      await tx.delete(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))
      const [done] = await tx
        .update(monthPlans)
        .set({
          status: nextPlanStatus('CONFIRMED', 'REVOKE', { today: '', year: plan.year, month: plan.month }),
          confirmedCandidateId: null,
          confirmedBy: null,
          confirmedAt: null,
        })
        .where(
          and(
            eq(monthPlans.id, plan.id),
            eq(monthPlans.status, 'CONFIRMED'),
            ne(monthPlans.status, 'CLOSED'),
          ),
        )
        .returning({ id: monthPlans.id })
      if (!done) throw new Rejected('확정된 달이 아닙니다.')
      return { ok: true as const }
    }),
  )
}
