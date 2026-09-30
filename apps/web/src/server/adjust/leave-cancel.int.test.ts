import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { cellEditLogs, leaveRequests, monthPlans, scheduleCells, users } from '../db/schema'
import { cancelApprovedLeave, decideLeave, saveLeave, submitRequests } from '../requests/service'
import { seedDev } from '../seed/dev'
import { findPlan } from '../requests/plan'
import { saveEdits } from './service'

// Build Spec 2-7 R-LEAVE-C2·C3, domain-entities §3 (Q4)
const db = setupTestDb()
const TODAY = '2026-10-05'

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
async function approvedSick(no: string, startDate: string, endDate: string) {
  const n = await actor(no)
  const admin = await actor('00101')
  const l = await saveLeave(db, n, { userId: n.id, type: 'sick', startDate, endDate }, TODAY)
  if (!l.ok) throw new Error(l.message)
  await submitRequests(db, n, { year: 2026, month: 10 }, TODAY)
  const r = await decideLeave(db, admin, l.id, { decision: 'approve' })
  if (!r.ok) throw new Error(r.message)
  return { nurse: n, leaveId: l.id }
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('cancelApprovedLeave (확정된 달)', () => {
  it('승인 전 칸으로 되돌리고 leave_cancelled 이력, 그 사이 다시 고친 칸은 건너뛴다', async () => {
    const admin = await actor('00101')
    const { nurse, leaveId } = await approvedSick('00107', '2026-10-20', '2026-10-21')
    const orig20 = (await db.select().from(cellEditLogs).where(eq(cellEditLogs.date, '2026-10-20')))[0]!
      .before as {
      code: string
    }
    // 10/21은 승인 뒤 관리자가 다시 고친다(병가 → OFF)
    const plan = (await findPlan(db, { year: 2026, month: 10 }))!
    const saved = await saveEdits(db, admin, plan.id, [
      {
        userId: nurse.id,
        date: '2026-10-21',
        before: { code: 'LEAVE', leaveKind: 'sick' },
        after: { code: 'OFF' },
        kind: 'manual',
        override: { reason: '테스트' },
      },
    ])
    expect(saved.ok, JSON.stringify(saved)).toBe(true)

    const r = await cancelApprovedLeave(db, admin, leaveId)
    expect(r).toMatchObject({ ok: true, restored: ['2026-10-20'], skipped: [{ date: '2026-10-21' }] })
    expect((await cell(nurse.id, '2026-10-20')).code).toBe(orig20.code)
    expect((await cell(nurse.id, '2026-10-21')).code).toBe('OFF')
    const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId))
    expect(l!.status).toBe('CANCELLED')
    const logs = await db
      .select()
      .from(cellEditLogs)
      .where(and(eq(cellEditLogs.userId, nurse.id), eq(cellEditLogs.reason, 'leave_cancelled')))
    expect(logs.map((x) => x.date)).toEqual(['2026-10-20'])
  })

  it('간호사·마감한 달은 거부', async () => {
    const { nurse, leaveId } = await approvedSick('00107', '2026-10-20', '2026-10-20')
    expect(await cancelApprovedLeave(db, nurse, leaveId)).toMatchObject({
      ok: false,
      message: '권한이 없습니다.',
    })
    await db.update(monthPlans).set({ status: 'CLOSED' }).where(eq(monthPlans.year, 2026))
    const admin = await actor('00101')
    expect(await cancelApprovedLeave(db, admin, leaveId)).toMatchObject({
      ok: false,
      message: '마감한 달이 포함된 휴가입니다. 마감 취소 후 취소하세요.',
    })
  })
})
