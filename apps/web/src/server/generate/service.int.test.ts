import { DEFAULT_RULES } from '@duty/domain'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { candidateCells, monthPlans, scheduleCandidates, scheduleCells, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { decideLeave, saveLeave, saveShiftRequest, submitRequests } from '../requests/service'
import { seedDev } from '../seed/dev'
import { confirmCandidate, generate, isStale } from './service'

const db = setupTestDb()
const BEFORE = '2026-10-05'
const AFTER = '2026-10-16'
const NOV = { year: 2026, month: 11 }
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
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r as Extract<T, { ok: true }>
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, NOV, BEFORE, DEFAULT_RULES)
})

describe('generate (R-GEN-1~3·7·10)', { timeout: 60_000 }, () => {
  it('신청 마감 전에는 생성할 수 없다 (Q1)', async () => {
    const admin = await actor('00101')
    expect(await generate(db, admin, NOV, { priorities: PRIORITIES, today: BEFORE })).toMatchObject({
      ok: false,
      kind: 'blocked',
      message: '10/15 신청 마감 뒤 생성할 수 있습니다.',
    })
    const nurse = await actor('00103')
    expect(await generate(db, nurse, NOV, { priorities: PRIORITIES, today: AFTER })).toMatchObject({
      ok: false,
      message: '권한이 없습니다.',
    })
  })

  it('마감 뒤 생성 → 1번째 안, DRAFTING, 하드 위반 0, 신청 충족 칸은 requested. 리롤 → 2번째 안', async () => {
    const me = await actor('00103')
    const admin = await actor('00101')
    await saveShiftRequest(db, me, { userId: me.id, date: '2026-11-10', options: ['OFF'] }, BEFORE)
    await submitRequests(db, me, NOV, BEFORE)

    const t0 = Date.now()
    const r = ok(await generate(db, admin, NOV, { priorities: PRIORITIES, seed: 11, today: AFTER }))
    expect(Date.now() - t0).toBeLessThan(30_000)
    expect(r.no).toBe(1)
    expect((await findPlan(db, NOV))!.status).toBe('DRAFTING')
    const [cand] = await db.select().from(scheduleCandidates).where(eq(scheduleCandidates.id, r.candidateId))
    expect(cand!.checkResult.hardViolations).toEqual([])
    expect(cand!.seed).toBe(11)
    const cells = await db.select().from(candidateCells).where(eq(candidateCells.candidateId, r.candidateId))
    expect(cells).toHaveLength(11 * 30)
    const mine = cells.find((c) => c.userId === me.id && c.date === '2026-11-10')!
    expect(mine.code).toBe('OFF')
    expect(mine.source).toBe('requested')

    const r2 = ok(await generate(db, admin, NOV, { priorities: PRIORITIES, seed: 12, today: AFTER }))
    expect(r2.no).toBe(2)
  })

  it('솔버에 연결할 수 없으면 안내하고 상태를 바꾸지 않는다 (R-GEN-9)', async () => {
    const admin = await actor('00101')
    const prev = process.env.SOLVER_URL
    process.env.SOLVER_URL = 'http://127.0.0.1:9'
    try {
      expect(await generate(db, admin, NOV, { priorities: PRIORITIES, today: AFTER })).toMatchObject({
        ok: false,
        kind: 'unreachable',
      })
    } finally {
      process.env.SOLVER_URL = prev
    }
    expect((await findPlan(db, NOV))!.status).toBe('REQUEST_CLOSED')
  })

  it('같은 날 7명이 병가면 불가능과 원인을 돌려준다 (R-GEN-12)', async () => {
    const admin = await actor('00101')
    for (const no of ['00102', '00103', '00104', '00105', '00106', '00107', '00108']) {
      const n = await actor(no)
      const l = ok(await saveLeave(db, n, { userId: n.id, type: 'sick', startDate: '2026-11-18' }, BEFORE))
      await submitRequests(db, n, NOV, BEFORE)
      ok(await decideLeave(db, admin, l.id, { decision: 'approve' }))
    }
    const r = await generate(db, admin, NOV, { priorities: PRIORITIES, today: AFTER })
    expect(r).toMatchObject({ ok: false, kind: 'infeasible' })
    if (r.ok) return
    expect(r.causes!.length).toBeGreaterThan(0)
    expect(r.causes!.length).toBeLessThanOrEqual(5)
    expect(r.causes!.some((c) => c.startsWith('11/18 (수)') || c.includes('휴가'))).toBe(true)
  })
})

describe('confirmCandidate (R-GEN-4~6)', { timeout: 90_000 }, () => {
  it('입력이 바뀐 안은 확정할 수 없고, 다시 생성한 안을 확정하면 근무표에 복사·CONFIRMED', async () => {
    const admin = await actor('00101')
    const me = await actor('00103')
    const first = ok(await generate(db, admin, NOV, { priorities: PRIORITIES, seed: 3, today: AFTER }))
    // 마감 뒤 관리자가 신청을 고치면 입력 해시가 바뀐다
    await saveShiftRequest(db, admin, { userId: me.id, date: '2026-11-11', options: ['OFF'] }, AFTER)
    const [c1] = await db
      .select()
      .from(scheduleCandidates)
      .where(eq(scheduleCandidates.id, first.candidateId))
    expect(await isStale(db, c1!)).toBe(true)
    expect(await confirmCandidate(db, admin, first.candidateId, AFTER)).toEqual({
      ok: false,
      message: '신청·휴가·규칙이 바뀌었습니다. 다시 생성해 주세요.',
    })

    const second = ok(await generate(db, admin, NOV, { priorities: PRIORITIES, seed: 4, today: AFTER }))
    expect(await confirmCandidate(db, me, second.candidateId, AFTER)).toMatchObject({ ok: false })
    expect(await confirmCandidate(db, admin, second.candidateId, AFTER)).toEqual({ ok: true })

    const plan = (await findPlan(db, NOV))!
    expect(plan.status).toBe('CONFIRMED')
    expect(plan.confirmedCandidateId).toBe(second.candidateId)
    const cells = await db.select().from(scheduleCells).where(eq(scheduleCells.monthPlanId, plan.id))
    expect(cells).toHaveLength(11 * 30)
    const [mine] = await db
      .select()
      .from(scheduleCells)
      .where(
        and(
          eq(scheduleCells.monthPlanId, plan.id),
          eq(scheduleCells.userId, me.id),
          eq(scheduleCells.date, '2026-11-11'),
        ),
      )
    expect(mine!.code).toBe('OFF')

    // 확정된 달은 다시 생성·확정하지 않는다
    expect(await generate(db, admin, NOV, { priorities: PRIORITIES, today: AFTER })).toMatchObject({
      kind: 'blocked',
    })
    expect(await confirmCandidate(db, admin, second.candidateId, AFTER)).toMatchObject({ ok: false })
    const [p] = await db.select().from(monthPlans).where(eq(monthPlans.id, plan.id))
    expect(p!.confirmedBy).toBe(admin.id)
  })
})
