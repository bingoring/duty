import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import { swapRequestItems, swapRequests } from '../db/schema'

// Build Spec 2-8 R-SWAP-9 — 칸이 바뀌면 그 칸이 걸린 대기 교환 요청을 무효로.
// 교환 반영과 2-7 관리자 저장·휴가 승인·휴가 취소 트랜잭션 안에서 부른다(순환 참조를 피해 따로 둔다)
type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
export const INVALID_BY_ADMIN = '관리자가 근무를 바꿨습니다'

export async function invalidateSwapsForCells(
  db: DbOrTx,
  planId: string,
  cells: { userId: string; date: string }[],
  reason: string,
  exceptId?: string,
) {
  if (!cells.length) return
  const rows = await db
    .select({ id: swapRequests.id, userId: swapRequestItems.userId, date: swapRequests.date })
    .from(swapRequests)
    .innerJoin(swapRequestItems, eq(swapRequestItems.requestId, swapRequests.id))
    .where(
      and(
        eq(swapRequests.monthPlanId, planId),
        eq(swapRequests.status, 'PENDING'),
        inArray(swapRequests.date, [...new Set(cells.map((c) => c.date))]),
      ),
    )
  const hit = new Set(cells.map((c) => `${c.userId}|${c.date}`))
  const ids = [
    ...new Set(rows.filter((r) => r.id !== exceptId && hit.has(`${r.userId}|${r.date}`)).map((r) => r.id)),
  ]
  if (ids.length)
    await db
      .update(swapRequests)
      .set({ status: 'INVALID', closedReason: reason, closedAt: new Date() })
      .where(and(inArray(swapRequests.id, ids), eq(swapRequests.status, 'PENDING')))
}
