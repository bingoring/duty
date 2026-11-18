// 3-13: Cloud Tasks만 부르는 근무표 생성 작업 엔드포인트(run.app 주소로 직접 — Firebase 60초 제한 밖).
// 비밀 키(GENERATION_TASK_KEY)가 맞을 때만 실행하고, 실행이 끝날 때까지 응답을 기다리게 한다(그동안 CPU가 할당된다)
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getDb } from '@/server/db/client'
import { runGenerationJob } from '@/server/generate/jobs'

const Body = z.object({ jobId: z.string().uuid() })

function keyOk(given: string | null): boolean {
  const want = process.env.GENERATION_TASK_KEY
  if (!want || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!keyOk(req.headers.get('x-duty-task-key'))) return new Response(null, { status: 403 })
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return new Response(null, { status: 400 })
  await runGenerationJob(getDb(), p.data.jobId)
  return new Response(null, { status: 204 })
}
