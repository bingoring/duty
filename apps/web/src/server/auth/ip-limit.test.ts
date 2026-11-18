import { describe, expect, it } from 'vitest'
import { clientIp, IpLimiter } from './ip-limit'

// Build Spec 3-1 R-OPS-7
const T0 = Date.parse('2026-10-08T09:00:00+09:00')
const min = (n: number) => T0 + n * 60_000

describe('IpLimiter', () => {
  it('10분 안에 20회 실패하면 그 IP를 10분 막고, 다른 IP는 영향 없다', () => {
    const l = new IpLimiter()
    for (let i = 0; i < 20; i++) l.recordFailure('1.1.1.1', min(i * 0.4))
    expect(l.blockedUntil('1.1.1.1', min(8))).toBe(min(7.6 + 10))
    expect(l.blockedUntil('2.2.2.2', min(8))).toBeNull()
    expect(l.blockedUntil('1.1.1.1', min(18))).toBeNull()
  })
  it('10분이 지난 실패는 세지 않는다', () => {
    const l = new IpLimiter()
    for (let i = 0; i < 19; i++) l.recordFailure('1.1.1.1', min(0))
    l.recordFailure('1.1.1.1', min(11))
    expect(l.blockedUntil('1.1.1.1', min(11))).toBeNull()
  })
})

describe('clientIp', () => {
  it('Caddy가 넣은 X-Forwarded-For의 마지막 값(앞쪽은 사용자가 꾸밀 수 있다)', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 3.3.3.3' }))).toBe('3.3.3.3')
    expect(clientIp(new Headers({ 'x-forwarded-for': '3.3.3.3' }))).toBe('3.3.3.3')
  })
  it('프록시를 거치지 않은 요청(개발·테스트)은 null — 제한하지 않는다', () => {
    expect(clientIp(new Headers())).toBeNull()
  })
})

// 3-13: Firebase Hosting 뒤에서는 프록시가 더 붙으므로 믿을 프록시 수를 받는다(기본 1 = 지금처럼 마지막 값)
describe('clientIp — TRUSTED_PROXY_HOPS', () => {
  const h = new Headers({ 'x-forwarded-for': 'a, b, c' })
  it('뒤에서 hops번째', () => {
    expect(clientIp(h, 1)).toBe('c')
    expect(clientIp(h, 2)).toBe('b')
  })
  it('값이 모자라면 첫 값, 헤더가 없으면 null', () => {
    expect(clientIp(h, 5)).toBe('a')
    expect(clientIp(new Headers(), 2)).toBeNull()
  })
})
