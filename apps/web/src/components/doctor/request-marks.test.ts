import { describe, expect, it } from 'vitest'
import { draftDot, lockedForActor, requestDot } from './request-marks'

// 3-11 4: 신청 칩 점 · 관리자 입력 잠금
describe('신청 점', () => {
  it('본인 입력 = 빨강(self), 관리자가 대신 = 파랑(admin)', () => {
    expect(requestDot({ byAdmin: false })).toBe('self')
    expect(requestDot({ byAdmin: true })).toBe('admin')
  })
  it('저장 전: 관리자가 자기 것을 넣으면 self, 다른 의사 것이면 admin', () => {
    expect(draftDot('u1', 'u1')).toBe('self')
    expect(draftDot('admin', 'u1')).toBe('admin')
  })
})

describe('관리자 입력 잠금', () => {
  it('관리자가 넣은 신청은 의사에게 잠기고 관리자에게는 열린다', () => {
    expect(lockedForActor({ byAdmin: true }, { role: 'member' })).toBe(true)
    expect(lockedForActor({ byAdmin: true }, { role: 'admin' })).toBe(false)
    expect(lockedForActor({ byAdmin: false }, { role: 'member' })).toBe(false)
    expect(lockedForActor(undefined, { role: 'member' })).toBe(false)
  })
})
