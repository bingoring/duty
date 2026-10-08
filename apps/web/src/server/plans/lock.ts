import { and, asc, eq, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { monthPlans } from '../db/schema'

// R-1 동시성: 칸·정산을 쓰는 경로(관리자 저장·교환 반영·휴가 승인/취소·확정·마감/마감 취소)는
// 트랜잭션 안에서 그 달의 계획 행을 먼저 잠그고, 상태·칸·규칙 검사를 잠근 뒤에 다시 한다.
// 잠금 순서는 언제나 계획 행(연·월 오름차순) → 그 밖의 행. 이 순서를 지키면 교착이 생기지 않는다.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export async function lockPlan(tx: Tx, planId: string) {
  const [p] = await tx.select().from(monthPlans).where(eq(monthPlans.id, planId)).for('update')
  return p
}

// 날짜들이 걸친 달의 계획 행을 연·월 순으로 잠근다(계획이 없는 달은 건너뜀)
export async function lockPlansFor(tx: Tx, dates: readonly string[]) {
  const yms = [...new Set(dates.map((d) => d.slice(0, 7)))]
  if (!yms.length) return []
  return tx
    .select()
    .from(monthPlans)
    .where(
      or(
        ...yms.map((ym) =>
          and(eq(monthPlans.year, Number(ym.slice(0, 4))), eq(monthPlans.month, Number(ym.slice(5, 7)))),
        ),
      ),
    )
    .orderBy(asc(monthPlans.year), asc(monthPlans.month))
    .for('update')
}

// 잠근 뒤 다시 검사해서 거부할 때 트랜잭션을 되돌린다
export class Rejected extends Error {}
export async function rejectable<T>(run: () => Promise<T>): Promise<T | { ok: false; message: string }> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof Rejected) return { ok: false, message: e.message }
    throw e
  }
}

// 월 마감·마감 취소·연초 처리는 서로의 결과(앞뒤 달 상태, 12월 정산, 연초 리셋)에 기대므로 한 줄로 세운다
export async function lockMonthClosing(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('duty-month-closing'))`)
}
