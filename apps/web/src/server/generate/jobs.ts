import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import type { Priorities } from './input'
import type { Db } from '../db/client'
import { generationJobs } from '../db/schema'
import type { Actor } from '../requests/service'
import type { YearMonth } from '../schedule/month'
import { generate, type GenerateFailure, type GenerateResult } from './service'

// 3-13 간호사 근무표 생성 작업. Firebase Hosting의 60초 제한 때문에 생성 버튼은 작업만 만들고 바로 돌아온다.
// 실행은 Cloud Tasks(→ /api/generate/run) 또는 같은 프로세스(VM·로컬·E2E), 화면은 readGenerationJob으로 진행을 확인한다
const STALE_MS = 5 * 60_000
const STALE = sql`now() - interval '5 minutes'`
const ACTIVE = ['queued', 'running'] as const

export type GenerationJobView = {
  status: 'queued' | 'running' | 'done' | 'failed'
  result: GenerateResult | null
}

const stopped: GenerateFailure = {
  ok: false,
  kind: 'unknown',
  message: '생성이 멈췄습니다. 다시 시도해 주세요.',
}
const crashed: GenerateFailure = {
  ok: false,
  kind: 'unknown',
  message: '생성 중 오류가 났습니다. 다시 시도해 주세요.',
}

export async function startGeneration(
  db: Db,
  actor: Actor,
  ym: YearMonth,
  priorities: Priorities,
  today: string,
): Promise<{ ok: true; jobId: string } | GenerateFailure> {
  if (actor.role !== 'admin') return { ok: false, kind: 'blocked', message: '권한이 없습니다.' }
  // 5분 넘게 갱신이 없는 진행 작업은 멈춘 것으로 보고 끝낸다(실행하던 인스턴스가 사라진 경우)
  await db
    .update(generationJobs)
    .set({ status: 'failed', result: stopped, updatedAt: sql`now()` })
    .where(
      and(
        eq(generationJobs.year, ym.year),
        eq(generationJobs.month, ym.month),
        inArray(generationJobs.status, [...ACTIVE]),
        lt(generationJobs.updatedAt, STALE),
      ),
    )
  const [row] = await db
    .insert(generationJobs)
    .values({ year: ym.year, month: ym.month, priorities, today, createdBy: actor.id })
    .onConflictDoNothing()
    .returning({ id: generationJobs.id })
  if (!row)
    return { ok: false, kind: 'busy', message: '다른 생성이 진행 중입니다. 끝난 뒤 다시 시도해 주세요.' }
  return { ok: true, jobId: row.id }
}

// 대기 중인 작업만 가져가 실행한다 — 끝난 작업을 다시 불러도(Cloud Tasks 재시도) 아무것도 하지 않는다
export async function runGenerationJob(db: Db, jobId: string): Promise<void> {
  const [job] = await db
    .update(generationJobs)
    .set({ status: 'running', updatedAt: sql`now()` })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, 'queued')))
    .returning()
  if (!job) return
  let result: GenerateResult
  try {
    result = await generate(
      db,
      { id: job.createdBy, role: 'admin' },
      { year: job.year, month: job.month },
      { priorities: job.priorities as Priorities, today: job.today },
    )
  } catch (e) {
    console.error('generation_job_failed', { jobId, error: e instanceof Error ? e.message : String(e) })
    await db
      .update(generationJobs)
      .set({ status: 'failed', result: crashed, updatedAt: sql`now()` })
      .where(eq(generationJobs.id, jobId))
    return
  }
  await db
    .update(generationJobs)
    .set({ status: 'done', result, updatedAt: sql`now()` })
    .where(eq(generationJobs.id, jobId))
}

export async function readGenerationJob(db: Db, jobId: string): Promise<GenerationJobView | null> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId))
  if (!job) return null
  if (
    (job.status === 'queued' || job.status === 'running') &&
    Date.now() - job.updatedAt.getTime() > STALE_MS
  )
    return { status: 'failed', result: stopped }
  return { status: job.status, result: (job.result as GenerateResult | null) ?? null }
}

// 생성 화면을 다시 열었을 때 이어서 볼 진행 중 작업
export async function activeGenerationJob(db: Db, ym: YearMonth): Promise<string | null> {
  const [job] = await db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.year, ym.year),
        eq(generationJobs.month, ym.month),
        inArray(generationJobs.status, [...ACTIVE]),
        gt(generationJobs.updatedAt, STALE),
      ),
    )
    .orderBy(desc(generationJobs.createdAt))
    .limit(1)
  return job?.id ?? null
}
