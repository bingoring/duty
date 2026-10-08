import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../test/db'
import { closeMonth } from './adjust/close'
import { saveEdits } from './adjust/service'
import { balanceEntries, cellEditLogs, monthSettlements, scheduleCells, users } from './db/schema'
import { decideLeave, saveLeave, submitRequests } from './requests/service'
import { findPlan } from './requests/plan'
import { ledgerSums } from './schedule/balances'
import { planSettlements } from './schedule/load'
import { seedDev } from './seed/dev'
import { adjustBalances } from './staff/service'

// R-1 동시성 회귀: 리뷰에서 나온 경합을 실제로 동시에 실행한다(풀 연결 5개)
const db = setupTestDb()
const OCT = { year: 2026, month: 10 }

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function cellOf(userId: string, date: string) {
  const [c] = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.date, date)))
  return c!
}
const asEdit = (
  userId: string,
  date: string,
  c: { code: string; offKind: string | null },
  to: 'D' | 'E' | 'N' | 'OFF',
) => ({
  userId,
  date,
  before: { code: c.code as 'D', ...(c.offKind ? { offKind: c.offKind as 'regular' } : {}) },
  after: { code: to },
  override: { reason: '동시성 테스트' },
  kind: 'manual' as const,
})

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('동시 실행 (R-1)', () => {
  it('같은 칸을 두 관리자가 동시에 저장하면 하나만 들어간다', async () => {
    const admin = await actor('00101')
    const me = await actor('00110')
    const plan = (await findPlan(db, OCT))!
    const c = await cellOf(me.id, '2026-10-20')
    const [a, b] = await Promise.all([
      saveEdits(db, admin, plan.id, [asEdit(me.id, '2026-10-20', c, c.code === 'N' ? 'E' : 'N')]),
      saveEdits(db, admin, plan.id, [asEdit(me.id, '2026-10-20', c, c.code === 'OFF' ? 'D' : 'OFF')]),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(await db.$count(cellEditLogs, eq(cellEditLogs.userId, me.id))).toBe(1)
  })

  it('같은 휴가를 동시에 두 번 승인해도 승인 이력은 날짜마다 하나다', async () => {
    const admin = await actor('00101')
    const me = await actor('00106')
    const saved = await saveLeave(
      db,
      me,
      { userId: me.id, type: 'sick', startDate: '2026-10-21' },
      '2026-10-13',
    )
    if (!saved.ok) throw new Error(saved.message)
    await submitRequests(db, me, OCT, '2026-10-13')
    const r = await Promise.all([
      decideLeave(db, admin, saved.id, { decision: 'approve' }),
      decideLeave(db, admin, saved.id, { decision: 'approve' }),
    ])
    expect(r.filter((x) => x.ok)).toHaveLength(1)
    expect(
      await db.$count(
        cellEditLogs,
        and(eq(cellEditLogs.userId, me.id), eq(cellEditLogs.reason, 'leave_approved')),
      ),
    ).toBe(1)
  })

  it('마감과 칸 편집이 겹쳐도 정산 스냅샷은 최종 칸과 같다', async () => {
    const admin = await actor('00101')
    const me = await actor('00110')
    const plan = (await findPlan(db, OCT))!
    const c = await cellOf(me.id, '2026-10-20')
    const to = c.code === 'OFF' ? 'D' : 'OFF'
    await Promise.all([
      closeMonth(db, admin, plan.id, '2026-11-02'),
      saveEdits(db, admin, plan.id, [asEdit(me.id, '2026-10-20', c, to)]),
    ])
    const after = (await findPlan(db, OCT))!
    expect(after.status).toBe('CLOSED')
    const [snap] = await db
      .select()
      .from(monthSettlements)
      .where(and(eq(monthSettlements.monthPlanId, plan.id), eq(monthSettlements.userId, me.id)))
    const now = (await planSettlements(db, after)).find((x) => x.userId === me.id)!.result
    expect(snap!.actualOff).toBe(now.actualOff)
  })

  it('잔여치 조정을 동시에 두 번 제출해도 목표값이 된다', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const input = { userId: me.id, values: { annual_leave: 12 }, note: '정정' }
    await Promise.all([adjustBalances(db, input, admin.id), adjustBalances(db, input, admin.id)])
    expect((await ledgerSums(db, [me.id])).get(me.id)!.annual_leave).toBe(12)
    expect(
      await db.$count(
        balanceEntries,
        and(eq(balanceEntries.userId, me.id), eq(balanceEntries.reason, 'admin_adjust')),
      ),
    ).toBe(1)
  })
})
