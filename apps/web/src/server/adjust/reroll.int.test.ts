import { applyEdits, checkSchedule } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { scheduleCells, shiftRequests, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { saveLeave } from '../requests/service'
import { seedDev } from '../seed/dev'
import { DEFAULT_RULES } from '@duty/domain'
import { rerollFrom, rerollPreview } from './reroll'
import { adjustCheckInput, saveEdits } from './service'

// 3-9 4·9: 확정된 달에 휴가를 넣고 시작일 ~ 월말을 다시 생성한다
const db = setupTestDb()
const OCT = { year: 2026, month: 10 }
const TODAY = '2026-10-05'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function cellsOf(planId: string) {
  return db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, planId))
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('rerollFrom', { timeout: 60_000 }, () => {
  it('휴가를 넣고 시작일부터 다시 생성 → 시작일 전 칸은 그대로, 편집안을 저장하면 필수 위반 없음', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    const FROM = '2026-10-20'
    expect(await rerollPreview(db, admin, { planId: plan.id, from: FROM })).toEqual({
      ok: true,
      swaps: 0,
      adminEdits: 0,
    })
    expect(
      await saveLeave(
        db,
        admin,
        { userId: me.id, type: 'sick', startDate: FROM, endDate: '2026-10-22' },
        TODAY,
      ),
    ).toMatchObject({ ok: true, approved: true })

    const r = await rerollFrom(db, admin, { planId: plan.id, from: FROM })
    if (!r.ok) throw new Error(JSON.stringify(r))
    expect(r.edits.every((e) => e.date >= FROM)).toBe(true)
    // 휴가 칸은 고정이라 편집 대상이 아니다
    expect(r.edits.some((e) => e.userId === me.id && e.date <= '2026-10-22')).toBe(false)

    const input = await adjustCheckInput(db, plan)
    expect(checkSchedule({ ...input, cells: applyEdits(input.cells, r.edits) }).hardViolations).toEqual([])
    expect(await saveEdits(db, admin, plan.id, r.edits)).toMatchObject({ ok: true })
    const after = await cellsOf(plan.id)
    expect(after.filter((c) => c.userId === me.id && c.date >= FROM && c.date <= '2026-10-22')).toMatchObject(
      [{ code: 'LEAVE' }, { code: 'LEAVE' }, { code: 'LEAVE' }],
    )
  })

  it('관리자만, 확정된 달만', async () => {
    const nurse = await actor('00103')
    const admin = await actor('00101')
    const oct = (await findPlan(db, OCT))!
    expect(await rerollFrom(db, nurse, { planId: oct.id, from: '2026-10-20' })).toMatchObject({ ok: false })
    const nov = await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES)
    expect(await rerollFrom(db, admin, { planId: nov!.id, from: '2026-11-02' })).toMatchObject({
      ok: false,
      message: '확정된 달만 다시 생성할 수 있습니다.',
    })
  })
})

describe('3-9 9: 간호사가 신청한 OFF', () => {
  it('근무 조정에서 D·E·N으로 바꿀 수 없다', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    const off = (await cellsOf(plan.id)).find(
      (c) => c.userId === me.id && c.code === 'OFF' && (c.offKind ?? 'regular') === 'regular',
    )!
    await db.insert(shiftRequests).values({
      userId: me.id,
      year: 2026,
      month: 10,
      date: off.date,
      options: ['OFF'],
      submittedAt: new Date(),
    })
    const r = await saveEdits(db, admin, plan.id, [
      {
        userId: me.id,
        date: off.date,
        before: { code: 'OFF', offKind: 'regular' },
        after: { code: 'D' },
        kind: 'manual',
        override: { reason: '테스트' },
      },
    ])
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('간호사가 신청한 OFF') })
    const [c] = await db
      .select()
      .from(scheduleCells)
      .where(and(eq(scheduleCells.userId, me.id), eq(scheduleCells.date, off.date)))
    expect(c!.code).toBe('OFF')
  })
})
