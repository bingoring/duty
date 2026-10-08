import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { scheduleCells, users } from '../db/schema'
import { findPlan } from '../requests/plan'
import { saveEdits } from '../adjust/service'
import { seedDev } from '../seed/dev'
import { ackNotices, loadNotices } from './service'

// Build Spec 2-7 R-NOTICE-1~3 (Q3)
const db = setupTestDb()

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('바뀐 근무 안내', () => {
  it('남이 바꾼 내 칸만, 확인하면 사라진다', async () => {
    const admin = await actor('00101')
    const me = await actor('00107')
    const other = await actor('00108')
    const plan = (await findPlan(db, { year: 2026, month: 10 }))!
    const cells = await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))
    const mine = cells.find((c) => c.userId === me.id && c.date === '2026-10-20')!
    const theirs = cells.find((c) => c.userId === other.id && c.date === '2026-10-20')!
    const r = await saveEdits(
      db,
      admin,
      plan.id,
      [mine, theirs].map((c) => ({
        userId: c.userId,
        date: c.date,
        before: { code: c.code as 'D', ...(c.offKind ? { offKind: c.offKind as 'regular' } : {}) },
        after: { code: c.code === 'S' ? ('D' as const) : ('S' as const) },
        kind: 'manual' as const,
        override: { reason: '테스트' },
      })),
    )
    expect(r.ok, JSON.stringify(r)).toBe(true)

    const n = await loadNotices(db, me.id)
    expect(n.items).toHaveLength(1)
    expect(n.items[0]).toMatchObject({ date: '2026-10-20', after: 'S', by: '한수정', ym: '2026-10' })
    expect(n.items[0]!.label).toMatch(/^10\/20 \(화\) .+ → S$/)
    expect(n.more).toBe(0)
    // 관리자 자신이 바꾼 칸은 관리자에게 안내하지 않는다
    expect((await loadNotices(db, admin.id)).items).toEqual([])

    await ackNotices(db, me.id, new Date(n.seenUpTo!))
    expect((await loadNotices(db, me.id)).items).toEqual([])
  })

  it('띠를 그린 뒤에 생긴 변경은 「확인」으로 사라지지 않는다 (R-1)', async () => {
    const admin = await actor('00101')
    const me = await actor('00107')
    const plan = (await findPlan(db, { year: 2026, month: 10 }))!
    const edit = async (date: string) => {
      const cell = (await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))).find(
        (x) => x.userId === me.id && x.date === date,
      )!
      const r = await saveEdits(db, admin, plan.id, [
        {
          userId: me.id,
          date,
          before: { code: cell.code as 'D', ...(cell.offKind ? { offKind: cell.offKind as 'regular' } : {}) },
          after: { code: cell.code === 'S' ? ('D' as const) : ('S' as const) },
          kind: 'manual' as const,
          override: { reason: '테스트' },
        },
      ])
      expect(r.ok, JSON.stringify(r)).toBe(true)
    }
    await edit('2026-10-20')
    const shown = await loadNotices(db, me.id) // 화면에 그린 시점
    await edit('2026-10-22') // 그 뒤 관리자가 또 바꿈
    await ackNotices(db, me.id, new Date(shown.seenUpTo!))
    expect((await loadNotices(db, me.id)).items.map((i) => i.date)).toEqual(['2026-10-22'])
  })
})
