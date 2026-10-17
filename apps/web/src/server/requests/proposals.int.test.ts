import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import {
  cellEditLogs,
  leaveProposals,
  leaveRequests,
  scheduleCells,
  shiftRequests,
  users,
} from '../db/schema'
import { seedDev } from '../seed/dev'
import { ensureRequestPlan } from './plan'
import {
  cancelLeaveProposal,
  listLeaveProposals,
  pendingProposalCount,
  respondLeaveProposal,
} from './proposals'
import { saveLeave, saveShiftRequest, submitRequests } from './service'

// 3-5: 관리자가 간호사의 OFF를 휴가로 바꾸자는 요청 → 간호사 수락·거절
const db = setupTestDb()
const TODAY = '2026-10-05'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function proposalOf(id: string) {
  const [p] = await db.select().from(leaveProposals).where(eq(leaveProposals.id, id))
  return p!
}
async function cell(userId: string, date: string) {
  const [c] = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.date, date)))
  return c
}
// 시드의 확정된 10월에서 그 사람의 일반 OFF 칸 하나
async function offCellOf(userId: string) {
  const rows = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.code, 'OFF')))
  const c = rows.find((r) => (r.offKind ?? 'regular') === 'regular' && r.date >= '2026-10-06')
  return c!.date
}
const proposedId = (r: Awaited<ReturnType<typeof saveLeave>>) => {
  if (!r.ok || !('proposed' in r)) throw new Error(r.ok ? '요청이 아니라 휴가가 만들어졌습니다' : r.message)
  return r.id
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES)
})

async function offRequest(no: string, date: string) {
  const me = await actor(no)
  await saveShiftRequest(db, me, { userId: me.id, date, options: ['OFF'] }, TODAY)
  await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
  return me
}

describe('다음 달 OFF 신청 → 휴가 변경 요청', () => {
  it('관리자가 OFF 신청 칸에 휴가를 넣으면 요청이 되고, 수락하면 승인된 휴가가 되며 OFF 신청은 지워진다', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    const id = proposedId(
      await saveLeave(
        db,
        admin,
        { userId: me.id, type: 'annual', startDate: '2026-11-10', comment: '연차 소진 권장' },
        TODAY,
      ),
    )
    // 답하기 전에는 아무것도 바뀌지 않는다(생성은 OFF 신청으로 본다)
    expect(await db.$count(leaveRequests, eq(leaveRequests.userId, me.id))).toBe(0)
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(1)
    expect(await pendingProposalCount(db, me.id)).toBe(1)
    expect((await listLeaveProposals(db, me)).pending).toMatchObject([
      { kindLabel: '연차', range: '11/10', days: 1, by: expect.any(String), comment: '연차 소진 권장' },
    ])

    // 다른 사람은 답할 수 없다
    expect(await respondLeaveProposal(db, await actor('00104'), id, 'accept', TODAY)).toMatchObject({
      ok: false,
    })
    expect(await respondLeaveProposal(db, me, id, 'accept', TODAY)).toEqual({ ok: true })
    const p = await proposalOf(id)
    expect(p.status).toBe('ACCEPTED')
    const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, p.leaveRequestId!))
    expect(leave).toMatchObject({
      userId: me.id,
      type: 'annual',
      startDate: '2026-11-10',
      status: 'APPROVED',
      decidedBy: admin.id,
      comment: '연차 소진 권장',
    })
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(0)
    expect(await pendingProposalCount(db, me.id)).toBe(0)
  })

  it('거절하면 OFF 신청 그대로, 같은 날 두 번 보낼 수 없고 관리자는 대기 요청을 취소한다', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    const input = { userId: me.id, type: 'sick' as const, startDate: '2026-11-10', endDate: '2026-11-10' }
    const id = proposedId(await saveLeave(db, admin, input, TODAY))
    expect(await saveLeave(db, admin, input, TODAY)).toMatchObject({
      ok: false,
      message: expect.stringContaining('이미 보낸 휴가 변경 요청'),
    })
    expect(await respondLeaveProposal(db, me, id, 'reject', TODAY)).toEqual({ ok: true })
    expect((await proposalOf(id)).status).toBe('REJECTED')
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(1)

    const again = proposedId(await saveLeave(db, admin, input, TODAY))
    expect(await cancelLeaveProposal(db, me, again)).toMatchObject({ ok: false })
    expect(await cancelLeaveProposal(db, admin, again)).toEqual({ ok: true })
    expect(await respondLeaveProposal(db, me, again, 'accept', TODAY)).toMatchObject({ ok: false })
  })

  it('간호사가 그 날 신청을 OFF가 아니게 바꾸면 요청은 무효', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    const id = proposedId(
      await saveLeave(db, admin, { userId: me.id, type: 'annual', startDate: '2026-11-10' }, TODAY),
    )
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-10', options: ['D'] }, TODAY)
    expect(await proposalOf(id)).toMatchObject({ status: 'INVALID' })
    expect(await respondLeaveProposal(db, me, id, 'accept', TODAY)).toMatchObject({ ok: false })
    expect(await db.$count(leaveRequests, eq(leaveRequests.userId, me.id))).toBe(0)
  })

  it('관리자가 신청이 없는 날에 넣은 휴가는 예전처럼 바로 제출된다', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const r = await saveLeave(db, admin, { userId: me.id, type: 'annual', startDate: '2026-11-12' }, TODAY)
    expect(r).toMatchObject({ ok: true })
    expect(r).not.toHaveProperty('proposed')
  })
})

describe('확정된 근무표의 OFF 칸 → 휴가 변경 요청', () => {
  it('수락하면 칸이 휴가로 바뀌고 이력이 남는다(편집자 = 본인)', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const date = await offCellOf(me.id)
    const id = proposedId(
      await saveLeave(db, admin, { userId: me.id, type: 'annual', startDate: date }, TODAY),
    )
    expect((await cell(me.id, date))!.code).toBe('OFF')
    expect(await respondLeaveProposal(db, me, id, 'accept', TODAY)).toEqual({ ok: true })
    expect(await cell(me.id, date)).toMatchObject({ code: 'AL', source: 'requested', editedBy: me.id })
    const logs = await db
      .select()
      .from(cellEditLogs)
      .where(and(eq(cellEditLogs.userId, me.id), eq(cellEditLogs.date, date)))
    expect(logs).toMatchObject([{ reason: 'leave_approved', before: { code: 'OFF' }, after: { code: 'AL' } }])
  })

  it('수락 전에 그 칸이 근무로 바뀌었으면 무효', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const date = await offCellOf(me.id)
    const id = proposedId(
      await saveLeave(db, admin, { userId: me.id, type: 'annual', startDate: date }, TODAY),
    )
    await db
      .update(scheduleCells)
      .set({ code: 'D', offKind: null })
      .where(and(eq(scheduleCells.userId, me.id), eq(scheduleCells.date, date)))
    expect(await respondLeaveProposal(db, me, id, 'accept', TODAY)).toMatchObject({
      ok: false,
      message: expect.stringContaining('더 이상 OFF가 아닙니다'),
    })
    expect(await proposalOf(id)).toMatchObject({ status: 'INVALID' })
    expect((await cell(me.id, date))!.code).toBe('D')
  })
})
