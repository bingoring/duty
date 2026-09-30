import type { CellEdit } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { cellEditLogs, monthPlans, scheduleCells, users } from '../db/schema'
import { findPlan } from '../requests/plan'
import { seedDev } from '../seed/dev'
import { saveEdits, updateNegotiation } from './service'

const db = setupTestDb()
const OCT = { year: 2026, month: 10 }

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function cell(userId: string, date: string) {
  const [c] = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.date, date)))
  return c!
}
const edit = (
  c: Awaited<ReturnType<typeof cell>>,
  after: CellEdit['after'],
  extra: Partial<CellEdit> = {},
): CellEdit => ({
  userId: c.userId,
  date: c.date,
  before: {
    code: c.code as CellEdit['before']['code'],
    ...(c.offKind ? { offKind: c.offKind as 'regular' } : {}),
  },
  after,
  kind: 'manual',
  ...extra,
})

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('saveEdits (R-ADJ-2·6·7·8)', () => {
  it('편집 저장 → source admin, 수정 이력(예외 사유는 note)', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    // 종이 10월: 00102(가명 박서연) 10/31 D → OFF 로 바꿔도 필수 규칙은 그대로인지 서버가 판정한다
    const who = await actor('00107')
    const before = await cell(who.id, '2026-10-20')
    const r = await saveEdits(db, admin, plan.id, [
      edit(before, { code: before.code === 'OFF' ? 'D' : 'OFF' }, { override: { reason: '테스트' } }),
    ])
    expect(r).toMatchObject({ ok: true, saved: 1 })
    const after = await cell(who.id, '2026-10-20')
    expect(after.source).toBe('admin')
    expect(after.editedBy).toBe(admin.id)
    const logs = await db.select().from(cellEditLogs).where(eq(cellEditLogs.userId, who.id))
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ reason: 'manual', note: '테스트' })
  })

  it('새 필수 위반이 생기는데 예외 사유가 없으면 저장하지 않는다', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    // 10/2 D는 윤채원(00106) 한 명 + 수간호사(2-5 인원 영향 테스트와 같은 날). 윤채원을 OFF로 → D 인원 부족
    const chae = await actor('00106')
    const c = await cell(chae.id, '2026-10-02')
    const r = await saveEdits(db, admin, plan.id, [edit(c, { code: 'OFF' })])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.violations!.some((v) => v.startsWith('10/2 (금) D 인원'))).toBe(true)
    expect((await cell(chae.id, '2026-10-02')).code).toBe('D')
  })

  it('동시 수정: before가 현재 칸과 다르면 전체 거부', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    const who = await actor('00107')
    const c = await cell(who.id, '2026-10-20')
    const stale = {
      ...edit(c, { code: 'S' }),
      before: { code: c.code === 'N' ? ('E' as const) : ('N' as const) },
    }
    const r = await saveEdits(db, admin, plan.id, [stale])
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('다른 곳에서 먼저 바뀐 칸') })
  })

  it('간호사·마감한 달은 거부', async () => {
    const nurse = await actor('00103')
    const plan = (await findPlan(db, OCT))!
    expect(await saveEdits(db, nurse, plan.id, [])).toMatchObject({ ok: false, message: '권한이 없습니다.' })
    await db.update(monthPlans).set({ status: 'CLOSED' }).where(eq(monthPlans.id, plan.id))
    const admin = await actor('00101')
    expect(await saveEdits(db, admin, plan.id, [])).toMatchObject({
      ok: false,
      message: '마감한 달입니다. 마감 취소 후 수정하세요.',
    })
  })
})

describe('updateNegotiation (R-ADJ-11)', () => {
  it('마감일 뒤 ~ 대상 월 말일 안에서만 바꾼다', async () => {
    const admin = await actor('00101')
    const plan = (await findPlan(db, OCT))!
    expect(await updateNegotiation(db, admin, plan.id, { start: '2026-09-17', end: '2026-09-22' })).toEqual({
      ok: true,
    })
    const [p] = await db.select().from(monthPlans).where(eq(monthPlans.id, plan.id))
    expect([p!.negotiationStart, p!.negotiationEnd]).toEqual(['2026-09-17', '2026-09-22'])
    expect(
      await updateNegotiation(db, admin, plan.id, { start: '2026-09-22', end: '2026-09-17' }),
    ).toMatchObject({ ok: false })
    expect(
      await updateNegotiation(db, admin, plan.id, { start: plan.requestDeadline, end: '2026-09-20' }),
    ).toMatchObject({
      ok: false,
    })
  })
})
