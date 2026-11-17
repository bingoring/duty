import { DEFAULT_RULES } from '@duty/domain'
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, setupTestDb } from '../../test/db'
import { generationJobs, scheduleCandidates, users } from '../db/schema'
import { ensureRequestPlan } from '../requests/plan'
import { decideLeave, saveLeave, submitRequests } from '../requests/service'
import { seedDev } from '../seed/dev'
import { activeGenerationJob, readGenerationJob, runGenerationJob, startGeneration } from './jobs'

// 3-13: 근무표 생성은 작업 행 + 실행(Cloud Tasks 또는 같은 프로세스) + 화면의 진행 확인. Firebase 60초 제한 대비
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
const candidates = async () => (await db.select().from(scheduleCandidates)).length

beforeEach(async () => {
  await resetDb(db)
  await seedDev(db)
  await ensureRequestPlan(db, NOV, BEFORE, DEFAULT_RULES)
})

describe('근무표 생성 작업', { timeout: 120_000 }, () => {
  it('시작 → 실행 → 완료와 생성안, 다시 실행해도 생성안이 늘지 않는다', async () => {
    const admin = await actor('00101')
    const { jobId } = ok(await startGeneration(db, admin, NOV, PRIORITIES, AFTER))
    expect(await activeGenerationJob(db, NOV)).toBe(jobId)
    expect((await readGenerationJob(db, jobId))?.status).toBe('queued')
    await runGenerationJob(db, jobId)
    const done = await readGenerationJob(db, jobId)
    expect(done?.status).toBe('done')
    expect(done?.result).toMatchObject({ ok: true })
    expect(await activeGenerationJob(db, NOV)).toBeNull()
    const n = await candidates()
    await runGenerationJob(db, jobId)
    expect(await candidates()).toBe(n)
  })

  it('같은 달이 진행 중이면 busy, 5분 넘게 멈춘 작업은 실패로 보고 새로 시작한다', async () => {
    const admin = await actor('00101')
    const first = ok(await startGeneration(db, admin, NOV, PRIORITIES, AFTER))
    expect(await startGeneration(db, admin, NOV, PRIORITIES, AFTER)).toMatchObject({
      ok: false,
      kind: 'busy',
    })
    await db
      .update(generationJobs)
      .set({ updatedAt: sql`now() - interval '6 minutes'` })
      .where(eq(generationJobs.id, first.jobId))
    expect((await readGenerationJob(db, first.jobId))?.status).toBe('failed')
    const second = ok(await startGeneration(db, admin, NOV, PRIORITIES, AFTER))
    expect(second.jobId).not.toBe(first.jobId)
  })

  it('해가 없으면 작업은 완료, 결과에 원인(실패로 버리지 않는다)', async () => {
    const admin = await actor('00101')
    for (const no of ['00102', '00103', '00104', '00105', '00106', '00107', '00108']) {
      const n = await actor(no)
      const l = ok(await saveLeave(db, n, { userId: n.id, type: 'sick', startDate: '2026-11-18' }, BEFORE))
      await submitRequests(db, n, NOV, BEFORE)
      ok(await decideLeave(db, admin, l.id, { decision: 'approve' }))
    }
    const { jobId } = ok(await startGeneration(db, admin, NOV, PRIORITIES, AFTER))
    await runGenerationJob(db, jobId)
    const r = await readGenerationJob(db, jobId)
    expect(r?.status).toBe('done')
    expect(r?.result).toMatchObject({ ok: false, kind: 'infeasible' })
  })

  it('관리자가 아니면 시작할 수 없다', async () => {
    const nurse = await actor('00103')
    expect(await startGeneration(db, nurse, NOV, PRIORITIES, AFTER)).toMatchObject({
      ok: false,
      kind: 'blocked',
    })
  })
})
