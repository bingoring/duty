import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { cellEditLogs, leaveRequests, monthPlans, scheduleCells, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { projectedLeaveBalance } from './balance'
import { ensureRequestPlan } from './plan'
import { cancelLeave, decideLeave, leaveImpact, saveLeave, saveShiftRequest, submitRequests } from './service'

const db = setupTestDb()
const TODAY = '2026-10-05'

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function leaveOf(id: string) {
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id))
  return l!
}
async function cell(userId: string, date: string) {
  const [c] = await db
    .select()
    .from(scheduleCells)
    .where(and(eq(scheduleCells.userId, userId), eq(scheduleCells.date, date)))
  return c
}
const idOf = (r: Awaited<ReturnType<typeof saveLeave>>) => {
  if (!r.ok) throw new Error(r.message)
  return r.id
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES)
})

describe('saveLeave (R-LEAVE-1~5·8)', () => {
  it('경조사는 사유 일수로 종료일 자동, 간호사 저장은 임시', async () => {
    const me = await actor('00103')
    const id = idOf(
      await saveLeave(
        db,
        me,
        {
          userId: me.id,
          type: 'family',
          reasonCode: 'parent_death',
          startDate: '2026-11-19',
          comment: '부고',
        },
        TODAY,
      ),
    )
    expect(await leaveOf(id)).toMatchObject({
      endDate: '2026-11-25',
      days: '7.0',
      status: 'DRAFT',
      comment: '부고',
    })
  })

  it('경조사·공가는 사유가 필요하다', async () => {
    const me = await actor('00103')
    expect(
      await saveLeave(db, me, { userId: me.id, type: 'official', startDate: '2026-11-19' }, TODAY),
    ).toEqual({
      ok: false,
      message: '사유를 선택해 주세요.',
    })
  })

  it('같은 날의 근무 신청·다른 휴가와 겹치면 거부', async () => {
    const me = await actor('00103')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-20', options: ['OFF'] }, TODAY)
    expect(
      await saveLeave(
        db,
        me,
        { userId: me.id, type: 'annual', startDate: '2026-11-19', endDate: '2026-11-21' },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      message: '기간 안에 근무 신청이 있습니다.',
    })
    idOf(
      await saveLeave(
        db,
        me,
        { userId: me.id, type: 'annual', startDate: '2026-11-02', endDate: '2026-11-03' },
        TODAY,
      ),
    )
    expect(await saveLeave(db, me, { userId: me.id, type: 'sick', startDate: '2026-11-03' }, TODAY)).toEqual({
      ok: false,
      message: '기간 안에 다른 휴가가 있습니다.',
    })
  })

  it('예정 잔여를 넘으면 거부 — 대기 중인 다른 휴가까지 뺀다', async () => {
    const me = await actor('00103') // 시드: 연차 15, 검진 0.5
    idOf(
      await saveLeave(
        db,
        me,
        { userId: me.id, type: 'annual', startDate: '2026-11-02', endDate: '2026-11-11' },
        TODAY,
      ),
    )
    expect(
      await saveLeave(
        db,
        me,
        { userId: me.id, type: 'annual', startDate: '2026-11-16', endDate: '2026-11-21' },
        TODAY,
      ),
    ).toEqual({
      ok: false,
      message: '연차 잔여를 넘습니다 (신청 6일 / 잔여 5일).',
    })
    expect((await projectedLeaveBalance(db, me.id, TODAY)).annual).toBe(5)
    idOf(await saveLeave(db, me, { userId: me.id, type: 'checkup', startDate: '2026-11-24' }, TODAY))
    expect(
      await saveLeave(db, me, { userId: me.id, type: 'checkup', startDate: '2026-11-25' }, TODAY),
    ).toEqual({
      ok: false,
      message: '검진 반차 잔여를 넘습니다 (신청 0.5일 / 잔여 0일).',
    })
  })

  it('확정된 달(10월)에도 신청할 수 있고 지난 날짜도 된다, 마감된 달과 열리지 않은 달은 거부', async () => {
    const me = await actor('00103')
    idOf(await saveLeave(db, me, { userId: me.id, type: 'sick', startDate: '2026-10-02' }, TODAY))
    expect(await saveLeave(db, me, { userId: me.id, type: 'sick', startDate: '2026-12-02' }, TODAY)).toEqual({
      ok: false,
      message: '휴가를 신청할 수 있는 달이 아닙니다.',
    })
    await db.update(monthPlans).set({ status: 'CLOSED' }).where(eq(monthPlans.month, 10))
    expect(await saveLeave(db, me, { userId: me.id, type: 'sick', startDate: '2026-10-20' }, TODAY)).toEqual({
      ok: false,
      message: '휴가를 신청할 수 있는 달이 아닙니다.',
    })
  })

  it('다른 사람의 휴가는 신청할 수 없다', async () => {
    const me = await actor('00103')
    const other = await actor('00104')
    expect(
      await saveLeave(db, me, { userId: other.id, type: 'sick', startDate: '2026-11-02' }, TODAY),
    ).toEqual({
      ok: false,
      message: '다른 사람의 신청은 바꿀 수 없습니다.',
    })
  })
})

describe('제출·승인·반려·취소 (R-LEAVE-6, R-APPROVE-1·2·4)', () => {
  it('제출하면 SUBMITTED, 신청 중인 달 승인은 상태만 바꾼다', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const id = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-02' }, TODAY),
    )
    expect(await decideLeave(db, admin, id, { decision: 'approve' })).toEqual({
      ok: false,
      message: '제출된 휴가만 처리할 수 있습니다.',
    })
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    expect(await decideLeave(db, me, id, { decision: 'approve' })).toEqual({
      ok: false,
      message: '권한이 없습니다.',
    })
    expect(await decideLeave(db, admin, id, { decision: 'approve' })).toEqual({ ok: true })
    expect(await leaveOf(id)).toMatchObject({ status: 'APPROVED', decidedBy: admin.id })
  })

  it('확정된 달 승인은 칸을 휴가로 바꾸고 이력을 남긴다 (병가 → LEAVE, 검진 → 반차 표시)', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const sick = idOf(
      await saveLeave(
        db,
        me,
        { userId: me.id, type: 'sick', startDate: '2026-10-14', endDate: '2026-10-15' },
        TODAY,
      ),
    )
    const check = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'checkup', startDate: '2026-10-16' }, TODAY),
    )
    await submitRequests(db, me, { year: 2026, month: 10 }, TODAY)
    const before = (await cell(me.id, '2026-10-16'))!.code
    await decideLeave(db, admin, sick, { decision: 'approve' })
    await decideLeave(db, admin, check, { decision: 'approve' })
    expect(await cell(me.id, '2026-10-14')).toMatchObject({
      code: 'LEAVE',
      leaveKind: 'sick',
      offKind: null,
      source: 'admin',
    })
    expect(await cell(me.id, '2026-10-16')).toMatchObject({ code: before, checkupHalf: true })
    const logs = await db.select().from(cellEditLogs).where(eq(cellEditLogs.userId, me.id))
    expect(logs.map((l) => [l.date, l.reason]).sort()).toEqual([
      ['2026-10-14', 'leave_approved'],
      ['2026-10-15', 'leave_approved'],
      ['2026-10-16', 'leave_approved'],
    ])
  })

  it('반려는 사유가 필요하다', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const id = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-02' }, TODAY),
    )
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    expect(await decideLeave(db, admin, id, { decision: 'reject' })).toEqual({
      ok: false,
      message: '반려 사유를 입력해 주세요.',
    })
    expect(await decideLeave(db, admin, id, { decision: 'reject', reason: '인원 부족' })).toEqual({
      ok: true,
    })
    expect(await leaveOf(id)).toMatchObject({ status: 'REJECTED', rejectReason: '인원 부족' })
  })

  it('취소: 본인 임시는 삭제, 제출분은 CANCELLED, 관리자는 생성 전 승인분만', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    const draft = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-02' }, TODAY),
    )
    expect(await cancelLeave(db, me, draft, TODAY)).toEqual({ ok: true })
    expect(await db.$count(leaveRequests, eq(leaveRequests.id, draft))).toBe(0)
    const sub = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-03' }, TODAY),
    )
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    expect(await cancelLeave(db, me, sub, TODAY)).toEqual({ ok: true })
    expect((await leaveOf(sub)).status).toBe('CANCELLED')
    const oct = idOf(await saveLeave(db, me, { userId: me.id, type: 'sick', startDate: '2026-10-20' }, TODAY))
    await submitRequests(db, me, { year: 2026, month: 10 }, TODAY)
    await decideLeave(db, admin, oct, { decision: 'approve' })
    expect(await cancelLeave(db, admin, oct, TODAY)).toEqual({
      ok: false,
      message: '확정된 달의 승인된 휴가는 근무 조정에서 취소합니다.',
    })
  })
})

describe('leaveImpact (R-APPROVE-3)', () => {
  it('확정된 10월 10/2 D 유일한 교대 근무자가 병가면 D 인원 부족을 알린다', async () => {
    const who = await actor('00106') // 종이 10월: 10/2 D는 윤채원(가명) + 수간호사
    const id = idOf(
      await saveLeave(db, who, { userId: who.id, type: 'sick', startDate: '2026-10-02' }, TODAY),
    )
    // 대체 후보 = 그날 쉬는 교대 근무자 중 넣어도 새 필수 위반이 없는 사람, 덜 일한 사람 먼저(2-7 사용자 결정), 최대 3명
    expect(await leaveImpact(db, id)).toEqual({
      lines: ['10/2 (금) D 인원 1명 · 최소 2명'],
      candidates: ['오민지 (10/2 OFF, K-tass)', '배지현 (10/2 OFF, K-tass)'],
      // 2-7 R-LEAVE-C1: 「승인 · 대체 지정」이 여는 S9 대체 지정 날짜·듀티
      focus: { date: '2026-10-02', shift: 'D' },
    })
  })

  it('영향이 없으면 빈 목록, 신청 중인 달은 계산하지 않는다(null)', async () => {
    const me = await actor('00103')
    const oct = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-10-03' }, TODAY),
    ) // 10/3 정하늘 off
    expect(await leaveImpact(db, oct)).toEqual({ lines: [], candidates: [], focus: null })
    const nov = idOf(
      await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-02' }, TODAY),
    )
    expect(await leaveImpact(db, nov)).toBeNull()
  })
})
