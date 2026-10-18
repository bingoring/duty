import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { cellEditLogs, monthPlans, scheduleCells, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { seedDev } from '../seed/dev'
import { revokeConfirmation, revokePreview } from './revoke'

// 3-8 확정 철회. 시드: 10월 확정(종이 근무표), 11월 신청 중
const db = setupTestDb()
const OCT = { year: 2026, month: 10 }

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, { year: 2026, month: 11 }, '2026-10-05', DEFAULT_RULES)
})

describe('확정 철회 (3-8)', () => {
  it('미리 보기로 사라질 관리자 수정을 알리고, 철회하면 칸·이력을 지우고 생성안 검토로 돌아간다', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    const [c] = await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id)).limit(1)
    await db.insert(cellEditLogs).values({
      monthPlanId: plan.id,
      userId: c!.userId,
      date: c!.date,
      before: { code: c!.code },
      after: { code: 'OFF' },
      editedBy: admin.id,
      editedAt: new Date(),
      reason: 'manual',
    })
    expect(await revokePreview(db, OCT)).toEqual({ ok: true, swaps: 0, adminEdits: 1, leaveEdits: 0 })
    expect(await revokeConfirmation(db, await actor('00103'), OCT)).toMatchObject({ ok: false })
    expect(await revokeConfirmation(db, admin, OCT)).toEqual({ ok: true })
    const after = (await findPlan(db, OCT))!
    expect(after).toMatchObject({ status: 'DRAFTING', confirmedCandidateId: null, confirmedBy: null })
    expect(await db.$count(scheduleCells, eq(scheduleCells.monthPlanId, plan.id))).toBe(0)
    expect(await db.$count(cellEditLogs, eq(cellEditLogs.monthPlanId, plan.id))).toBe(0)
    expect(await revokeConfirmation(db, admin, OCT)).toMatchObject({
      ok: false,
      message: '확정된 달이 아닙니다.',
    })
  })

  it('다음 달이 확정됐거나 마감한 달이면 철회할 수 없다', async () => {
    const admin = await actor('00101')
    const nov = (await findPlan(db, { year: 2026, month: 11 }))!
    await db.update(monthPlans).set({ status: 'CONFIRMED' }).where(eq(monthPlans.id, nov.id))
    expect(await revokeConfirmation(db, admin, OCT)).toMatchObject({
      ok: false,
      message: expect.stringContaining('다음 달'),
    })
    await db.update(monthPlans).set({ status: 'REQUESTING' }).where(eq(monthPlans.id, nov.id))
    const oct = (await findPlan(db, OCT))!
    await db
      .update(monthPlans)
      .set({ status: 'CLOSED' })
      .where(and(eq(monthPlans.id, oct.id)))
    expect(await revokePreview(db, OCT)).toMatchObject({
      ok: false,
      message: expect.stringContaining('마감'),
    })
  })
})
