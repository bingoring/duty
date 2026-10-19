import { checkSchedule, DEFAULT_RULES } from '@duty/domain'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { holidays, scheduleCandidates, trainings, users } from '../db/schema'
import { ensureRequestPlan, findPlan } from '../requests/plan'
import { decideLeave, saveLeave, submitRequests } from '../requests/service'
import { seedDev } from '../seed/dev'
import { assembleCells, buildGenerationInput, toSolverRequest } from './input'
import { confirmCandidate, generate, type GenerateResult } from './service'
import { callSolver } from './solver-client'

// Build Spec 2-6 business-rules §5 교차 검증: 솔버 안을 TS 검사기로 다시 보면 하드 위반 0.
// generate()는 재검사에서 하드 위반이 나오면 저장하지 않고 kind 'invalid'를 돌려주므로 ok = 검사 통과다.
const db = setupTestDb()
const BEFORE = '2026-10-05'
const AFTER = '2026-10-16'
const NOV = { year: 2026, month: 11 }
const ALL = {
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
async function approveSick(no: string, startDate: string, endDate: string) {
  const admin = await actor('00101')
  const n = await actor(no)
  const l = await saveLeave(db, n, { userId: n.id, type: 'sick', startDate, endDate }, BEFORE)
  if (!l.ok) throw new Error(l.message)
  await submitRequests(db, n, NOV, BEFORE)
  await decideLeave(db, admin, l.id, { decision: 'approve' })
}
async function hardOf(r: GenerateResult) {
  if (!r.ok) throw new Error(JSON.stringify(r))
  const [c] = await db.select().from(scheduleCandidates).where(eq(scheduleCandidates.id, r.candidateId))
  return c!.checkResult.hardViolations
}

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, NOV, BEFORE, DEFAULT_RULES)
})

describe('교차 검증 (CI)', { timeout: 120_000 }, () => {
  it('nov-2026 → dec-2026: 11월을 확정하면 12월은 11월 말을 전월로 이어 받는다', async () => {
    const admin = await actor('00101')
    const nov = await generate(db, admin, NOV, { priorities: ALL, seed: 5, today: AFTER })
    expect(await hardOf(nov)).toEqual([])
    if (!nov.ok) return
    expect(await confirmCandidate(db, admin, nov.candidateId, AFTER)).toEqual({ ok: true })

    const DEC = { year: 2026, month: 12 }
    const dec = await generate(db, admin, DEC, { priorities: ALL, seed: 6, today: '2026-11-16' })
    expect(await hardOf(dec)).toEqual([])
    const g = await buildGenerationInput(db, (await findPlan(db, DEC))!)
    expect(g.prevMonthConfirmed).toBe(true)
    expect(g.base.prevTail.length).toBeGreaterThan(0)
  })

  it('trainee: 신규 3인 근무 3주 + 프리셉터 동일 근무', async () => {
    const admin = await actor('00101')
    const trainee = await actor('00111')
    const preceptor = await actor('00103')
    await db.insert(trainings).values({
      traineeId: trainee.id,
      preceptorId: preceptor.id,
      kind: 'new_grad',
      startDate: '2026-11-02',
      endDate: '2027-02-01',
      tripleStaffUntil: '2026-11-22',
      createdBy: admin.id,
    })
    const r = await generate(db, admin, NOV, { priorities: ALL, seed: 7, today: AFTER })
    expect(await hardOf(r)).toEqual([])
  })

  it('holidays: 빨간 날 5일이 이어지는 달', async () => {
    const admin = await actor('00101')
    await db.insert(holidays).values(
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((date) => ({
        date,
        name: '연휴(테스트)',
        kind: 'hospital',
        source: 'admin',
      })),
    )
    const r = await generate(db, admin, NOV, { priorities: ALL, seed: 8, today: AFTER })
    expect(await hardOf(r)).toEqual([])
  })

  it('short: 3명 장기 병가 — 풀리면 하드 위반 0, 아니면 불가능 판정 (검사기 불일치는 없음)', async () => {
    const admin = await actor('00101')
    await approveSick('00102', '2026-11-09', '2026-11-20')
    await approveSick('00104', '2026-11-09', '2026-11-20')
    await approveSick('00107', '2026-11-09', '2026-11-20')
    const r = await generate(db, admin, NOV, { priorities: ALL, seed: 9, today: AFTER })
    if (r.ok) expect(await hardOf(r)).toEqual([])
    else expect(r.kind).toBe('infeasible')
  })

  it('paper-oct: 종이 10월 조건(공휴일 3일)으로 다시 풀어도 하드 위반 0', async () => {
    const oct = (await findPlan(db, { year: 2026, month: 10 }))!
    const g = await buildGenerationInput(db, oct)
    const out = await callSolver(toSolverRequest(g, { seed: 10, timeLimitSec: 4, priorities: ALL }))
    expect(out.kind).toBe('solved')
    if (out.kind !== 'solved') return
    const cells = assembleCells(g, out.res.cells)
    expect(checkSchedule({ ...g.input, cells }).hardViolations).toEqual([])
  })
})
