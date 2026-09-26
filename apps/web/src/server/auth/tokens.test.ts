import { describe, expect, it } from 'vitest'
import {
  generateSessionToken,
  hashSessionToken,
  generateTempPassword,
  safeNext,
  TEMP_PASSWORD_ALPHABET,
} from './tokens'

describe('세션 토큰', () => {
  it('32바이트 base64url 토큰을 만든다', () => {
    const t = generateSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateSessionToken()).not.toBe(t)
  })
  it('해시는 64자 hex이고 원본과 다르며 결정적이다', () => {
    const t = generateSessionToken()
    const h = hashSessionToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toBe(t)
    expect(hashSessionToken(t)).toBe(h)
  })
})

describe('임시 비밀번호', () => {
  it('12자이고 혼동 문자(0 O o 1 l I)를 쓰지 않는다', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword()
      expect(p).toHaveLength(12)
      expect(p).not.toMatch(/[0Oo1lI]/)
      for (const ch of p) expect(TEMP_PASSWORD_ALPHABET).toContain(ch)
    }
  })
})

describe('safeNext (오픈 리다이렉트 방지)', () => {
  it('내부 경로는 그대로 둔다', () => {
    expect(safeNext('/admin/staff?x=1')).toBe('/admin/staff?x=1')
  })
  it('외부 URL·프로토콜 상대 경로·빈 값은 /로 바꾼다', () => {
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
    expect(safeNext(null)).toBe('/')
    expect(safeNext('')).toBe('/')
  })
  it('로그인·비밀번호 화면으로 되돌아가지 않는다', () => {
    expect(safeNext('/login')).toBe('/')
    expect(safeNext('/password')).toBe('/')
  })
})
