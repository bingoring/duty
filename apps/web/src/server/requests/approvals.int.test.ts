import { DEFAULT_RULES } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { loadLeaveApprovals, pendingLeaveCount } from './approvals'
import { ensureRequestPlan } from './plan'
import { decideLeave, saveLeave, submitRequests } from './service'

const db = setupTestDb()
const TODAY = '2026-10-05'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES)
})

describe('3-12 휴가 승인 목록(모바일 관리 탭)', () => {
  it('승인 대기 수와 목록·처리 이력', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const ids: string[] = []
    for (const d of ['2026-11-02', '2026-11-09', '2026-11-16']) {
      const r = await saveLeave(db, me, { userId: me.id, type: 'special', startDate: d }, TODAY)
      if (!r.ok) throw new Error(r.message)
      ids.push(r.id)
    }
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    expect(await decideLeave(db, admin, ids[0]!, { decision: 'approve' })).toEqual({ ok: true })

    expect(await pendingLeaveCount(db)).toBe(2)
    const { pending, history } = await loadLeaveApprovals(db)
    expect(pending.map((p) => p.range)).toEqual(['11/9 (월)', '11/16 (월)'])
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ status: 'APPROVED' })
  })
})
