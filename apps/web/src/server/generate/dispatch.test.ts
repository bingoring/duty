import { describe, expect, it, vi } from 'vitest'
import { dispatchGeneration } from './dispatch'

// 3-13: Cloud Run에서는 Cloud Tasks가 run.app 작업 엔드포인트를 부르고(60초 제한 없음), 그 외에는 같은 프로세스에서 바로 실행
const JOB = '11111111-1111-4111-8111-111111111111'

describe('dispatchGeneration', () => {
  it('큐 설정이 없으면 같은 프로세스에서 실행', async () => {
    const run = vi.fn(async () => {})
    const fetchFn = vi.fn()
    await dispatchGeneration(JOB, {}, { run, fetchFn: fetchFn as unknown as typeof fetch })
    expect(run).toHaveBeenCalledWith(JOB)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('큐 설정이 있으면 Cloud Tasks에 작업을 넣고 직접 실행하지 않는다', async () => {
    const run = vi.fn(async () => {})
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('metadata')
        ? new Response(JSON.stringify({ access_token: 'at-1' }))
        : new Response('{}', { status: 200 }),
    )
    const env = {
      GENERATION_QUEUE: 'projects/p/locations/asia-northeast3/queues/duty-generate',
      GENERATION_TASK_URL: 'https://duty-web-x.a.run.app/api/generate/run',
      GENERATION_TASK_KEY: 'secret-key',
    }
    await dispatchGeneration(JOB, env, { run, fetchFn: fetchFn as unknown as typeof fetch })
    expect(run).not.toHaveBeenCalled()
    const [url, init] = fetchFn.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://cloudtasks.googleapis.com/v2/projects/p/locations/asia-northeast3/queues/duty-generate/tasks',
    )
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer at-1')
    const task = JSON.parse(String(init.body)).task
    expect(task.dispatchDeadline).toBe('300s')
    expect(task.httpRequest).toMatchObject({
      url: env.GENERATION_TASK_URL,
      httpMethod: 'POST',
      headers: { 'x-duty-task-key': 'secret-key', 'content-type': 'application/json' },
    })
    expect(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString())).toEqual({ jobId: JOB })
  })

  it('Cloud Tasks가 거부하면 오류', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('metadata')
        ? new Response(JSON.stringify({ access_token: 'at-1' }))
        : new Response('nope', { status: 403 }),
    )
    await expect(
      dispatchGeneration(
        JOB,
        {
          GENERATION_QUEUE: 'q',
          GENERATION_TASK_URL: 'https://x/api/generate/run',
          GENERATION_TASK_KEY: 'k',
        },
        { run: vi.fn(), fetchFn: fetchFn as unknown as typeof fetch },
      ),
    ).rejects.toThrow()
  })
})
