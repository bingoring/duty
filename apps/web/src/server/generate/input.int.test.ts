import { SolverRequest } from '@duty/contract'
import { DEFAULT_RULES } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { leaveRequests, users } from '../db/schema'
import { ensureRequestPlan } from '../requests/plan'
import { decideLeave, saveLeave, saveShiftRequest, submitRequests } from '../requests/service'
import { seedDev } from '../seed/dev'
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

    // 수간호사: 11/1(일) OFF, 11/2(월) D
    const head = req.heads[0]!.cells
    expect(head.find((c) => c.date === '2026-11-01')).toMatchObject({ code: 'OFF' })
    expect(head.find((c) => c.date === '2026-11-02')).toMatchObject({ code: 'D' })

    // 빨간 날: 11월 주말 9일 + 전월 꼬리의 빨간 날
    expect(req.redDays.filter((d) => d.startsWith('2026-11'))).toHaveLength(9)
    expect(req.restHours.E!.D).toBe(8)
    expect(g.fixedViolations).toEqual([])
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
})
