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
  createLeaveProposal,
  listLeaveProposals,
  pendingProposalCount,
  respondLeaveProposal,
} from './proposals'
import { deleteShiftRequest, saveLeave, saveShiftRequest, submitRequests, type LeaveInput } from './service'

// 3-5: 관리자가 간호사의 OFF를 휴가로 바꾸자는 요청 → 간호사 수락·거절.
// 3-9부터 관리자는 바로 바꾸고(아래 「3-9」) 요청은 새로 만들지 않는다. 이미 보낸 대기 요청의 수락·거절은 그대로 동작한다

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
const proposedId = (r: Awaited<ReturnType<typeof createLeaveProposal>>) => {
  if (!r.ok) throw new Error(r.message)
  return r.id
}
// 3-9 전에 만들어진 대기 요청
const propose = (admin: { id: string; role: 'nurse' | 'admin' }, input: LeaveInput) =>
  createLeaveProposal(db, admin, input, { endDate: input.endDate ?? input.startDate, days: 1 })

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
      await propose(admin, {
        userId: me.id,
        type: 'annual',
        startDate: '2026-11-10',
        comment: '연차 소진 권장',
      }),
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
    const id = proposedId(await propose(admin, input))
    expect(await propose(admin, input)).toMatchObject({
      ok: false,
      message: expect.stringContaining('이미 보낸 휴가 변경 요청'),
    })
    expect(await respondLeaveProposal(db, me, id, 'reject', TODAY)).toEqual({ ok: true })
    expect((await proposalOf(id)).status).toBe('REJECTED')
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(1)

    const again = proposedId(await propose(admin, input))
    expect(await cancelLeaveProposal(db, me, again)).toMatchObject({ ok: false })
    expect(await cancelLeaveProposal(db, admin, again)).toEqual({ ok: true })
    expect(await respondLeaveProposal(db, me, again, 'accept', TODAY)).toMatchObject({ ok: false })
  })

  it('간호사가 그 날 신청을 OFF가 아니게 바꾸면 요청은 무효', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    const id = proposedId(await propose(admin, { userId: me.id, type: 'annual', startDate: '2026-11-10' }))
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-10', options: ['D'] }, TODAY)
    expect(await proposalOf(id)).toMatchObject({ status: 'INVALID' })
    expect(await respondLeaveProposal(db, me, id, 'accept', TODAY)).toMatchObject({ ok: false })
    expect(await db.$count(leaveRequests, eq(leaveRequests.userId, me.id))).toBe(0)
  })
})

describe('확정된 근무표의 OFF 칸 → 휴가 변경 요청', () => {
  it('수락하면 칸이 휴가로 바뀌고 이력이 남는다(편집자 = 본인)', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const date = await offCellOf(me.id)
    const id = proposedId(await propose(admin, { userId: me.id, type: 'annual', startDate: date }))
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
    const id = proposedId(await propose(admin, { userId: me.id, type: 'annual', startDate: date }))
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

describe('3-9 9·14: 관리자는 OFF를 바로 휴가로 바꾼다', () => {
  it('OFF 신청 날: 확인 뒤 신청을 지우고 승인된 휴가(관리자 입력)가 된다', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    const input = { userId: me.id, type: 'sick' as const, startDate: '2026-11-10' }
    expect(await saveLeave(db, admin, input, TODAY)).toMatchObject({ ok: false, needsReplace: true })
    expect(await saveLeave(db, admin, { ...input, replaceShift: true }, TODAY)).toMatchObject({
      ok: true,
      approved: true,
    })
    const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, me.id))
    expect(l).toMatchObject({ status: 'APPROVED', byAdmin: true, decidedBy: admin.id })
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(0)
    expect(await db.$count(leaveProposals)).toBe(0)
  })

  it('관리자는 간호사가 신청한 OFF를 근무로 바꾸거나 지우지 못한다', async () => {
    const me = await offRequest('00103', '2026-11-10')
    const admin = await actor('00101')
    expect(
      await saveShiftRequest(db, admin, { userId: me.id, date: '2026-11-10', options: ['D'] }, TODAY),
    ).toMatchObject({ ok: false })
    expect(await deleteShiftRequest(db, admin, { userId: me.id, date: '2026-11-10' }, TODAY)).toMatchObject({
      ok: false,
    })
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(1)
  })

  it('확정된 달 OFF 칸: 바로 휴가 칸이 되고 출처는 관리자(파란 테두리)', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const date = await offCellOf(me.id)
    expect(
      await saveLeave(db, admin, { userId: me.id, type: 'annual', startDate: date }, TODAY),
    ).toMatchObject({ ok: true, approved: true })
    expect(await cell(me.id, date)).toMatchObject({ code: 'AL', source: 'admin' })
  })
})

describe('3-9 2·3: 간호사 연차', () => {
  it('연차는 저장하면 바로 승인되고, 근무 신청이 있던 날은 확인 뒤 바꾼다', async () => {
    const me = await actor('00103')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-12', options: ['D'] }, TODAY)
    const input = { userId: me.id, type: 'annual' as const, startDate: '2026-11-12' }
    expect(await saveLeave(db, me, input, TODAY)).toMatchObject({ ok: false, needsReplace: true })
    expect(await saveLeave(db, me, { ...input, replaceShift: true }, TODAY)).toMatchObject({
      ok: true,
      approved: true,
    })
    const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.userId, me.id))
    expect(l).toMatchObject({ status: 'APPROVED', byAdmin: false })
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(0)
  })

  it('휴가가 있는 날에 근무를 신청하면 확인 뒤 휴가를 취소한다', async () => {
    const me = await actor('00103')
    await saveLeave(db, me, { userId: me.id, type: 'special', startDate: '2026-11-13' }, TODAY)
    const input = { userId: me.id, date: '2026-11-13', options: ['D' as const] }
    expect(await saveShiftRequest(db, me, input, TODAY)).toMatchObject({ ok: false, needsReplace: true })
    expect(await saveShiftRequest(db, me, { ...input, replaceLeave: true }, TODAY)).toMatchObject({
      ok: true,
    })
    expect(await db.$count(shiftRequests, eq(shiftRequests.userId, me.id))).toBe(1)
  })
})
