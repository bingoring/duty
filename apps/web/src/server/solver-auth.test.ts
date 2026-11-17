import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSolverTokenCache, solverHeaders } from './solver-auth'

// 3-13: Cloud Run 솔버는 비공개 — web 서비스 계정의 ID 토큰(메타데이터 서버)을 붙인다. http(VM·로컬·CI)는 토큰 없이
const ok = (text: string) => new Response(text, { status: 200 })

beforeEach(() => resetSolverTokenCache())

describe('solverHeaders', () => {
  it('http면 헤더 없음, 메타데이터 서버를 부르지 않는다', async () => {
    const f = vi.fn()
    expect(await solverHeaders('http://solver:8100', f as unknown as typeof fetch)).toEqual({})
    expect(f).not.toHaveBeenCalled()
  })
  it('https면 ID 토큰을 받아 붙이고 50분 캐시한다', async () => {
    const f = vi.fn(async () => ok('tok-1'))
    let t = 0
    const now = () => t
    const url = 'https://duty-solver-abc-du.a.run.app'
    expect(await solverHeaders(url, f as unknown as typeof fetch, now)).toEqual({
      authorization: 'Bearer tok-1',
    })
    expect(f).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(calledUrl).toBe(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' +
        encodeURIComponent(url),
    )
    expect(new Headers(init.headers).get('metadata-flavor')).toBe('Google')
    t = 49 * 60_000
    await solverHeaders(url, f as unknown as typeof fetch, now)
    expect(f).toHaveBeenCalledTimes(1)
    t = 51 * 60_000
    f.mockImplementation(async () => ok('tok-2'))
    expect(await solverHeaders(url, f as unknown as typeof fetch, now)).toEqual({
      authorization: 'Bearer tok-2',
    })
    expect(f).toHaveBeenCalledTimes(2)
  })
})
