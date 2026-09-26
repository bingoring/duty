import { describe, expect, it } from 'vitest'
import { classifyHoliday, fetchRestDays, restDeUrl } from './api'

const ok = (item: unknown) =>
  (async () =>
    new Response(
      JSON.stringify({
        response: {
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
          body: { items: item === '' ? '' : { item }, totalCount: 1 },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch

describe('classifyHoliday (R-HOL-API-1)', () => {
  it('이름으로 분류', () => {
    expect(classifyHoliday('개천절')).toBe('public')
    expect(classifyHoliday('대체공휴일')).toBe('substitute')
    expect(classifyHoliday('전국동시지방선거')).toBe('election')
    expect(classifyHoliday('노동절')).toBe('labor_day')
  })
})

describe('restDeUrl', () => {
  it('인증키는 한 번만 인코딩한다(Decoding 키를 넣는다)', () => {
    const u = restDeUrl(2026, 'a+b/c==')
    expect(u).toContain('ServiceKey=a%2Bb%2Fc%3D%3D')
    expect(u).toContain('solYear=2026')
    expect(u).toContain('_type=json')
    expect(u).toContain('numOfRows=100')
  })
})

describe('fetchRestDays', () => {
  it('공공기관 휴일만 날짜·이름·분류로', async () => {
    const r = await fetchRestDays(2026, 'k', {
      fetchImpl: ok([
        { dateKind: '01', dateName: '개천절', isHoliday: 'Y', locdate: 20261003, seq: 1 },
        { dateKind: '01', dateName: '대체공휴일', isHoliday: 'Y', locdate: 20261005, seq: 1 },
        { dateKind: '01', dateName: '제헌절', isHoliday: 'N', locdate: 20260717, seq: 1 },
      ]),
    })
    expect(r).toEqual({
      ok: true,
      items: [
        { date: '2026-10-03', name: '개천절', kind: 'public' },
        { date: '2026-10-05', name: '대체공휴일', kind: 'substitute' },
      ],
    })
  })

  it('항목이 하나면 객체, 없으면 빈 문자열로 온다', async () => {
    const one = await fetchRestDays(2026, 'k', {
      fetchImpl: ok({ dateName: '한글날', isHoliday: 'Y', locdate: 20261009 }),
    })
    expect(one).toEqual({ ok: true, items: [{ date: '2026-10-09', name: '한글날', kind: 'public' }] })
    expect(await fetchRestDays(2026, 'k', { fetchImpl: ok('') })).toEqual({ ok: true, items: [] })
  })

  it('같은 날짜가 두 번 오면 첫 항목만', async () => {
    const r = await fetchRestDays(2026, 'k', {
      fetchImpl: ok([
        { dateName: '설날', isHoliday: 'Y', locdate: 20260217 },
        { dateName: '대체공휴일', isHoliday: 'Y', locdate: 20260217 },
      ]),
    })
    expect(r.ok && r.items.map((i) => i.name)).toEqual(['설날'])
  })

  it('API 오류·HTTP 오류·타임아웃은 ok: false', async () => {
    const apiErr = (async () =>
      new Response(
        JSON.stringify({
          response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED ERROR.' } },
        }),
        {
          status: 200,
        },
      )) as unknown as typeof fetch
    expect(await fetchRestDays(2026, 'k', { fetchImpl: apiErr })).toEqual({
      ok: false,
      message: '공공데이터 API 오류: SERVICE KEY IS NOT REGISTERED ERROR.',
    })
    const http = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    expect(await fetchRestDays(2026, 'k', { fetchImpl: http })).toEqual({
      ok: false,
      message: '공공데이터 API 응답 오류(500)',
    })
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      )) as unknown as typeof fetch
    expect(await fetchRestDays(2026, 'k', { fetchImpl: slow, timeoutMs: 20 })).toEqual({
      ok: false,
      message: '공공데이터 API가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
    })
  })
})
