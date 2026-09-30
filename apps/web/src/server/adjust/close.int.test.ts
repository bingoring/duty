import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { balanceEntries, monthPlans, monthSettlements, users } from '../db/schema'
import { ensureWard } from '../seed/core'
import { findPlan } from '../requests/plan'
import { ledgerSums } from '../schedule/balances'
import { seedDev } from '../seed/dev'
import { closeMonth, closeState, previewClose, reopenMonth } from './close'

const db = setupTestDb()
const OCT = { year: 2026, month: 10 }
const AFTER_OCT = '2026-11-01'

type PaperNurse = { employeeNo: string; rotation: string; paperOffCarryAfter: number }
const paper = JSON.parse(
  readFileSync(new URL('../../../../../fixtures/paper-2026-10.json', import.meta.url), 'utf8'),
) as { nurses: PaperNurse[] }

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('월 마감 (R-CLOSE-1~4)', () => {
  it('달이 끝나기 전에는 마감할 수 없다', async () => {
    const plan = (await findPlan(db, OCT))!
    expect(await closeState(db, plan, '2026-10-31')).toMatchObject({
      can: false,
      reason: '10월이 끝난 뒤 마감할 수 있습니다.',
    })
    const admin = await actor('00101')
    expect(await closeMonth(db, admin, plan.id, '2026-10-31')).toMatchObject({ ok: false })
  })

  it('종이 10월 마감 → 스냅샷·원장, 누적 OFF가 종이 값과 같다. 마감 취소 → 원래대로', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    expect(await closeState(db, plan, AFTER_OCT)).toMatchObject({ can: true, canReopen: false })
    const preview = await previewClose(db, plan)
    expect(preview).toHaveLength(11)

    const ids = (await db.select({ id: users.id }).from(users)).map((u) => u.id)
    const before = await ledgerSums(db, ids)
    expect(await closeMonth(db, admin, plan.id, AFTER_OCT)).toEqual({ ok: true })
    const [p] = await db.select().from(monthPlans).where(eq(monthPlans.id, plan.id))
    expect(p!.status).toBe('CLOSED')
    expect(p!.closedBy).toBe(admin.id)
    expect(
      await db.select().from(monthSettlements).where(eq(monthSettlements.monthPlanId, plan.id)),
    ).toHaveLength(11)

    const after = await ledgerSums(db, ids)
    for (const n of paper.nurses) {
      const u = await actor(n.employeeNo)
      expect(after.get(u.id)!.off_carry, n.employeeNo).toBe(n.paperOffCarryAfter)
    }
    // 다시 마감할 수 없고, 마감 취소 가능
    expect(await closeMonth(db, admin, plan.id, AFTER_OCT)).toMatchObject({ ok: false })
    const closed = (await findPlan(db, OCT))!
    expect(await closeState(db, closed, AFTER_OCT)).toMatchObject({ can: false, canReopen: true })

    expect(await reopenMonth(db, admin, plan.id)).toEqual({ ok: true })
    const reopened = await ledgerSums(db, ids)
    for (const id of ids) expect(reopened.get(id)).toEqual(before.get(id))
    expect(
      await db.select().from(monthSettlements).where(eq(monthSettlements.monthPlanId, plan.id)),
    ).toHaveLength(0)
    const reversed = await db
      .select()
      .from(balanceEntries)
      .where(and(eq(balanceEntries.reason, 'settlement_reversed'), eq(balanceEntries.refMonth, 10)))
    expect(reversed.length).toBeGreaterThan(0)
    expect((await findPlan(db, OCT))!.status).toBe('CONFIRMED')
  })

  it('마감 → 취소 → 다시 마감 → 다시 취소해도 원장이 제자리로 돌아온다', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    const ids = (await db.select({ id: users.id }).from(users)).map((u) => u.id)
    const before = await ledgerSums(db, ids)
    for (let i = 0; i < 2; i++) {
      expect(await closeMonth(db, admin, plan.id, AFTER_OCT)).toEqual({ ok: true })
      expect(await reopenMonth(db, admin, plan.id)).toEqual({ ok: true })
    }
    const after = await ledgerSums(db, ids)
    for (const id of ids) expect(after.get(id)).toEqual(before.get(id))
  })

  it('앞 달이 확정·미마감이면 뒷 달을 마감할 수 없고, 뒷 달이 마감이면 앞 달을 취소할 수 없다', async () => {
    const admin = await actor('00101')
    const ward = await ensureWard(db)
    const [nov] = await db
      .insert(monthPlans)
      .values({
        wardId: ward,
        year: 2026,
        month: 11,
        status: 'CONFIRMED',
        requestDeadline: '2026-10-15',
        negotiationStart: '2026-10-16',
        negotiationEnd: '2026-10-20',
      })
      .returning()
    expect(await closeState(db, nov!, '2026-12-01')).toMatchObject({
      can: false,
      reason: '10월을 먼저 마감하세요.',
    })

    const oct = (await findPlan(db, OCT))!
    expect(await closeMonth(db, admin, oct.id, '2026-12-01')).toEqual({ ok: true })
    await db.update(monthPlans).set({ status: 'CLOSED' }).where(eq(monthPlans.id, nov!.id))
    expect(await reopenMonth(db, admin, oct.id)).toMatchObject({
      ok: false,
      message: '11월을 먼저 마감 취소하세요.',
    })
    const nurse = await actor('00103')
    expect(await reopenMonth(db, nurse, nov!.id)).toMatchObject({ ok: false, message: '권한이 없습니다.' })
  })
})
