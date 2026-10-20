import { applyEdits, checkSchedule, type CellEdit } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { leaveRequests, scheduleCells, shiftRequests, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { seedDev } from '../seed/dev'
import { DEFAULT_RULES } from '@duty/domain'
import { applyDraftLeaves } from './draft'
import { rerollFrom, rerollPreview } from './reroll'
import { adjustCheckInput, saveEdits } from './service'

// 3-9 4·9, 3-10 8·9: 확정된 달에 휴가를 (가정으로) 넣고 시작일 ~ 월말을 다시 생성한다
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

describe('rerollFrom', { timeout: 120_000 }, () => {
  it('3-10 9: 휴가는 가정으로만 넣고 다시 생성 → 저장 · 재배포 때 휴가·칸을 함께 저장', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    const FROM = '2026-10-20'
    expect(await rerollPreview(db, admin, { planId: plan.id, from: FROM })).toEqual({
      ok: true,
      swaps: 0,
      adminEdits: 0,
    })
    const before = await cellsOf(plan.id)

    const r = await rerollFrom(db, admin, {
      planId: plan.id,
      leave: { userId: me.id, type: 'sick', startDate: FROM, endDate: '2026-10-22' },
      today: TODAY,
    })
    if (!r.ok) throw new Error(JSON.stringify(r))
    // 리롤만으로는 아무것도 저장되지 않는다(간호사에게 안 보임)
    expect(await db.select().from(leaveRequests).where(eq(leaveRequests.userId, me.id))).toEqual([])
    expect(await cellsOf(plan.id)).toEqual(before)
    expect(r.leave).toMatchObject({ userId: me.id, type: 'sick', startDate: FROM, endDate: '2026-10-22' })
    expect(r.leave.cells.map((c) => c.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(r.edits.every((e) => e.date >= FROM)).toBe(true)
    // 휴가 칸은 고정이라 편집 대상이 아니다
    expect(r.edits.some((e) => e.userId === me.id && e.date <= '2026-10-22')).toBe(false)

    const input = await adjustCheckInput(db, plan)
    expect(
      checkSchedule({ ...input, cells: applyEdits(applyDraftLeaves(input.cells, [r.leave]), r.edits) })
        .hardViolations,
    ).toEqual([])
    expect(await saveEdits(db, admin, plan.id, r.edits, [r.leave], TODAY)).toMatchObject({ ok: true })
    const [lv] = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, me.id))
    expect(lv).toMatchObject({ status: 'APPROVED', byAdmin: true, type: 'sick', endDate: '2026-10-22' })
    const after = await cellsOf(plan.id)
    expect(
      after
        .filter((c) => c.userId === me.id && c.date >= FROM && c.date <= '2026-10-22')
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    ).toMatchObject([
      { code: 'LEAVE', source: 'admin' },
      { code: 'LEAVE', source: 'admin' },
      { code: 'LEAVE', source: 'admin' },
    ])
  })

  it('R-ADJ-7: 리롤 뒤 그 칸이 먼저 바뀌면 저장 전체 거부(휴가도 넣지 않는다)', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    const r = await rerollFrom(db, admin, {
      planId: plan.id,
      leave: { userId: me.id, type: 'annual', startDate: '2026-10-26', endDate: '2026-10-26' },
      today: TODAY,
    })
    if (!r.ok) throw new Error(JSON.stringify(r))
    // 다른 곳에서 휴가 칸이 먼저 바뀐다
    await db
      .update(scheduleCells)
      .set({ code: 'OFF', offKind: 'sleeping' })
      .where(
        and(
          eq(scheduleCells.monthPlanId, plan.id),
          eq(scheduleCells.userId, me.id),
          eq(scheduleCells.date, '2026-10-26'),
        ),
      )
    expect(await saveEdits(db, admin, plan.id, r.edits, [r.leave], TODAY)).toMatchObject({
      ok: false,
      message: expect.stringContaining('다른 곳에서 먼저 바뀐 칸'),
    })
    expect(await db.select().from(leaveRequests).where(eq(leaveRequests.userId, me.id))).toEqual([])
  })

  it('3-10 8: 저장 전 편집(수간호사 S→D)과 저장된 관리자 수정은 그대로 두고 나머지를 다시 짠다', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const other = await actor('00104')
    const plan = (await findPlan(db, OCT))!
    const cells = await cellsOf(plan.id)
    // 1) 저장된 관리자 수정: 첫 리롤 결과를 저장한다
    const r1 = await rerollFrom(db, admin, {
      planId: plan.id,
      leave: { userId: other.id, type: 'sick', startDate: '2026-10-15', endDate: '2026-10-15' },
      today: TODAY,
    })
    if (!r1.ok) throw new Error(JSON.stringify(r1))
    expect(await saveEdits(db, admin, plan.id, r1.edits, [r1.leave], TODAY)).toMatchObject({ ok: true })
    const savedAdmin = new Set(
      (await cellsOf(plan.id))
        .filter((c) => c.source === 'admin' && c.date >= '2026-10-20')
        .map((c) => `${c.userId}|${c.date}`),
    )

    // 2) 저장 전 편집: 수간호사 S → D
    const s = cells.find((c) => c.userId === admin.id && c.code === 'S' && c.date >= '2026-10-21')!
    const headEdit: CellEdit = {
      userId: admin.id,
      date: s.date,
      before: { code: 'S' },
      after: { code: 'D' },
      kind: 'manual',
    }
    const r2 = await rerollFrom(db, admin, {
      planId: plan.id,
      leave: { userId: me.id, type: 'sick', startDate: '2026-10-20', endDate: '2026-10-20' },
      edits: [headEdit],
      today: TODAY,
    })
    if (!r2.ok) throw new Error(JSON.stringify(r2))
    const touched = new Set(r2.edits.map((e) => `${e.userId}|${e.date}`))
    expect(touched.has(`${admin.id}|${s.date}`)).toBe(false)
    expect([...savedAdmin].some((k) => touched.has(k))).toBe(false)
    // 저장 전 편집 + 새 편집을 합쳐 저장할 수 있다
    expect(await saveEdits(db, admin, plan.id, [headEdit, ...r2.edits], [r2.leave], TODAY)).toMatchObject({
      ok: true,
    })
    const [head] = await db
      .select()
      .from(scheduleCells)
      .where(
        and(
          eq(scheduleCells.monthPlanId, plan.id),
          eq(scheduleCells.userId, admin.id),
          eq(scheduleCells.date, s.date),
        ),
      )
    expect(head!.code).toBe('D')
  })

  it('저장 전 편집이 DB와 다르면 리롤을 거부한다', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    const c = (await cellsOf(plan.id)).find(
      (x) => x.userId === me.id && x.code === 'D' && x.date >= '2026-10-25',
    )!
    const r = await rerollFrom(db, admin, {
      planId: plan.id,
      leave: { userId: me.id, type: 'sick', startDate: '2026-10-20', endDate: '2026-10-20' },
      edits: [{ userId: me.id, date: c.date, before: { code: 'N' }, after: { code: 'E' }, kind: 'manual' }],
      today: TODAY,
    })
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('다른 곳에서 먼저 바뀐 칸') })
  })

  it('경조·공가는 사유가 있어야 한다', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    expect(
      await rerollFrom(db, admin, {
        planId: plan.id,
        leave: { userId: me.id, type: 'family', startDate: '2026-10-20' },
        today: TODAY,
      }),
    ).toMatchObject({ ok: false, message: '사유를 선택해 주세요.' })
  })

  it('관리자만, 확정된 달만', async () => {
    const nurse = await actor('00103')
    const admin = await actor('00101')
    const oct = (await findPlan(db, OCT))!
    const leave = { userId: nurse.id, type: 'sick' as const, startDate: '2026-10-20' }
    expect(await rerollFrom(db, nurse, { planId: oct.id, leave, today: TODAY })).toMatchObject({ ok: false })
    const nov = await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES)
    expect(
      await rerollFrom(db, admin, {
        planId: nov!.id,
        leave: { ...leave, startDate: '2026-11-02' },
        today: TODAY,
      }),
    ).toMatchObject({
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
