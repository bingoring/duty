import { afterEach, describe, expect, it } from 'vitest'
import { POST } from './route'

// 3-13: Cloud Tasks만 부르는 작업 엔드포인트 — 비밀 키가 없거나 틀리면 아무것도 실행하지 않는다
const req = (headers: Record<string, string>, body: unknown) =>
  new Request('http://x/api/generate/run', { method: 'POST', headers, body: JSON.stringify(body) })
const prev = process.env.GENERATION_TASK_KEY
afterEach(() => {
  process.env.GENERATION_TASK_KEY = prev
})

describe('/api/generate/run', () => {
  it('서버에 키가 설정되지 않았으면 403', async () => {
    delete process.env.GENERATION_TASK_KEY
    expect((await POST(req({ 'x-duty-task-key': '' }, { jobId: 'x' }))).status).toBe(403)
  })
  it('키가 없거나 틀리면 403', async () => {
    process.env.GENERATION_TASK_KEY = 'right'
    expect((await POST(req({}, { jobId: 'x' }))).status).toBe(403)
    expect((await POST(req({ 'x-duty-task-key': 'wrong' }, { jobId: 'x' }))).status).toBe(403)
  })
  it('키가 맞아도 작업 ID 형식이 틀리면 400', async () => {
    process.env.GENERATION_TASK_KEY = 'right'
    expect((await POST(req({ 'x-duty-task-key': 'right' }, { jobId: 'not-a-uuid' }))).status).toBe(400)
  })
})
