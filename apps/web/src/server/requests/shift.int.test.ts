import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { monthPlans, shiftRequests, users } from '../db/schema'
import { seedDev } from '../seed/dev'
import { ensureRequestPlan } from './plan'
import { deleteShiftRequest, saveShiftRequest, submitRequests } from './service'

const db = setupTestDb()
const NOV = { year: 2026, month: 11 }

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function planOf(month: number) {
  const [p] = await db
    .select()
    .from(monthPlans)
    .where(and(eq(monthPlans.year, 2026), eq(monthPlans.month, month)))
  return p
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('ensureRequestPlan (R-REQ-PLAN-1·2)', () => {
  it('신청 기간 안이면 REQUESTING으로 만든다(전월 15일 마감)', async () => {
    const p = await ensureRequestPlan(db, NOV, '2026-10-05', DEFAULT_RULES)
    expect(p).toMatchObject({
      status: 'REQUESTING',
      requestDeadline: '2026-10-15',
      negotiationStart: '2026-10-16',
    })
    expect(await ensureRequestPlan(db, NOV, '2026-10-06', DEFAULT_RULES)).toMatchObject({ id: p!.id })
  })

  it('신청 기간 전이면 만들지 않는다', async () => {
    expect(await ensureRequestPlan(db, { year: 2026, month: 12 }, '2026-10-05', DEFAULT_RULES)).toBeNull()
    expect(await planOf(12)).toBeUndefined()
  })

  it('마감이 지나면 REQUEST_CLOSED', async () => {
    await ensureRequestPlan(db, NOV, '2026-10-05', DEFAULT_RULES)
    expect(await ensureRequestPlan(db, NOV, '2026-10-16', DEFAULT_RULES)).toMatchObject({
      status: 'REQUEST_CLOSED',
    })
  })

  it('이미 확정된 달은 그대로', async () => {
    expect(await ensureRequestPlan(db, { year: 2026, month: 10 }, '2026-10-05', DEFAULT_RULES)).toMatchObject(
      {
        status: 'CONFIRMED',
      },
    )
  })
})

describe('근무 신청 (R-REQ-SHIFT·DRAFT)', () => {
  beforeEach(async () => {
    await ensureRequestPlan(db, NOV, '2026-10-05', DEFAULT_RULES)
  })

  it('간호사 저장은 임시, 제출하면 제출 시각', async () => {
    const me = await actor('00103')
    const r = await saveShiftRequest(
      db,
      me,
      { userId: me.id, date: '2026-11-13', options: ['OFF', 'D'], comment: '오후 병원' },
      '2026-10-05',
    )
    expect(r).toEqual({ ok: true })
    const [row] = await db.select().from(shiftRequests).where(eq(shiftRequests.userId, me.id))
    expect([row!.options, row!.comment, row!.submittedAt]).toEqual([['OFF', 'D'], '오후 병원', null])
    expect(await submitRequests(db, me, NOV, '2026-10-05')).toEqual({ ok: true, submitted: 1 })
    const [after] = await db.select().from(shiftRequests).where(eq(shiftRequests.userId, me.id))
    expect(after!.submittedAt).not.toBeNull()
  })

  it('제출 뒤 고치면 다시 임시', async () => {
    const me = await actor('00103')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: ['OFF'] }, '2026-10-05')
    await submitRequests(db, me, NOV, '2026-10-05')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: ['D'] }, '2026-10-05')
    const [row] = await db.select().from(shiftRequests).where(eq(shiftRequests.userId, me.id))
    expect([row!.options, row!.submittedAt]).toEqual([['D'], null])
  })

  it('남의 줄·마감 뒤·대상 월 밖은 거부, 관리자는 남의 줄도 곧바로 제출 상태', async () => {
    const me = await actor('00103')
    const other = await actor('00104')
    expect(
      await saveShiftRequest(
        db,
        me,
        { userId: other.id, date: '2026-11-13', options: ['OFF'] },
        '2026-10-05',
      ),
    ).toEqual({
      ok: false,
      message: '다른 사람의 신청은 바꿀 수 없습니다.',
    })
    expect(
      await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: ['OFF'] }, '2026-10-16'),
    ).toEqual({
      ok: false,
      message: '신청 기간이 아닙니다.',
    })
    expect(
      await saveShiftRequest(db, me, { userId: me.id, date: '2026-12-01', options: ['OFF'] }, '2026-10-05'),
    ).toEqual({
      ok: false,
      message: '신청 기간이 아닙니다.',
    })
    const admin = await actor('00101')
    expect(
      await saveShiftRequest(
        db,
        admin,
        { userId: other.id, date: '2026-11-13', options: ['E'] },
        '2026-10-20',
      ),
    ).toEqual({ ok: true })
    const [row] = await db.select().from(shiftRequests).where(eq(shiftRequests.userId, other.id))
    expect(row!.submittedAt).not.toBeNull()
  })

  it('입력 검증: 옵션과 교육을 함께·빈 신청은 거부', async () => {
    const me = await actor('00103')
    expect(
      (await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: [] }, '2026-10-05')).ok,
    ).toBe(false)
  })

  it('노조교육은 노조원·평일만, 연 한도(2회) 이내', async () => {
    const union = await actor('00103') // 가명 시드: 노조원
    const nonUnion = await actor('00105')
    expect(
      await saveShiftRequest(
        db,
        nonUnion,
        { userId: nonUnion.id, date: '2026-11-13', options: [], special: 'EDU_UNION' },
        '2026-10-05',
      ),
    ).toEqual({
      ok: false,
      message: '노조교육은 노조원만 신청할 수 있습니다.',
    })
    expect(
      await saveShiftRequest(
        db,
        union,
        { userId: union.id, date: '2026-11-14', options: [], special: 'EDU_UNION' },
        '2026-10-05',
      ),
    ).toEqual({
      ok: false,
      message: '노조교육은 평일에만 신청할 수 있습니다.',
    })
    await saveShiftRequest(
      db,
      union,
      { userId: union.id, date: '2026-11-12', options: [], special: 'EDU_UNION' },
      '2026-10-05',
    )
    await saveShiftRequest(
      db,
      union,
      { userId: union.id, date: '2026-11-13', options: [], special: 'EDU_UNION' },
      '2026-10-05',
    )
    expect(
      await saveShiftRequest(
        db,
        union,
        { userId: union.id, date: '2026-11-16', options: [], special: 'EDU_UNION' },
        '2026-10-05',
      ),
    ).toEqual({
      ok: false,
      message: '노조교육은 연 2회까지입니다.',
    })
  })

  it('삭제는 즉시', async () => {
    const me = await actor('00103')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-13', options: ['OFF'] }, '2026-10-05')
    expect(await deleteShiftRequest(db, me, { userId: me.id, date: '2026-11-13' }, '2026-10-05')).toEqual({
      ok: true,
    })
    expect(await db.$count(shiftRequests)).toBe(0)
  })
})
