// 3-13: 생성 작업 실행 방법. Cloud Run에서는 Cloud Tasks가 web의 run.app 작업 엔드포인트를 부른다 — Firebase Hosting의
// 60초 제한을 거치지 않고, 그 요청이 이어지는 동안 CPU가 할당된다. 큐 설정이 없으면(VM·로컬·E2E) 같은 프로세스에서 바로 실행
const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'

type Env = Record<string, string | undefined>
type Deps = { run: (jobId: string) => Promise<void>; fetchFn?: typeof fetch }

export async function dispatchGeneration(jobId: string, env: Env, deps: Deps): Promise<void> {
  const queue = env.GENERATION_QUEUE
  if (!queue) {
    void deps
      .run(jobId)
      .catch((e) => console.error('generation_job_inline_failed', { jobId, error: String(e) }))
    return
  }
  const f = deps.fetchFn ?? fetch
  const t = await f(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } })
  if (!t.ok) throw new Error(`액세스 토큰을 받지 못했습니다 (HTTP ${t.status})`)
  const { access_token } = (await t.json()) as { access_token: string }
  const r = await f(`https://cloudtasks.googleapis.com/v2/${queue}/tasks`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      task: {
        dispatchDeadline: '300s',
        httpRequest: {
          url: env.GENERATION_TASK_URL,
          httpMethod: 'POST',
          headers: { 'x-duty-task-key': env.GENERATION_TASK_KEY ?? '', 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
        },
      },
    }),
  })
  if (!r.ok) throw new Error(`Cloud Tasks에 작업을 넣지 못했습니다 (HTTP ${r.status})`)
}
