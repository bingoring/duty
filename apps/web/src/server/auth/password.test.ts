import { describe, expect, it } from 'vitest'
import { hashPassword, validateNewPassword, verifyPassword } from './password'

describe('비밀번호 해시', () => {
  it('argon2id PHC 문자열을 만들고 검증한다', async () => {
    const hash = await hashPassword('correct-horse')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(hash, 'correct-horse')).toBe(true)
  })
  it('틀린 비밀번호는 false', async () => {
    const hash = await hashPassword('correct-horse')
    expect(await verifyPassword(hash, 'wrong-horse')).toBe(false)
  })
  it('손상된 해시는 예외 없이 false', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false)
  })
})

describe('새 비밀번호 정책', () => {
  const ctx = { employeeNo: '00103' }
  it('8자 미만을 거부한다', () => {
    expect(validateNewPassword('short77', 'short77', ctx)).toEqual({
      field: 'next',
      message: '비밀번호는 8자 이상이어야 합니다.',
    })
  })
  it('72자 초과를 거부한다', () => {
    const long = 'a'.repeat(73)
    expect(validateNewPassword(long, long, ctx)?.field).toBe('next')
  })
  it('사번과 같으면 거부한다', () => {
    const ctx8 = { employeeNo: '20190412' }
    expect(validateNewPassword('20190412', '20190412', ctx8)).toEqual({
      field: 'next',
      message: '사번과 다른 비밀번호를 사용해 주세요.',
    })
  })
  it('현재 비밀번호와 같으면 거부한다', () => {
    expect(validateNewPassword('samesame1', 'samesame1', { ...ctx, current: 'samesame1' })).toEqual({
      field: 'next',
      message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
    })
  })
  it('확인 값이 다르면 거부한다', () => {
    expect(validateNewPassword('goodpass1', 'goodpass2', ctx)).toEqual({
      field: 'confirm',
      message: '비밀번호가 서로 다릅니다.',
    })
  })
  it('정책을 만족하면 null', () => {
    expect(validateNewPassword('goodpass1', 'goodpass1', ctx)).toBeNull()
  })
})
