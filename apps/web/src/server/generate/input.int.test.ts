import { SolverRequest } from '@duty/contract'
import { DEFAULT_RULES } from '@duty/domain'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { leaveRequests, monthPlans, scheduleCells, users } from '../db/schema'
import { ensureRequestPlan } from '../requests/plan'
import { decideLeave, saveLeave, saveShiftRequest, submitRequests } from '../requests/service'
import { ensureWard } from '../seed/core'
import { seedDev } from '../seed/dev'
import { adjustBalances } from '../staff/service'
import { buildGenerationInput, toSolverRequest } from './input'

const db = setupTestDb()
const TODAY = '2026-10-05'
const PRIORITIES = {
  requests: true,
  offAfterNight: true,
  weekendPair: true,
  avoidJuniorOnly: true,
  minimizeRepeatPairs: true,
}

async function actor(no: string) {
  const [u] = await db.select().from(users).where(eq(users.employeeNo, no))
  return { id: u!.id, role: u!.role as 'nurse' | 'admin' }
}
async function novPlan() {
  return (await ensureRequestPlan(db, { year: 2026, month: 11 }, TODAY, DEFAULT_RULES))!
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
})

describe('buildGenerationInput (business-logic-model §2)', () => {
  it('11월: 종이 10월 확정본을 전월로, 월초 잔여·목표 OFF·수간호사 칸을 채운다', async () => {
    const g = await buildGenerationInput(db, await novPlan())
    const req = toSolverRequest(g, { seed: 1, timeLimitSec: 20, priorities: PRIORITIES })
    expect(() => SolverRequest.parse(req)).not.toThrow()
    expect(g.prevMonthConfirmed).toBe(true)
    expect(req.days).toHaveLength(30)
    expect(req.nurses).toHaveLength(10)
    expect(req.heads).toHaveLength(1)

    const jung = (await actor('00103')).id
    const n103 = req.nurses.find((n) => n.id === jung)!
    // 11월 기준 OFF 9(주말) − 10월 정산 뒤 누적 OFF 4 (종이 10월 검증값)
    expect(n103.offTarget).toBe(5)
    expect(n103.workDays).toHaveLength(30)

    // 전월 꼬리: 교대 근무자만, 10/31 배지현(00108) N
    const bae = (await actor('00108')).id
    expect(req.prevTail.find((c) => c.userId === bae && c.date === '2026-10-31')?.code).toBe('N')
    expect(req.prevTail.some((c) => c.userId === req.heads[0]!.id)).toBe(false)

    // 수간호사: 11/1(일) OFF, 11/2(월) 기본 S — 솔버가 필요할 때만 D로 바꾸는 flex 칸(2-11 R-HEAD-1·3)
    const head = req.heads[0]!.cells
    expect(head.find((c) => c.date === '2026-11-01')).toMatchObject({ code: 'OFF' })
    expect(head.find((c) => c.date === '2026-11-02')).toMatchObject({ code: 'S' })
    expect(head.find((c) => c.date === '2026-11-02')).toMatchObject({ flex: true })
    expect(head.find((c) => c.date === '2026-11-01')).not.toHaveProperty('flex')

    // 빨간 날: 11월 주말 9일 + 전월 꼬리의 빨간 날
    expect(req.redDays.filter((d) => d.startsWith('2026-11'))).toHaveLength(9)
    expect(req.restHours.E!.D).toBe(8)
    expect(g.fixedViolations).toEqual([])
  })

  it('다음 달이 이미 확정되었으면 그 달 초 칸을 nextHead로 넘긴다 (2-9 발견: 경계 위반으로 생성이 늘 실패)', async () => {
    const before = await buildGenerationInput(db, await novPlan())
    expect(
      toSolverRequest(before, { seed: 1, timeLimitSec: 20, priorities: PRIORITIES }).nextHead,
    ).toBeUndefined()

    const [dec] = await db
      .insert(monthPlans)
      .values({
        wardId: await ensureWard(db),
        year: 2026,
        month: 12,
        status: 'CONFIRMED',
        requestDeadline: '2026-11-15',
        negotiationStart: '2026-11-16',
        negotiationEnd: '2026-11-20',
      })
      .returning()
    const bae = (await actor('00108')).id
    const head = (await actor('00101')).id
    await db.insert(scheduleCells).values(
      [bae, head].map((userId) => ({
        monthPlanId: dec!.id,
        userId,
        date: '2026-12-01',
        code: 'D',
        source: 'auto',
      })),
    )
    const g = await buildGenerationInput(db, await novPlan())
    const req = toSolverRequest(g, { seed: 1, timeLimitSec: 20, priorities: PRIORITIES })
    expect(() => SolverRequest.parse(req)).not.toThrow()
    // 교대 근무자만 (수간호사는 솔버 대상이 아니다)
    expect(req.nextHead).toEqual([{ userId: bae, date: '2026-12-01', code: 'D' }])
    expect(g.inputHash).not.toBe(before.inputHash)
  })

  it('승인된 휴가만으로 최대 연속 오프를 넘으면 생성 전에 원인을 알린다 (R-1)', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    await adjustBalances(db, { userId: me.id, values: { annual_leave: 20 }, note: '장기 연차' }, admin.id)
    const plan = await novPlan()
    const saved = await saveLeave(
      db,
      me,
      { userId: me.id, type: 'annual', startDate: '2026-11-02', endDate: '2026-11-17' },
      TODAY,
    )
    if (!saved.ok) throw new Error(saved.message)
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    expect(await decideLeave(db, admin, saved.id, { decision: 'approve' })).toEqual({ ok: true })
    const g = await buildGenerationInput(db, plan)
    expect(g.fixedViolations.map((v) => v.ruleId)).toContain('H-OFF-CONSEC')
  })

  it('10월 주말 통 OFF를 못 받은 사람은 미배정 연속 1', async () => {
    const g = await buildGenerationInput(db, await novPlan())
    const streaks = g.input.nurses
      .filter((n) => n.rotation === 'rotating')
      .map((n) => n.weekendPairMissedStreak)
    expect(streaks.every((s) => s === 0 || s === 1)).toBe(true)
    // D·E·N 누적은 10월 한 달 분
    const n = g.input.nurses.find((x) => x.rotation === 'rotating')!
    expect(n.shiftCountsBefore.D + n.shiftCountsBefore.E + n.shiftCountsBefore.N).toBeGreaterThan(10)
  })

  it('제출된 신청·승인 휴가·특수 신청이 입력에 들어가고, 해시가 바뀐다', async () => {
    const plan = await novPlan()
    const before = (await buildGenerationInput(db, plan)).inputHash
    const me = await actor('00103')
    const admin = await actor('00101')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-10', options: ['OFF', 'D'] }, TODAY)
    await saveShiftRequest(
      db,
      me,
      { userId: me.id, date: '2026-11-12', options: [], special: 'EDU_CONT' },
      TODAY,
    )
    const saved = await saveLeave(db, me, { userId: me.id, type: 'annual', startDate: '2026-11-20' }, TODAY)
    if (!saved.ok) throw new Error(saved.message)
    // 임시 상태는 입력에 없다
    expect((await buildGenerationInput(db, plan)).inputHash).toBe(before)
    await submitRequests(db, me, { year: 2026, month: 11 }, TODAY)
    await decideLeave(db, admin, saved.id, { decision: 'approve' })
    const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, saved.id))
    expect(l!.status).toBe('APPROVED')

    const g = await buildGenerationInput(db, plan)
    expect(g.inputHash).not.toBe(before)
    const n = g.base.nurses.find((x) => x.id === me.id)!
    expect(n.requests).toEqual([{ date: '2026-11-10', options: ['OFF', 'D'] }])
    expect(n.fixed).toEqual([
      { date: '2026-11-12', code: 'OFF', offKind: 'edu_cont' },
      { date: '2026-11-20', code: 'AL' },
    ])
  })

  it('입력 해시는 DB가 행을 돌려주는 순서에 흔들리지 않는다 (CI에서 확정이 간헐적으로 막힘)', async () => {
    const plan = await novPlan()
    const before = (await buildGenerationInput(db, plan)).inputHash
    // 같은 값으로 갱신하면 행이 힙 뒤로 옮겨져 순차 스캔 순서가 바뀐다
    await db.execute(sql`UPDATE schedule_cells SET source = source WHERE date >= '2026-10-25'`)
    await db.execute(sql`UPDATE users SET name = name WHERE employee_no IN ('00102', '00105')`)
    expect((await buildGenerationInput(db, plan)).inputHash).toBe(before)
  })
})
